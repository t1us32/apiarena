"""
Game Engine — orchestrates the AI battle loop and streams events.
Driven by dynamic ScenarioDef definitions (scenarios/definitions.py).
"""

from __future__ import annotations

import asyncio
import uuid

from models.schemas import (
    BattleConfigRequest,
    BattleState,
    BattleStatus,
    JudgeReport,
    Turn,
)
from scenarios import get_scenario, ScenarioDef
from services.judge_service import judge_battle
from services.llm_service import LLMService

llm_service = LLMService()

# In-memory battle store
_battles: dict[str, BattleState] = {}
_battle_streams: dict[str, asyncio.Queue] = {}


def _emit(stream: asyncio.Queue, event: str, data: dict):
    try:
        stream.put_nowait({"event": event, "data": data})
    except asyncio.QueueFull:
        pass


def _build_history(turns: list[Turn], role: str) -> list[dict]:
    """
    Build chat history for one side.
    'agent_1' sees: user=agent_2's messages, assistant=agent_1's responses
    'agent_2' sees: assistant=agent_2's messages, user=agent_1's responses
    """
    history = []
    for t in turns:
        if role == "agent_2":
            history.append({"role": "assistant", "content": t.agent_2_message})
            history.append({"role": "user", "content": t.agent_1_message})
        else:  # agent_1 or judge
            history.append({"role": "user", "content": t.agent_2_message})
            history.append({"role": "assistant", "content": t.agent_1_message})
    return history


async def run_battle(config: BattleConfigRequest) -> str:
    """Start a battle, return battle_id. The battle runs in the background."""
    scenario = get_scenario(config.scenario_id)
    if scenario is None:
        raise ValueError(f"Unknown scenario: {config.scenario_id}")

    # Use scenario's max_turns if user didn't override
    max_turns = config.max_turns if config.max_turns else scenario.max_turns

    battle_id = uuid.uuid4().hex[:12]
    secret = scenario.pick_secret()

    state = BattleState(
        battle_id=battle_id,
        status=BattleStatus.running,
        scenario_id=scenario.id,
        secret_fact=secret,
        max_turns=max_turns,
        current_turn=0,
    )
    _battles[battle_id] = state
    _battle_streams[battle_id] = asyncio.Queue(maxsize=256)

    asyncio.create_task(_run_battle_loop(battle_id, config, state, scenario, max_turns, secret))

    return battle_id


