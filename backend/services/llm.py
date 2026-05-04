import asyncio
import logging

import httpx
from dataclasses import dataclass
from typing import Optional
from backend.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    text: str
    input_tokens: int
    output_tokens: int


class LLMClient:
    """Client for Trinity proxy - supports Aurora (Anthropic) and Orion (OpenAI) endpoints."""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=120.0)

    def _get_provider(self, model: str) -> str:
        if model.startswith("gpt"):
            return "orion"
        return "aurora"

    async def generate(
        self,
        model: str,
        system_prompt: str,
        messages: list[dict],
        max_tokens: int = 4096,
    ) -> str:
        """Generate text. Returns only text for backward compat."""
        resp = await self.generate_with_usage(model, system_prompt, messages, max_tokens)
        return resp.text

    MAX_RETRIES = 3
    RETRY_DELAYS = [1.0, 2.0, 4.0]
    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

    async def generate_with_usage(
        self,
        model: str,
        system_prompt: str,
        messages: list[dict],
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate text and return usage info with retry on transient errors."""
        provider = self._get_provider(model)
        call = self._call_aurora if provider == "aurora" else self._call_orion
        last_exc: Exception | None = None
        for attempt in range(self.MAX_RETRIES):
            try:
                return await call(model, system_prompt, messages, max_tokens)
            except httpx.HTTPStatusError as e:
                last_exc = e
                if e.response.status_code not in self.RETRYABLE_STATUS_CODES:
                    raise
                logger.warning("LLM request failed (attempt %d/%d, status %d), retrying in %ss",
                               attempt + 1, self.MAX_RETRIES, e.response.status_code, self.RETRY_DELAYS[attempt])
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exc = e
                logger.warning("LLM request failed (attempt %d/%d, %s), retrying in %ss",
                               attempt + 1, self.MAX_RETRIES, type(e).__name__, self.RETRY_DELAYS[attempt])
            await asyncio.sleep(self.RETRY_DELAYS[attempt])
        raise last_exc  # type: ignore[misc]

    async def _call_aurora(
        self, model: str, system_prompt: str, messages: list[dict], max_tokens: int
    ) -> LLMResponse:
        """Anthropic Messages API compatible call."""
        url = f"{settings.trinity_aurora_url}/messages"
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
        }
        headers = {
            "Authorization": f"Bearer {settings.trinity_api_key}",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        usage = data.get("usage", {})
        return LLMResponse(
            text=data["content"][0]["text"],
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )

    async def _call_orion(
        self, model: str, system_prompt: str, messages: list[dict], max_tokens: int
    ) -> LLMResponse:
        """OpenAI Chat Completions compatible call."""
        url = f"{settings.trinity_orion_url}/chat/completions"
        oai_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            oai_messages.append({"role": m["role"], "content": m["content"]})
        payload = {
            "model": model,
            "messages": oai_messages,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {settings.trinity_api_key}",
            "Content-Type": "application/json",
        }
        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        usage = data.get("usage", {})
        return LLMResponse(
            text=data["choices"][0]["message"]["content"],
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )

    async def close(self):
        await self._client.aclose()


llm_client = LLMClient()
