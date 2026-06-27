"""
Multiplayer Matchmaking & Game Room Manager

- Matchmaking queue: FIFO, pairs two waiting players via a single background loop
- Game rooms: manages 30s prep phase, prompts, game loop, broadcasting
- Each game room broadcasts to BOTH players via WebSockets
- WebSockets are NOT closed by the room — the ws.py handler manages lifecycle
"""

from __future__ import annotations

import asyncio
import random
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import WebSocket

from models.schemas import JudgeReport, LLMProvider, ModelConfig, Turn, Verdict
from scenarios import list_scenarios, ScenarioDef
from services.judge_service import judge_battle
from services.llm_service import LLMService

llm_service = LLMService()

PREP_TIMEOUT = 80


# ── Player record ─────────────────────────────────────────────────────

@dataclass
class Player:
    ws: WebSocket
    player_id: str
    provider: str
    model_name: str
    api_key: str
    api_base: Optional[str] = None
    compact_mode: bool = False


# ── Game Room ─────────────────────────────────────────────────────────

class GameRoom:
    def __init__(self, game_id: str, player_1: Player, player_2: Player):
        self.game_id = game_id
        self.player_1 = player_1
        self.player_2 = player_2
        self.scenario: Optional[ScenarioDef] = None
        self.secret: str = ""
        self.prompt_1: Optional[str] = None
        self.prompt_2: Optional[str] = None
        self.turns: list[Turn] = []
        self.judge_report: Optional[JudgeReport] = None
        self.phase: str = "lobby"  # lobby | prep | battle | judging | done | aborted
        self._done = asyncio.Event()

    async def send(self, player: Player, event: str, data: dict):
        try:
            await player.ws.send_json({"event": event, "data": data})
        except Exception as e:
            print(f"[matchmaking] send failed for {player.player_id} event={event}: {e}")

    async def broadcast(self, event: str, data: dict):
        await self.send(self.player_1, event, data)
        await self.send(self.player_2, event, data)

    async def run(self):
        try:
            scenarios = list_scenarios()
            self.scenario = random.choice(scenarios)
            self.secret = self.scenario.pick_secret()

            swap = random.random() < 0.5
            p1_role = "agent_2" if swap else "agent_1"
            p2_role = "agent_1" if swap else "agent_2"

            await self.send(self.player_1, "match_found", {
                "game_id": self.game_id,
                "scenario": self.scenario.to_dict(),
                "your_role": p1_role,
                "opponent_model": self.player_2.model_name,
            })
            await self.send(self.player_2, "match_found", {
                "game_id": self.game_id,
                "scenario": self.scenario.to_dict(),
                "your_role": p2_role,
                "opponent_model": self.player_1.model_name,
            })

            await asyncio.sleep(0.6)

            # ── Prep phase ──────────────────────────────────────────
            self.phase = "prep"
            await self.broadcast("prep_start", {
                "game_id": self.game_id,
                "timeout": PREP_TIMEOUT,
            })

            deadline = asyncio.get_event_loop().time() + PREP_TIMEOUT
            while (self.prompt_1 is None or self.prompt_2 is None):
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    break
                await asyncio.sleep(0.3)

            prompt_1 = self.prompt_1 or self.scenario.agent_1_user_default
            prompt_2 = self.prompt_2 or self.scenario.agent_2_user_default

            agent_1_prompt = prompt_1 if p1_role == "agent_1" else prompt_2
            agent_2_prompt = prompt_2 if p2_role == "agent_2" else prompt_1

            agent_1_llm = ModelConfig(
                provider=self._to_provider(self.player_1.provider if p1_role == "agent_1" else self.player_2.provider),
                model_name=self.player_1.model_name if p1_role == "agent_1" else self.player_2.model_name,
                api_key=self.player_1.api_key if p1_role == "agent_1" else self.player_2.api_key,
            )
            agent_2_llm = ModelConfig(
                provider=self._to_provider(self.player_2.provider if p2_role == "agent_2" else self.player_1.provider),
                model_name=self.player_2.model_name if p2_role == "agent_2" else self.player_1.model_name,
                api_key=self.player_2.api_key if p2_role == "agent_2" else self.player_1.api_key,
            )
            judge_llm = agent_1_llm

            compact = self.player_1.compact_mode or self.player_2.compact_mode
            compact_limit = ""
            if compact:
                compact_limit = (
                    "\n\n[ОГРАНИЧЕНИЕ]: Отвечай ПРЕДЕЛЬНО КОРОТКО — "
                    "ровно одно предложение, не более 80 символов. "
                    "Без предисловий, пояснений и вежливостей. Только суть."
                )

            await self.broadcast("prep_complete", {"game_id": self.game_id})
            await asyncio.sleep(0.5)

            # ── Battle phase ────────────────────────────────────────
            self.phase = "battle"
            max_turns = self.scenario.max_turns
            secret = self.secret

            agent_1_system = self.scenario.build_agent_1_prompt(
                secret=secret, max_turns=max_turns, custom_prompt=agent_1_prompt
            ) + compact_limit

            for turn_num in range(1, max_turns + 1):
                agent_2_system = self.scenario.build_agent_2_prompt(
                    max_turns=max_turns, current_turn=turn_num, custom_prompt=agent_2_prompt
                ) + compact_limit
                agent_1_history = self._build_history("agent_1")
                agent_2_history = self._build_history("agent_2")

                await self.broadcast("generating", {"agent": "agent_2", "turn": turn_num})
                try:
                    msg_2 = await llm_service.chat(
                        system_prompt=agent_2_system,
                        user_message="It's your turn. Make your move." if turn_num == 1 else "Continue.",
                        config=agent_2_llm,
                        history=agent_2_history,
                        temperature=0.7,
                    )
                except Exception as e:
                    await self.broadcast("error", {"message": f"Agent 2 error: {e}"})
                    self.phase = "aborted"
                    return

                await self.broadcast("message", {
                    "agent": "agent_2", "turn": turn_num,
                    "content": msg_2, "uid": f"agent_2-{self.game_id}-{turn_num}",
                })

                await self.broadcast("generating", {"agent": "agent_1", "turn": turn_num})
                try:
                    msg_1 = await llm_service.chat(
                        system_prompt=agent_1_system,
                        user_message=msg_2,
                        config=agent_1_llm,
                        history=agent_1_history,
                        temperature=0.9,
                    )
                except Exception as e:
                    await self.broadcast("error", {"message": f"Agent 1 error: {e}"})
                    self.phase = "aborted"
                    return

                await self.broadcast("message", {
                    "agent": "agent_1", "turn": turn_num,
                    "content": msg_1, "uid": f"agent_1-{self.game_id}-{turn_num}",
                })

                self.turns.append(Turn(
                    turn_number=turn_num,
                    agent_1_message=msg_1,
                    agent_2_message=msg_2,
                ))
                await self.broadcast("turn_complete", {"turn": turn_num, "max_turns": max_turns})
                await asyncio.sleep(0.4)

            # ── Judge phase ─────────────────────────────────────────
            self.phase = "judging"
            await self.broadcast("generating", {"agent": "judge"})

            judge_system = self.scenario.build_judge_prompt(
                secret=secret, max_turns=max_turns, custom_prompt=""
            )

            try:
                report = await judge_battle(
                    system_prompt=judge_system,
                    turns=self.turns,
                    secret=secret,
                    judge_config=judge_llm,
                    max_turns=max_turns,
                )
            except Exception as e:
                await self.broadcast("error", {"message": f"Judge error: {e}"})
                self.phase = "aborted"
                return

            self.judge_report = report
            self.phase = "done"

            await self.broadcast("judge_report", {
                "verdict": report.verdict.value,
                "justification": report.justification,
                "secret_leaked": report.secret_leaked,
                "leaked_content": report.leaked_content,
                "score_agent_1": report.score_agent_1,
                "score_agent_2": report.score_agent_2,
            })
            await self.broadcast("secret_revealed", {"secret": secret})
            await self.broadcast("game_over", {"game_id": self.game_id})

        except Exception as e:
            self.phase = "aborted"
            await self.broadcast("error", {"message": f"Unexpected error: {e}"})
        finally:
            self._done.set()
            # DO NOT close WebSockets here — ws.py manages the lifecycle

    def submit_prompt(self, player_id: str, prompt: str):
        if player_id == self.player_1.player_id:
            self.prompt_1 = prompt
        elif player_id == self.player_2.player_id:
            self.prompt_2 = prompt

    def _build_history(self, role: str) -> list[dict]:
        history = []
        for t in self.turns:
            if role == "agent_2":
                history.append({"role": "assistant", "content": t.agent_2_message})
                history.append({"role": "user", "content": t.agent_1_message})
            else:
                history.append({"role": "user", "content": t.agent_2_message})
                history.append({"role": "assistant", "content": t.agent_1_message})
        return history

    @staticmethod
    def _to_provider(raw: str) -> LLMProvider:
        try:
            return LLMProvider(raw)
        except ValueError:
            return LLMProvider.openai