async def _run_battle_loop(
    battle_id: str,
    config: BattleConfigRequest,
    state: BattleState,
    scenario: ScenarioDef,
    max_turns: int,
    secret: str,
) -> None:
    stream = _battle_streams[battle_id]
    try:
        _emit(stream, "battle_start", {
            "battle_id": battle_id,
            "max_turns": max_turns,
            "scenario": scenario.to_dict(),
        })
        _emit(stream, "status", {
            "battle_id": battle_id,
            "status": "running",
            "current_turn": 0,
            "max_turns": max_turns,
        })

        # Build system prompts (custom overrides default)
        agent_1_system = scenario.build_agent_1_prompt(
            secret=secret, max_turns=max_turns, custom_prompt=config.agent_1.system_prompt
        )
        agent_2_system_base = scenario.build_agent_2_prompt(
            max_turns=max_turns, current_turn=1, custom_prompt=config.agent_2.system_prompt
        )

        for turn_num in range(1, max_turns + 1):
            state.current_turn = turn_num

            # Rebuild agent_2 prompt with current turn number
            agent_2_system = scenario.build_agent_2_prompt(
                max_turns=max_turns, current_turn=turn_num,
                custom_prompt=config.agent_2.system_prompt
            )

            agent_1_history = _build_history(state.turns, "agent_1")
            agent_2_history = _build_history(state.turns, "agent_2")

            # --- Agent 2 (attacker / interrogator / negotiator) goes first ---
            _emit(stream, "generating", {"agent": "agent_2", "turn": turn_num})
            try:
                agent_2_msg = await llm_service.chat(
                    system_prompt=agent_2_system,
                    user_message="It's your turn. Make your move." if turn_num == 1 else "Continue.",
                    config=config.agent_2.llm,
                    history=agent_2_history,
                    temperature=config.temperature,
                )
            except Exception as e:
                _emit(stream, "error", {"message": f"Agent 2 error on turn {turn_num}: {str(e)}"})
                state.status = BattleStatus.error
                state.error_message = str(e)
                _emit(stream, "close", {"battle_id": battle_id})
                return

            _emit(stream, "message", {
                "agent": "agent_2",
                "turn": turn_num,
                "content": agent_2_msg,
                "uid": f"agent_2-{battle_id}-{turn_num}",
            })

            # --- Agent 1 (defender / witness / IT support) responds ---
            _emit(stream, "generating", {"agent": "agent_1", "turn": turn_num})
            try:
                agent_1_msg = await llm_service.chat(
                    system_prompt=agent_1_system,
                    user_message=agent_2_msg,
                    config=config.agent_1.llm,
                    history=agent_1_history,
                    temperature=0.9,
                )
            except Exception as e:
                _emit(stream, "error", {"message": f"Agent 1 error on turn {turn_num}: {str(e)}"})
                state.status = BattleStatus.error
                state.error_message = str(e)
                _emit(stream, "close", {"battle_id": battle_id})
                return

            _emit(stream, "message", {
                "agent": "agent_1",
                "turn": turn_num,
                "content": agent_1_msg,
                "uid": f"agent_1-{battle_id}-{turn_num}",
            })

            turn = Turn(
                turn_number=turn_num,
                agent_1_message=agent_1_msg,
                agent_2_message=agent_2_msg,
            )
            state.turns.append(turn)

            _emit(stream, "turn_complete", {"turn": turn_num, "max_turns": max_turns})
            await asyncio.sleep(0.5)

        # --- Judge phase ---
        _emit(stream, "status", {
            "battle_id": battle_id, "status": "judging",
            "current_turn": max_turns, "max_turns": max_turns,
        })
        _emit(stream, "generating", {"agent": "judge"})

        judge_system = scenario.build_judge_prompt(
            secret=secret, max_turns=max_turns, custom_prompt=config.judge.system_prompt
        )

        judge_config = config.judge.llm
        if not judge_config.api_key:
            judge_config = config.agent_1.llm

        try:
            report: JudgeReport = await judge_battle(
                system_prompt=judge_system,
                turns=state.turns,
                secret=secret,
                judge_config=judge_config,
                max_turns=max_turns,
            )
        except Exception as e:
            _emit(stream, "error", {"message": f"Judge error: {str(e)}"})
            state.status = BattleStatus.error
            state.error_message = str(e)
            _emit(stream, "close", {"battle_id": battle_id})
            return

        state.judge_report = report
        state.status = BattleStatus.complete

        _emit(stream, "judge_report", {
            "verdict": report.verdict.value,
            "justification": report.justification,
            "secret_leaked": report.secret_leaked,
            "leaked_content": report.leaked_content,
            "score_agent_1": report.score_agent_1,
            "score_agent_2": report.score_agent_2,
        })

        _emit(stream, "secret_revealed", {"secret": secret})

        _emit(stream, "status", {
            "battle_id": battle_id, "status": "complete",
            "current_turn": max_turns, "max_turns": max_turns,
        })
        _emit(stream, "close", {"battle_id": battle_id})

    except Exception as e:
        state.status = BattleStatus.error
        state.error_message = str(e)
        _emit(stream, "error", {"message": f"Unexpected error: {str(e)}"})
        _emit(stream, "close", {"battle_id": battle_id})


def get_battle(battle_id: str) -> BattleState | None:
    return _battles.get(battle_id)


def get_battle_stream(battle_id: str) -> asyncio.Queue | None:
    return _battle_streams.get(battle_id)


def cleanup_battle(battle_id: str):
    _battles.pop(battle_id, None)
    _battle_streams.pop(battle_id, None)
