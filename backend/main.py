"""
AI Arena — Backend API
FastAPI application entry point.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.battle import router as battle_router
from routers.ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[AI Arena] backend starting...")
    yield
    # Shutdown
    print("[AI Arena] backend shutting down...")


app = FastAPI(
    title="AI Arena",
    description="Prompt Engineering Battle Platform — Pit LLMs against each other",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(battle_router)
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "AI Arena"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
