"""
WebSocket router — handles multiplayer matchmaking and game communication.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.matchmaking import matchmaking

router = APIRouter()


@router.websocket("/ws/game")
async def game_websocket(ws: WebSocket):
    await ws.accept()
    player_id = None

    # Start single matcher loop on first connection
    await matchmaking.start_matcher()

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=120.0)
            except asyncio.TimeoutError:
                # Send ping to keep alive
                try:
                    await ws.send_json({"event": "ping", "data": {}})
                except Exception:
                    break
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"event": "error", "data": {"message": "Invalid JSON"}})
                continue

            event = msg.get("event")
            data = msg.get("data", {})

            if event == "join_queue":
                provider = data.get("provider", "openai")
                model_name = data.get("model_name", "gpt-4o")
                api_key = data.get("api_key", "")
                api_base = data.get("api_base")
                compact_mode = data.get("compact_mode", False)

                if not api_key:
                    await ws.send_json({"event": "error", "data": {"message": "API key required"}})
                    continue

                player = await matchmaking.join_queue(ws, provider, model_name, api_key, api_base, compact_mode)
                player_id = player.player_id

            elif event == "submit_prompt":
                if not player_id:
                    await ws.send_json({"event": "error", "data": {"message": "Join queue first"}})
                    continue
                room_id = matchmaking.get_player_room(player_id)
                if not room_id:
                    await ws.send_json({"event": "error", "data": {"message": "Not in a game"}})
                    continue
                room = matchmaking.get_room(room_id)
                if room:
                    room.submit_prompt(player_id, data.get("prompt", ""))

            elif event == "leave_queue":
                if player_id:
                    await matchmaking.remove_from_queue(player_id)
                await ws.close()
                return

            elif event == "ping":
                await ws.send_json({"event": "pong", "data": {}})

            else:
                await ws.send_json({"event": "error", "data": {"message": f"Unknown event: {event}"}})

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if player_id:
            room_id = matchmaking.get_player_room(player_id)
            if room_id:
                room = matchmaking.get_room(room_id)
                if room and room.phase not in ("done", "aborted"):
                    try:
                        await room.broadcast("opponent_disconnected", {"player_id": player_id})
                    except Exception:
                        pass
                    room.phase = "aborted"
                    room._done.set()
                matchmaking.cleanup(room_id)
            else:
                # Player was only in queue, not yet in a room
                await matchmaking.remove_from_queue(player_id)
