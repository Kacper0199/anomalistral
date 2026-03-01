import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.prompts.algorithm import ALGORITHM_PROMPT
from app.models.database import BlockDefinition, PipelineTemplate

_BLOCK_DEFINITIONS = [
    BlockDefinition(
        id="upload",
        display_name="Upload",
        category="data_input",
        has_agent=False,
        icon="Upload",
        color="#6366f1",
        input_types=json.dumps([]),
        output_types=json.dumps(["dataframe"]),
        default_config=None,
        agent_prompt_template=None,
    ),
    BlockDefinition(
        id="eda",
        display_name="EDA",
        category="data_input",
        has_agent=True,
        icon="BarChart3",
        color="#8b5cf6",
        input_types=json.dumps(["dataframe"]),
        output_types=json.dumps(["eda_report"]),
        default_config=None,
        agent_prompt_template=None,
    ),
    BlockDefinition(
        id="normalization",
        display_name="Normalization",
        category="processing",
        has_agent=False,
        icon="Scaling",
        color="#06b6d4",
        input_types=json.dumps(["dataframe"]),
        output_types=json.dumps(["dataframe"]),
        default_config=json.dumps({"method": "min_max"}),
        agent_prompt_template=None,
    ),
    BlockDefinition(
        id="imputation",
        display_name="Imputation",
        category="processing",
        has_agent=False,
        icon="Eraser",
        color="#14b8a6",
        input_types=json.dumps(["dataframe"]),
        output_types=json.dumps(["dataframe"]),
        default_config=json.dumps({"method": "median"}),
        agent_prompt_template=None,
    ),
    BlockDefinition(
        id="algorithm",
        display_name="Algorithm",
        category="algorithm",
        has_agent=True,
        icon="Brain",
        color="#f59e0b",
        input_types=json.dumps(["dataframe", "eda_report"]),
        output_types=json.dumps(["anomaly_scores"]),
        default_config=None,
        agent_prompt_template=ALGORITHM_PROMPT,
    ),
    BlockDefinition(
        id="aggregator",
        display_name="Aggregator",
        category="aggregation",
        has_agent=False,
        icon="Combine",
        color="#ec4899",
        input_types=json.dumps(["anomaly_scores"]),
        output_types=json.dumps(["anomaly_scores"]),
        default_config=json.dumps({"method": "majority_vote"}),
        agent_prompt_template=None,
    ),
    BlockDefinition(
        id="anomaly_viz",
        display_name="Anomaly Visualization",
        category="visualization",
        has_agent=False,
        icon="LineChart",
        color="#10b981",
        input_types=json.dumps(["anomaly_scores", "dataframe"]),
        output_types=json.dumps([]),
        default_config=None,
        agent_prompt_template=None,
    ),
]

_BASIC_DAG = {
    "nodes": [
        {"id": "upload", "block_type": "upload", "position": {"x": 0, "y": 0}, "status": "idle", "config": {"columns": []}},
        {"id": "eda", "block_type": "eda", "position": {"x": 0, "y": 150}, "status": "idle"},
        {"id": "normalization", "block_type": "normalization", "position": {"x": 0, "y": 300}, "status": "idle", "config": {"method": "min_max"}},
        {"id": "algorithm", "block_type": "algorithm", "position": {"x": 0, "y": 450}, "status": "idle", "config": {"prompt_override": "Use Isolation Forest to detect anomalies."}},
        {"id": "anomaly_viz", "block_type": "anomaly_viz", "position": {"x": 0, "y": 600}, "status": "idle"},
    ],
    "edges": [
        {"id": "e1", "source": "upload", "target": "eda"},
        {"id": "e2", "source": "eda", "target": "normalization"},
        {"id": "e3", "source": "normalization", "target": "algorithm"},
        {"id": "e4", "source": "algorithm", "target": "anomaly_viz"},
    ],
}

_ENSEMBLE_DAG = {
    "nodes": [
        {"id": "upload", "block_type": "upload", "position": {"x": 0, "y": 0}, "status": "idle"},
        {"id": "eda", "block_type": "eda", "position": {"x": 0, "y": 200}, "status": "idle"},
        {"id": "normalization", "block_type": "normalization", "position": {"x": 0, "y": 400}, "status": "idle"},
        {"id": "algorithm_1", "block_type": "algorithm", "position": {"x": -250, "y": 600}, "status": "idle"},
        {"id": "algorithm_2", "block_type": "algorithm", "position": {"x": 0, "y": 600}, "status": "idle"},
        {"id": "algorithm_3", "block_type": "algorithm", "position": {"x": 250, "y": 600}, "status": "idle"},
        {"id": "aggregator", "block_type": "aggregator", "position": {"x": 0, "y": 800}, "status": "idle"},
        {"id": "anomaly_viz", "block_type": "anomaly_viz", "position": {"x": 0, "y": 1000}, "status": "idle"},
    ],
    "edges": [
        {"id": "e1", "source": "upload", "target": "eda"},
        {"id": "e2", "source": "eda", "target": "normalization"},
        {"id": "e3", "source": "normalization", "target": "algorithm_1"},
        {"id": "e4", "source": "normalization", "target": "algorithm_2"},
        {"id": "e5", "source": "normalization", "target": "algorithm_3"},
        {"id": "e6", "source": "algorithm_1", "target": "aggregator"},
        {"id": "e7", "source": "algorithm_2", "target": "aggregator"},
        {"id": "e8", "source": "algorithm_3", "target": "aggregator"},
        {"id": "e9", "source": "aggregator", "target": "anomaly_viz"},
    ],
}

_PIPELINE_TEMPLATES = [
    PipelineTemplate(
        id="basic_anomaly_detection",
        name="Basic Anomaly Detection",
        description="A simple linear pipeline: upload → EDA → normalization → algorithm → visualization.",
        dag_definition=json.dumps(_BASIC_DAG),
        is_builtin=True,
    ),
    PipelineTemplate(
        id="multi_algorithm_ensemble",
        name="Multi-Algorithm Ensemble",
        description="Three parallel algorithm blocks merged by an aggregator before visualization.",
        dag_definition=json.dumps(_ENSEMBLE_DAG),
        is_builtin=True,
    ),
]


async def seed_database(db: AsyncSession) -> None:
    for block_def in _BLOCK_DEFINITIONS:
        await db.merge(block_def)
    for template in _PIPELINE_TEMPLATES:
        await db.merge(template)
    await db.commit()
