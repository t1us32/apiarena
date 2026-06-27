from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── LLM Provider & Model ──────────────────────────────────────────────

class LLMProvider(str, Enum):
    openai = "openai"
    anthropic = "anthropic"
    openrouter = "openrouter"
    deepseek = "deepseek"
    grok = "grok"


class ModelConfig(BaseModel):
    provider: LLMProvider = LLMProvider.openai
    model_name: str = "gpt-4o"
    api_key: str = ""
    api_base: Optional[str] = None


# ── Agent Configuration ───────────────────────────────────────────────

class AgentConfig(BaseModel):
    system_prompt: str = ""
    llm: ModelConfig = Field(default_factory=ModelConfig, alias="model_config")


# ── Battle Configuration (what the frontend sends) ────────────────────

class BattleConfigRequest(BaseModel):
    scenario_id: str = "witness_interrogation"
    agent_1: AgentConfig = Field(default_factory=AgentConfig)
    agent_2: AgentConfig = Field(default_factory=AgentConfig)
    judge: AgentConfig = Field(default_factory=AgentConfig)
    max_turns: int = Field(default=5, ge=1, le=20)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


# ── Battle State ──────────────────────────────────────────────────────

class Turn(BaseModel):
    turn_number: int
    agent_1_message: str  # response
    agent_2_message: str  # prompt
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class Verdict(str, Enum):
    agent_1_win = "agent_1_win"
    agent_2_win = "agent_2_win"
    draw = "draw"


class JudgeReport(BaseModel):
    verdict: Verdict
    justification: str
    secret_leaked: bool = False
    leaked_content: Optional[str] = None
    score_agent_1: int = 0
    score_agent_2: int = 0


class BattleStatus(str, Enum):
    configuring = "configuring"
    running = "running"
    judging = "judging"
    complete = "complete"
    error = "error"


class BattleState(BaseModel):
    battle_id: str
    status: BattleStatus = BattleStatus.configuring
    scenario_id: str
    secret_fact: Optional[str] = None
    turns: list[Turn] = []
    judge_report: Optional[JudgeReport] = None
    error_message: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    max_turns: int = 5
    current_turn: int = 0
