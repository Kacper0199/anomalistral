import asyncio
from typing import Any

from mistralai import Mistral

from app.agents.prompts.algorithm import ALGORITHM_PROMPT
from app.agents.prompts.codegen import CODEGEN_PROMPT
from app.agents.prompts.eda import EDA_PROMPT
from app.agents.prompts.orchestrator import ORCHESTRATOR_PROMPT
from app.config import get_settings
from app.services.retry import retry_sync


class AgentRegistry:
    def __init__(self, client: Mistral) -> None:
        self.client = client
        self.settings = get_settings()
        self._agents: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def get_orchestrator(self) -> Any:
        return await self._get_or_create_agent(
            key="orchestrator",
            model=self.settings.MISTRAL_DEFAULT_MODEL,
            name="anomalistral_orchestrator",
            description="Coordinates the end-to-end anomaly detection pipeline",
            instructions=ORCHESTRATOR_PROMPT,
            tools=[],
        )

    async def get_or_create_agent(
        self,
        block_type: str,
        block_id: str,
        prompt_override: str | None = None,
    ) -> Any:
        cache_key = f"{block_type}:{block_id}"
        cached = self._agents.get(cache_key)
        if cached is not None:
            return cached

        model, tools, instructions = self._block_agent_params(block_type, prompt_override)
        name = f"anomalistral_{block_type}_{block_id[:8]}"

        async with self._lock:
            cached = self._agents.get(cache_key)
            if cached is not None:
                return cached
            agent = await self._create_agent(
                model=model,
                name=name,
                description=f"Agent for {block_type} block",
                instructions=instructions,
                tools=tools,
            )
            self._agents[cache_key] = agent
            return agent

    def _block_agent_params(
        self, block_type: str, prompt_override: str | None
    ) -> tuple[str, list[Any], str]:
        if block_type == "eda":
            return self.settings.MISTRAL_DEFAULT_MODEL, [{"type": "code_interpreter"}], EDA_PROMPT
        if block_type == "algorithm":
            return self.settings.MISTRAL_DEFAULT_MODEL, [{"type": "code_interpreter"}], prompt_override or ALGORITHM_PROMPT
        if block_type == "codegen":
            return self.settings.MISTRAL_DEFAULT_MODEL, [{"type": "code_interpreter"}], CODEGEN_PROMPT
        return self.settings.MISTRAL_DEFAULT_MODEL, [], prompt_override or ORCHESTRATOR_PROMPT

    async def _get_or_create_agent(
        self,
        key: str,
        model: str,
        name: str,
        description: str,
        instructions: str,
        tools: list[Any],
    ) -> Any:
        cached = self._agents.get(key)
        if cached is not None:
            return cached

        async with self._lock:
            cached = self._agents.get(key)
            if cached is not None:
                return cached
            agent = await self._create_agent(
                model=model,
                name=name,
                description=description,
                instructions=instructions,
                tools=tools,
            )
            self._agents[key] = agent
            return agent

    async def _create_agent(
        self,
        model: str,
        name: str,
        description: str,
        instructions: str,
        tools: list[Any],
    ) -> Any:
        return await asyncio.to_thread(
            retry_sync,
            self.client.beta.agents.create,
            model=model,
            name=name,
            description=description,
            instructions=instructions,
            tools=tools,
        )