# ── Matchmaking Manager ────────────────────────────────────────────────

class MatchmakingManager:
    def __init__(self):
        self._queue: asyncio.Queue[Player] = asyncio.Queue()
        self._rooms: dict[str, GameRoom] = {}
        self._player_rooms: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._matcher_started = False

    async def start_matcher(self):
        """Launch the background matching loop (call once on startup)."""
        if self._matcher_started:
            return
        self._matcher_started = True
        asyncio.create_task(self._matcher_loop())

    async def _matcher_loop(self):
        """Single background task that pairs players from the queue."""
        while True:
            try:
                if self._queue.qsize() >= 2:
                    async with self._lock:
                        if self._queue.qsize() < 2:
                            continue
                        p1 = await self._queue.get()
                        p2 = await self._queue.get()

                    # Verify both still connected
                    alive = True
                    try:
                        await asyncio.wait_for(p1.ws.send_json({"event": "ping", "data": {}}), timeout=2.0)
                    except Exception:
                        alive = False
                        await self._requeue(p2)
                    if alive:
                        try:
                            await asyncio.wait_for(p2.ws.send_json({"event": "ping", "data": {}}), timeout=2.0)
                        except Exception:
                            alive = False
                            await self._requeue(p1)

                    if not alive:
                        continue

                    game_id = uuid.uuid4().hex[:8]
                    room = GameRoom(game_id, p1, p2)
                    self._rooms[game_id] = room
                    self._player_rooms[p1.player_id] = game_id
                    self._player_rooms[p2.player_id] = game_id

                    asyncio.create_task(room.run())
            except Exception as e:
                print(f"[matchmaking] matcher loop error: {e}")
            await asyncio.sleep(0.5)

    async def _requeue(self, player: Player):
        try:
            await self._queue.put(player)
            # Notify player of their new queue position
            try:
                await player.ws.send_json({
                    "event": "queue_joined",
                    "data": {"position": self._queue.qsize(), "player_id": player.player_id}
                })
            except Exception:
                pass
        except Exception as e:
            print(f"[matchmaking] requeue failed: {e}")

    async def join_queue(self, ws: WebSocket, provider: str, model_name: str, api_key: str,
                         api_base: Optional[str] = None, compact_mode: bool = False) -> Player:
        player_id = uuid.uuid4().hex[:10]
        player = Player(ws=ws, player_id=player_id, provider=provider,
                        model_name=model_name, api_key=api_key, api_base=api_base,
                        compact_mode=compact_mode)
        await self._queue.put(player)
        queue_size = self._queue.qsize()
        await ws.send_json({"event": "queue_joined", "data": {"position": queue_size, "player_id": player_id}})
        return player

    def get_room(self, game_id: str) -> Optional[GameRoom]:
        return self._rooms.get(game_id)

    def get_player_room(self, player_id: str) -> Optional[str]:
        return self._player_rooms.get(player_id)

    async def remove_from_queue(self, player_id: str):
        # Remove directly from the underlying deque (no API for this on asyncio.Queue)
        async with self._lock:
            for i, player in enumerate(self._queue._queue):
                if player.player_id == player_id:
                    del self._queue._queue[i]
                    return

    def cleanup(self, game_id: str):
        room = self._rooms.pop(game_id, None)
        if room:
            self._player_rooms.pop(room.player_1.player_id, None)
            self._player_rooms.pop(room.player_2.player_id, None)


matchmaking = MatchmakingManager()
