"""
Battle API router — endpoints for starting battles, streaming results,
listing scenarios, and fetching models.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from models.schemas import BattleConfigRequest, BattleState, LLMProvider
from scenarios import list_scenarios, get_scenario
from services.game_engine import (
    cleanup_battle,
    get_battle,
    get_battle_stream,
    run_battle,
)
from services.llm_service import LLMService

router = APIRouter(prefix="/api/battle", tags=["battle"])
llm_service = LLMService()


class ModelListRequest(BaseModel):
    provider: LLMProvider
    api_key: str
    api_base: str | None = None


# ── Scenarios ──────────────────────────────────────────────────────────

@router.get("/scenarios")
async def get_scenarios():
    """List all available game scenarios with their default prompts."""
    return {"scenarios": [s.to_dict() for s in list_scenarios()]}


# ── Models ────────────────────────────────────────────────────────────

@router.post("/models")
async def list_models(req: ModelListRequest):
    """Fetch available models for a given provider and API key."""
    models = await llm_service.list_models(req.provider, req.api_key, req.api_base)
    return {"models": models}


# ── Battle ─────────────────────────────────────────────────────────────

@router.post("/start")
async def start_battle(config: BattleConfigRequest):
    """Start a new AI battle. Returns the battle_id for streaming."""
    # Validate scenario exists
    scenario = get_scenario(config.scenario_id)
    if scenario is None:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {config.scenario_id}")

    # Apply scenario max_turns if user didn't override
    if config.max_turns <= 0:
        config.max_turns = scenario.max_turns

    # Validate at least one API key is provided
    if not config.agent_1.llm.api_key and not config.agent_2.llm.api_key:
        raise HTTPException(status_code=400, detail="At least one API key is required")

    # If only one key is provided, share it across agents
    if not config.agent_1.llm.api_key:
        config.agent_1.llm.api_key = config.agent_2.llm.api_key
    if not config.agent_2.llm.api_key:
        config.agent_2.llm.api_key = config.agent_1.llm.api_key

    battle_id = await run_battle(config)
    return {"battle_id": battle_id}


@router.get("/{battle_id}/status")
async def get_battle_status(battle_id: str):
    """Poll for the current battle state."""
    state = get_battle(battle_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Battle not found")
    return state.model_dump()


@router.get("/{battle_id}/stream")
async def stream_battle(battle_id: str):
    """SSE stream for real-time battle updates."""
    stream = get_battle_stream(battle_id)
    if stream is None:
        raise HTTPException(status_code=404, detail="Battle not found or already closed")

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(stream.get(), timeout=60.0)
                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"]),
                    }
                    if event["event"] == "close":
                        break
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            cleanup_battle(battle_id)

    return EventSourceResponse(event_generator())


@router.get("/history")
async def list_battles():
    """List all battle IDs (simple in-memory store)."""
    from services.game_engine import _battles
    return {"battles": list(_battles.keys())}
