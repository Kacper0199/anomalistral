import asyncio
from typing import Any

from mistralai import Mistral

from app.agents.prompts.algorithm import ALGORITHM_PROMPT
from app.agents.prompts.codegen import CODEGEN_PROMPT
from app.agents.prompts.eda import EDA_PROMPT
from app.agents.prompts.orchestrator import ORCHESTRATOR_PROMPT
from app.agents.prompts.validation import VALIDATION_PROMPT
from app.config import get_settings


class AgentRegistry:
    def __init__(self, client: Mistral) -> None:
        self.client = client
        self.settings = get_settings()
        self._agents: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def get_orchestrator(self) -> Any:
        if "orchestrator" in self._agents:
            return self._agents["orchestrator"]

        eda_agent = await self.get_eda_agent()
        algorithm_agent = await self.get_algorithm_agent()
        code_agent = await self.get_code_agent()
        validation_agent = await self.get_validation_agent()

        async with self._lock:
            if "orchestrator" in self._agents:
                return self._agents["orchestrator"]
            orchestrator = await self._create_agent(
                model=self.settings.MISTRAL_DEFAULT_MODEL,
                name="anomalistral_orchestrator",
                description="Coordinates the end-to-end anomaly detection pipeline",
                instructions=ORCHESTRATOR_PROMPT,
                handoffs=[
                    {"agent_id": self._agent_id(eda_agent)},
                    {"agent_id": self._agent_id(algorithm_agent)},
                    {"agent_id": self._agent_id(code_agent)},
                    {"agent_id": self._agent_id(validation_agent)},
                ],
            )
            self._agents["orchestrator"] = orchestrator
            return orchestrator

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

    async def _get_or_create_agent(self, key: str, **kwargs: Any) -> Any:
        if key in self._agents:
            return self._agents[key]
        async with self._lock:
            if key in self._agents:
                return self._agents[key]
            agent = await self._create_agent(**kwargs)
            self._agents[key] = agent
            return agent

    async def _create_agent(self, **kwargs: Any) -> Any:
        return await asyncio.to_thread(self.client.beta.agents.create, **kwargs)

    def _agent_id(self, agent: Any) -> str:
        if isinstance(agent, dict):
            return str(agent.get("id", ""))
        return str(getattr(agent, "id", ""))
