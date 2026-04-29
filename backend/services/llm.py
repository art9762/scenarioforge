import httpx
from typing import Optional
from backend.config import settings


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
        provider = self._get_provider(model)
        if provider == "aurora":
            return await self._call_aurora(model, system_prompt, messages, max_tokens)
        else:
            return await self._call_orion(model, system_prompt, messages, max_tokens)

    async def _call_aurora(
        self, model: str, system_prompt: str, messages: list[dict], max_tokens: int
    ) -> str:
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
        return data["content"][0]["text"]

    async def _call_orion(
        self, model: str, system_prompt: str, messages: list[dict], max_tokens: int
    ) -> str:
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
        return data["choices"][0]["message"]["content"]

    async def close(self):
        await self._client.aclose()


llm_client = LLMClient()
