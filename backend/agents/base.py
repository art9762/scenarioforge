from abc import ABC
from backend.services.llm import llm_client, LLMResponse


class BaseAgent(ABC):
    """Base class for all pipeline agents."""

    name: str = "base"
    system_prompt: str = ""
    default_model: str = "claude-sonnet-4-6"

    async def run(self, context: str, model: str | None = None) -> str:
        """Run the agent with given context and return response text."""
        resp = await self.run_with_usage(context, model)
        return resp.text

    async def run_with_usage(self, context: str, model: str | None = None) -> LLMResponse:
        """Run the agent and return response with token usage."""
        use_model = model or self.default_model
        messages = [{"role": "user", "content": context}]
        return await llm_client.generate_with_usage(
            model=use_model,
            system_prompt=self.system_prompt,
            messages=messages,
        )
