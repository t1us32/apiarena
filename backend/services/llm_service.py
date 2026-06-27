"""
Unified LLM service that speaks OpenAI-compatible and Anthropic APIs.
Uses httpx for async HTTP calls.
"""

from __future__ import annotations

import json
from typing import Optional

import httpx

from models.schemas import LLMProvider, ModelConfig

OPENAI_DEFAULT_BASE = "https://api.openai.com/v1"
ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com/v1"
OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1"
DEEPSEEK_DEFAULT_BASE = "https://api.deepseek.com/v1"
GROK_DEFAULT_BASE = "https://api.x.ai/v1"


def _build_openai_payload(
    system_prompt: str,
    user_message: str,
    history: list[dict],
    model: str,
    temperature: float,
    max_tokens: int,
) -> dict:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for h in history:
        messages.append(h)
    messages.append({"role": "user", "content": user_message})
    return {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }


def _build_anthropic_payload(
    system_prompt: str,
    user_message: str,
    history: list[dict],
    model: str,
    temperature: float,
    max_tokens: int,
) -> dict:
    # Build Anthropic messages array (alternating user/assistant, no system role in messages)
    anthropic_messages = []
    for h in history:
        role = h.get("role", "user")
        if role == "system":
            # System messages go into the top-level system param, not in messages array
            continue
        anthropic_messages.append({"role": role, "content": [{"type": "text", "text": h.get("content", "")}]})
    anthropic_messages.append({"role": "user", "content": [{"type": "text", "text": user_message}]})
    return {
        "model": model,
        "system": system_prompt if system_prompt else None,
        "messages": anthropic_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }


DEFAULT_FALLBACK_MODELS: dict[LLMProvider, list[str]] = {
    LLMProvider.openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o3-mini", "o1", "o1-mini"],
    LLMProvider.anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    LLMProvider.openrouter: ["openai/gpt-4o", "anthropic/claude-sonnet-4", "anthropic/claude-3.5-sonnet", "google/gemini-2.5-pro", "meta-llama/llama-4-maverick", "deepseek/deepseek-chat-v3"],
    LLMProvider.deepseek: ["deepseek-chat", "deepseek-reasoner"],
    LLMProvider.grok: ["grok-3", "grok-3-mini", "grok-2-latest"],
}


def _get_base_for_provider(provider: LLMProvider, api_base: Optional[str] = None) -> str:
    if api_base:
        return api_base
    return {
        LLMProvider.openai: OPENAI_DEFAULT_BASE,
        LLMProvider.anthropic: ANTHROPIC_DEFAULT_BASE,
        LLMProvider.openrouter: OPENROUTER_DEFAULT_BASE,
        LLMProvider.deepseek: DEEPSEEK_DEFAULT_BASE,
        LLMProvider.grok: GROK_DEFAULT_BASE,
    }[provider]


class LLMService:
    def __init__(self, timeout: float = 120.0):
        self.timeout = timeout

    async def list_models(self, provider: LLMProvider, api_key: str, api_base: Optional[str] = None) -> list[str]:
        """Fetch available models from the provider API. Falls back to curated defaults."""
        base = _get_base_for_provider(provider, api_base)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                if provider == LLMProvider.anthropic:
                    # Anthropic has no list-models endpoint — return fallback
                    return DEFAULT_FALLBACK_MODELS[provider]

                headers = {"Authorization": f"Bearer {api_key}"}
                if provider == LLMProvider.openrouter:
                    headers["HTTP-Referer"] = "http://localhost:3000"
                    headers["X-Title"] = "AI Arena"

                resp = await client.get(f"{base}/models", headers=headers)
                resp.raise_for_status()
                data = resp.json()

                models = []
                raw = data.get("data", data) if isinstance(data, dict) else data
                if isinstance(raw, list):
                    models = [m["id"] for m in raw if isinstance(m, dict) and m.get("id")]
                elif isinstance(raw, dict) and "data" in raw:
                    models = [m["id"] for m in raw["data"] if isinstance(m, dict) and m.get("id")]

                if not models:
                    return DEFAULT_FALLBACK_MODELS[provider]

                # Sort: put latest / popular models first, filter out deprecated
                preferred = [m for m in models if "gpt-4" in m or "claude" in m or "deepseek" in m or "gemini" in m]
                rest = [m for m in models if m not in preferred]
                result = preferred + rest
                return result[:40] if len(result) > 40 else result

        except Exception:
            return DEFAULT_FALLBACK_MODELS[provider]

    async def chat(
        self,
        system_prompt: str,
        user_message: str,
        config: ModelConfig,
        history: Optional[list[dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        if history is None:
            history = []

        provider = config.provider
        headers: dict = {}
        payload: dict
        url: str

        if provider == LLMProvider.anthropic:
            base = _get_base_for_provider(provider, config.api_base)
            url = f"{base}/messages"
            headers["x-api-key"] = config.api_key
            headers["anthropic-version"] = "2023-06-01"
            headers["content-type"] = "application/json"
            payload = _build_anthropic_payload(
                system_prompt, user_message, history, config.model_name, temperature, max_tokens
            )
        else:
            base = _get_base_for_provider(provider, config.api_base)
            url = f"{base}/chat/completions"
            headers["Authorization"] = f"Bearer {config.api_key}"
            headers["content-type"] = "application/json"
            payload = _build_openai_payload(
                system_prompt, user_message, history, config.model_name, temperature, max_tokens
            )
            if provider == LLMProvider.openrouter:
                headers["HTTP-Referer"] = "http://localhost:3000"
                headers["X-Title"] = "AI Arena"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        if provider == LLMProvider.anthropic:
            return data["content"][0]["text"]
        else:
            return data["choices"][0]["message"]["content"]

    async def chat_stream(
        self,
        system_prompt: str,
        user_message: str,
        config: ModelConfig,
        history: Optional[list[dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        """Async generator that yields tokens for SSE streaming."""
        if history is None:
            history = []

        provider = config.provider
        headers: dict = {}
        payload: dict
        url: str

        if provider == LLMProvider.anthropic:
            base = _get_base_for_provider(provider, config.api_base)
            url = f"{base}/messages"
            headers["x-api-key"] = config.api_key
            headers["anthropic-version"] = "2023-06-01"
            headers["content-type"] = "application/json"
            payload = _build_anthropic_payload(
                system_prompt, user_message, history, config.model_name, temperature, max_tokens
            )
            payload["stream"] = True
        else:
            base = _get_base_for_provider(provider, config.api_base)
            url = f"{base}/chat/completions"
            headers["Authorization"] = f"Bearer {config.api_key}"
            headers["content-type"] = "application/json"
            if provider == LLMProvider.openrouter:
                headers["HTTP-Referer"] = "http://localhost:3000"
                headers["X-Title"] = "AI Arena"
            payload = _build_openai_payload(
                system_prompt, user_message, history, config.model_name, temperature, max_tokens
            )
            payload["stream"] = True

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                full_content = ""
                async for line in response.aiter_lines():
                    if not line or line.startswith(":"):
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if provider == LLMProvider.anthropic:
                                if data.get("type") == "content_block_delta":
                                    delta = data.get("delta", {}).get("text", "")
                                else:
                                    continue
                            else:
                                delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                full_content += delta
                                yield delta
                        except json.JSONDecodeError:
                            continue
