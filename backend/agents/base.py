from abc import ABC
from backend.services.llm import llm_client


class BaseAgent(ABC):
    """Base class for all pipeline agents."""

    name: str = "base"
    system_prompt: str = ""
    default_model: str = "claude-sonnet-4-6"

    async def run(self, context: str, model: str | None = None) -> str:
        """Run the agent with given context and return response."""
        use_model = model or self.default_model
        messages = [{"role": "user", "content": context}]
        return await llm_client.generate(
            model=use_model,
            system_prompt=self.system_prompt,
            messages=messages,
        )
