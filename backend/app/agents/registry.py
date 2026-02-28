import asyncio
from typing import Any

from mistralai import Mistral

from app.agents.prompts.algorithm import ALGORITHM_PROMPT
from app.agents.prompts.codegen import CODEGEN_PROMPT
from app.agents.prompts.eda import EDA_PROMPT
from app.agents.prompts.orchestrator import ORCHESTRATOR_PROMPT
from app.agents.prompts.validation import VALIDATION_PROMPT
from app.config import get_settings
from app.services.retry import retry_sync


class AgentRegistry:
    def __init__(self, client: Mistral) -> None:
        self.client = client
        self.settings = get_settings()
        self._agents: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def get_orchestrator(self) -> Any:
        cached = self._agents.get("orchestrator")
        if cached is not None:
            return cached

        eda_agent, algorithm_agent, code_agent, validation_agent = await asyncio.gather(
            self.get_eda_agent(),
            self.get_algorithm_agent(),
            self.get_code_agent(),
            self.get_validation_agent(),
        )

        handoffs = [
            agent_id
            for agent_id in [
                self._agent_id(eda_agent),
                self._agent_id(algorithm_agent),
                self._agent_id(code_agent),
                self._agent_id(validation_agent),
            ]
            if agent_id
        ]

        async with self._lock:
            cached = self._agents.get("orchestrator")
            if cached is not None:
                return cached
            orchestrator = await self._create_agent(
                model=self.settings.MISTRAL_DEFAULT_MODEL,
                name="anomalistral_orchestrator",
                description="Coordinates the end-to-end anomaly detection pipeline",
                instructions=ORCHESTRATOR_PROMPT,
                tools=[],
            )
            orchestrator_id = self._agent_id(orchestrator)
            updated_orchestrator = await self._update_handoffs(agent_id=orchestrator_id, handoffs=handoffs)
            self._agents["orchestrator"] = updated_orchestrator
            return updated_orchestrator

    async def get_eda_agent(self) -> Any:
        return await self._get_or_create_agent(
            key="eda",
            model=self.settings.MISTRAL_DEFAULT_MODEL,
            name="anomalistral_eda",
            description="Performs exploratory data analysis for time-series datasets",
            instructions=EDA_PROMPT,
            tools=[{"type": "code_interpreter"}],
        )

    async def get_algorithm_agent(self) -> Any:
        return await self._get_or_create_agent(
            key="algorithm",
            model=self.settings.MISTRAL_SMALL_MODEL,
            name="anomalistral_algorithm",
            description="Recommends suitable anomaly detection algorithms",
            instructions=ALGORITHM_PROMPT,
            tools=[],
        )

    async def get_code_agent(self) -> Any:
        return await self._get_or_create_agent(
            key="code",
            model=self.settings.MISTRAL_CODE_MODEL,
            name="anomalistral_codegen",
            description="Generates and tests anomaly detection pipeline code",
            instructions=CODEGEN_PROMPT,
            tools=[{"type": "code_interpreter"}],
        )

    async def get_validation_agent(self) -> Any:
        return await self._get_or_create_agent(
            key="validation",
            model=self.settings.MISTRAL_DEFAULT_MODEL,
            name="anomalistral_validation",
            description="Validates anomaly detection outputs and statistical reliability",
            instructions=VALIDATION_PROMPT,
            tools=[{"type": "code_interpreter"}],
        )

    async def _get_or_create_agent(
        self,
        key: str,
        model: str,
        name: str,
        description: str,
        instructions: str,
        tools: list[dict[str, Any]],
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
        tools: list[dict[str, Any]],
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

    async def _update_handoffs(self, agent_id: str, handoffs: list[str]) -> Any:
        return await asyncio.to_thread(
            retry_sync,
            self.client.beta.agents.update,
            agent_id=agent_id,
            handoffs=handoffs,
        )

    def _agent_id(self, agent: Any) -> str:
        if isinstance(agent, dict):
            return str(agent.get("id", ""))
        return str(getattr(agent, "id", ""))
