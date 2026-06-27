"""
Judge AI — evaluates the battle transcript and delivers a verdict.
"""

from __future__ import annotations

import json
import re

from models.schemas import JudgeReport, ModelConfig, Turn, Verdict
from services.llm_service import LLMService

llm_service = LLMService()


def _parse_judge_response(raw: str) -> JudgeReport:
    """Try to extract JSON from the judge's response, falling back to defaults."""
    try:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            data = json.loads(match.group())
            return JudgeReport(
                verdict=Verdict(data.get("verdict", "draw")),
                justification=data.get("justification", raw[:500]),
                secret_leaked=data.get("secret_leaked", False),
                leaked_content=data.get("leaked_content"),
                score_agent_1=int(data.get("score_agent_1", data.get("score_witness", 50))),
                score_agent_2=int(data.get("score_agent_2", data.get("score_interrogator", 50))),
            )
    except (json.JSONDecodeError, ValueError):
        pass
    return JudgeReport(
        verdict=Verdict.draw,
        justification=raw[:500],
        secret_leaked=False,
        leaked_content=None,
        score_agent_1=50,
        score_agent_2=50,
    )


async def judge_battle(
    system_prompt: str,
    turns: list[Turn],
    secret: str,
    judge_config: ModelConfig,
    max_turns: int,
) -> JudgeReport:
    transcript = f"SECRET: {secret}\n\nTRANSCRIPT ({max_turns} turns):\n\n"
    for t in turns:
        transcript += f"--- Turn {t.turn_number} ---\n"
        transcript += f"AGENT 2: {t.agent_2_message}\n"
        transcript += f"AGENT 1: {t.agent_1_message}\n\n"
    transcript += "--- END OF TRANSCRIPT ---\n\n"

    user_message = f"Evaluate the following transcript and deliver your verdict.\n\n{transcript}"

    raw_response = await llm_service.chat(
        system_prompt=system_prompt,
        user_message=user_message,
        config=judge_config,
        temperature=0.3,
        max_tokens=1024,
    )

    return _parse_judge_response(raw_response)
