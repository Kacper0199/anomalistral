# 🌌 Anomalistral

[![Mistral Hackathon 2026](https://img.shields.io/badge/Mistral-Hackathon_2026-blueviolet?style=for-the-badge&logo=mistralai)](https://mistral.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Stack: Next.js 15](https://img.shields.io/badge/Frontend-Next.js_15-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![Stack: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Stack: React Flow 12](https://img.shields.io/badge/DAG-React_Flow_12-ff0072?style=for-the-badge)](https://reactflow.dev/)

Transform natural language descriptions into production-ready anomaly detection pipelines.</em>

---

Anomalistral orchestrates specialized Mistral AI agents through a visual **DAG (Directed Acyclic Graph) workbench** to automate the entire anomaly detection lifecycle: data ingestion, exploratory analysis, preprocessing, algorithm execution, ensemble aggregation, and anomaly visualization. Users design pipelines by connecting modular blocks on an interactive canvas, configure each block's parameters, and launch execution — the platform handles everything else autonomously.

Built in **48 hours** for the **Mistral AI Hackathon 2026**.

---

## 📸 Screenshots

### Default Pipeline — Basic Anomaly Detection
> A complete linear anomaly detection workflow (Upload → EDA → Normalization → Algorithm → Anomaly Visualization). The image shows the real-time execution in progress with live status badges.

![Default Pipeline](docs/screenshots/default-pipeline.png)

### Chat Panel + EDA Results
> The Orchestrator chat on the left guides the user through the process, while the right panel displays comprehensive statistical analysis and data distributions extracted by the EDA agent.

![Chat and EDA](docs/screenshots/chat-and-eda.png)

### Code Tab — Generated Python Code
> The exact, production-ready Python script autonomously generated and executed by the Mistral code-interpreter agent, complete with syntax highlighting and available for download.

![Code Tab](docs/screenshots/code-tab.png)

### Anomalies Tab — Detected Anomalies
> A detailed data table presenting the detected anomaly rows seamlessly enriched with the original dataset's context and columns for easy review.

![Anomalies Tab](docs/screenshots/anomalies-tab.png)

### Node Interactions — Block Edition & Deletion
> Hovering over a DAG node reveals intuitive quick-action buttons for configuration and removal, making pipeline restructuring effortless.

![Block Edition and Deletion Buttons](docs/screenshots/block-edition-deletion-buttons.png)

### Multi-Algorithm Ensemble Pipeline
> A complex DAG architecture where multiple anomaly detection algorithms run concurrently in parallel, feeding their independent results into an Aggregator block for a combined consensus.

![Multi-Algorithm Pipeline](docs/screenshots/multi-algorithm-pipeline.png)

### Block Configuration — Aggregator
> The ensemble configuration interface where users can define the aggregation strategy (e.g., weighted average) and assign custom influence weights to each input algorithm.

![Aggregator Block Config](docs/screenshots/config-aggregator.png)

### Block Configuration — Algorithm
> Advanced settings for the Algorithm block, empowering users to override the default instructions and explicitly steer the Mistral agent's detection logic using natural language prompts.

![Algorithm Block Config](docs/screenshots/config-algorithm.png)

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **Visual DAG Editor** | Drag-and-drop pipeline builder using React Flow 12 with custom status-aware nodes, animated edges, and a mini-map |
| **7 Block Types** | Upload, EDA, Normalization, Imputation, Algorithm, Aggregator, Anomaly Visualization — each with its own configurable parameters |
| **AI-Powered Execution** | EDA and Algorithm blocks are executed by dedicated Mistral agents with `code_interpreter` running real Python code in a sandboxed environment |
| **Multi-Algorithm Ensemble** | Run multiple anomaly detection algorithms in parallel and merge results via configurable Aggregator blocks (majority vote or weighted average) |
| **Real-Time Streaming** | SSE-powered live updates — every block status change, pipeline event, and chat message streams to the UI instantly |
| **Orchestrator Chat** | Natural language conversation with a Mistral-powered orchestrator agent that describes the pipeline, answers questions, and provides context |
| **Per-Block Chat** | Interact with individual block agents directly to ask questions about their specific results |
| **Pipeline Templates** | Pre-built pipeline configurations (Basic Anomaly Detection, Multi-Algorithm Ensemble) that can be applied with one click |
| **Data Preprocessing** | Built-in normalization (min-max, standard scaler, robust) and imputation (median, mean, mode, forward fill) applied locally via Pandas |
| **Production-Ready Code** | Algorithm blocks generate and display the actual Python code they execute, available for download |
| **Anomaly Results Table** | Detected anomalies are enriched with original data columns and displayed in a sortable table |

---

## 🏗️ Architecture

Anomalistral follows a **DAG-based agentic architecture** where each pipeline block can optionally delegate its work to a dedicated Mistral AI agent.

```mermaid
graph TD
    User([User]) <--> Frontend["Next.js 15 + React Flow 12<br/>(DAG Editor + Chat + Results)"]
    Frontend -- "REST API<br/>(CRUD, Control, Upload)" --> Backend["FastAPI + SQLAlchemy<br/>(Async SQLite)"]
    Backend -- "SSE Events<br/>(block.started, block.completed, ...)" --> Frontend

    subgraph "DAG Executor (Backend)"
        direction TB
        Topo["Topological Sort<br/>(Layer-based parallelism)"] --> Layer1["Layer N"]
        Layer1 --> Block1["Block Execution<br/>(Agent or Local)"]
    end

    subgraph "Mistral Agents API"
        EDA["EDA Agent<br/>mistral-large-latest<br/>+ code_interpreter"]
        Algo["Algorithm Agent<br/>mistral-large-latest<br/>+ code_interpreter"]
        Orch["Orchestrator Agent<br/>mistral-large-latest<br/>(Chat)"]
    end

    Backend --> Topo
    Block1 -- "conversations.start<br/>+ ToolFileChunk" --> EDA
    Block1 -- "conversations.start<br/>+ ToolFileChunk" --> Algo
    Backend -- "conversations.start / append" --> Orch
    Backend -- "client.files.upload<br/>(purpose=code_interpreter)" --> Files[(Mistral Files API)]
    Files -- "file_id → ToolFileChunk" --> EDA
    Files -- "file_id → ToolFileChunk" --> Algo
    Storage[(SQLite + Filesystem)] <--> Backend
```

### How It Works

1. **Session Creation** — User provides a natural language description of their anomaly detection goal and uploads a CSV dataset.

2. **Pipeline Design** — User selects a pre-built template or manually constructs a DAG by dragging blocks onto the canvas and connecting them with edges.

3. **Configuration** — Each block can be configured:
   - **Upload**: Select which columns to include in analysis
   - **Normalization**: Choose method (`min_max`, `standard_scaler`, `robust`) and target columns
   - **Imputation**: Choose method (`median`, `mean`, `mode`, `forward_fill`) and target columns
   - **Algorithm**: Override the default prompt to guide the AI agent (e.g., "Use Isolation Forest with contamination=0.05")
   - **Aggregator**: Set aggregation method (`majority_vote`, `weighted_average`) and per-source weights

4. **Execution** — The DAG Executor performs a topological sort to determine execution order, then runs blocks layer by layer:
   - Blocks within the same layer execute **in parallel** via `asyncio.gather`
   - **Agent-backed blocks** (EDA, Algorithm) upload the dataset to Mistral's Files API and call `conversations.start` with a `ToolFileChunk` attachment, enabling the agent to run Python code directly on the data
   - **Local blocks** (Normalization, Imputation, Aggregator) process data directly using Pandas
   - Every status change broadcasts an SSE event to all connected clients

5. **Results** — Results populate in real-time across multiple tabs:
   - **EDA**: Statistical summary, column types, null counts, data quality flags
   - **Code**: The exact Python code executed by the Algorithm agent (with syntax highlighting via Shiki)
   - **Anomalies**: Detected anomaly rows enriched with original data columns
   - **Chat**: Ongoing conversation with the orchestrator agent

---

## 🗄️ Database Schema

Anomalistral uses an asynchronous SQLite database (`aiosqlite`) via SQLAlchemy 2.0. The schema is designed to efficiently track execution state, DAG structures, and real-time streaming events:

| Table | Description |
| :--- | :--- |
| **`sessions`** | The core entity representing an analysis workspace. Tracks session metadata, global pipeline status, user prompts, and the cached dataset file path / Mistral API `file_id`. |
| **`session_blocks`** | Represents individual DAG nodes (e.g., Upload, EDA, Algorithm). Stores block types, geometric coordinates for the UI, dynamic JSON configurations, and live execution statuses/results. |
| **`session_edges`** | Defines the directional connections (dependencies) between blocks. Critical for computing the topological sort and layer-based parallelism. |
| **`block_messages`** | Stores the entire multi-turn chat history specifically scoped to individual block-agents. |
| **`events`** | An append-only ledger recording all state changes (e.g., `block.started`, `pipeline.completed`). Crucial for reliably broadcasting and replaying Server-Sent Events (SSE) to frontend clients on reconnect. |
| **`block_definitions`** | Static definitions of available blocks, including input/output types, colors, icons, and default system prompts. |
| **`pipeline_templates`** | Contains predefined DAG layouts (like "Basic Anomaly Detection" or "Multi-Algorithm Ensemble") that users can clone instantly into a new active session. |

---

## 🧱 DAG Block Types

| Block | Category | AI Agent | I/O Types | Configurable Parameters |
| :--- | :--- | :---: | :--- | :--- |
| **Upload** | Data Input | ❌ | → `dataframe` | Column selection |
| **EDA** | Analysis | ✅ `code_interpreter` | `dataframe` → `eda_report` | — |
| **Normalization** | Processing | ❌ | `dataframe` → `dataframe` | Method: `min_max` · `standard_scaler` · `robust` · `standardize`; Column selection |
| **Imputation** | Processing | ❌ | `dataframe` → `dataframe` | Method: `median` · `mean` · `mode` · `forward_fill`; Column selection |
| **Algorithm** | Detection | ✅ `code_interpreter` | `dataframe` + `eda_report` → `anomaly_scores` | Custom prompt override |
| **Aggregator** | Ensemble | ❌ | `anomaly_scores` → `anomaly_scores` | Method: `majority_vote` · `weighted_average`; Per-source weights |
| **Anomaly Viz** | Visualization | ❌ | `anomaly_scores` + `dataframe` → — | — |

The DAG executor enforces **type compatibility** between connected blocks — edges are validated to ensure output types from the source node match the required input types of the target node. Cyclic dependency detection runs before every execution.

---

## 💻 Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **AI Core** | Mistral Agents API (`mistral-large-latest`) | Agent creation, `conversations.start`, `code_interpreter` sandbox |
| **AI Integration** | Mistral Files API | Dataset upload with `purpose="code_interpreter"`, `ToolFileChunk` attachment |
| **Backend Framework** | FastAPI | Async REST API with dependency injection |
| **Database** | SQLAlchemy 2.0 + aiosqlite (Async SQLite) | Sessions, blocks, edges, events, templates, messages |
| **Data Processing & Validation** | Pandas, NumPy | Local normalization, imputation, anomaly enrichment, and basic schema checks |
| **Streaming** | sse-starlette | Server-Sent Events with per-subscriber broadcast |
| **Retry Logic** | Custom `retry_sync` wrapper | Exponential backoff for Mistral API rate limits |
| **Frontend Framework** | Next.js 15 (App Router) + React 19 | SSR-ready SPA with file-based routing |
| **DAG Editor** | React Flow 12 (`@xyflow/react`) | Interactive node-edge canvas with custom nodes |
| **State Management** | Zustand 5 | Three stores: session, pipeline, stream |
| **UI Components** | shadcn/ui + Radix UI | Accessible, composable component primitives |
| **Styling** | Tailwind CSS 4 | Utility-first CSS with dark mode support |
| **Syntax Highlighting** | Shiki 4 (dynamic import) | WASM-based code highlighting for generated Python |
| **Markdown Rendering** | react-markdown + remark-gfm | Chat message formatting with GFM support |
| **SSE Client** | @microsoft/fetch-event-source | Robust EventSource with reconnection and auth headers |
| **Icons** | Lucide React | Consistent iconography across the UI |
| **Deployment** | Docker (multi-stage), Vercel, Railway | Production-ready containerization and hosting |

---

## 📂 Project Structure

```
anomalistral/
    ├──
    ├── README.md
    ├── backend/
    │   ├── README.md
    │   ├── Dockerfile
    │   ├── railway.toml
    │   ├── requirements.txt
    │   ├── .dockerignore
    │   ├── .env.example
    │   └── app/
    │       ├── __init__.py
    │       ├── config.py
    │       ├── deps.py
    │       ├── main.py
    │       ├── agents/
    │       │   ├── __init__.py
    │       │   ├── dag_executor.py
    │       │   ├── registry.py
    │       │   └── prompts/
    │       │       ├── __init__.py
    │       │       ├── algorithm.py
    │       │       ├── codegen.py
    │       │       ├── eda.py
    │       │       └── orchestrator.py
    │       ├── data/
    │       │   └── test_timeseries.csv
    │       ├── db/
    │       │   ├── __init__.py
    │       │   ├── seed.py
    │       │   └── session.py
    │       ├── models/
    │       │   ├── __init__.py
    │       │   ├── database.py
    │       │   └── schemas.py
    │       ├── routers/
    │       │   ├── __init__.py
    │       │   ├── dag.py
    │       │   ├── pipelines.py
    │       │   ├── sessions.py
    │       │   ├── stream.py
    │       │   ├── templates.py
    │       │   └── uploads.py
    │       └── services/
    │           ├── __init__.py
    │           ├── file_handler.py
    │           ├── retry.py
    │           └── streaming.py
    └── frontend/
        ├── README.md
        ├── components.json
        ├── eslint.config.mjs
        ├── next.config.ts
        ├── package.json
        ├── postcss.config.mjs
        ├── tsconfig.json
        ├── vercel.json
        └── src/
            ├── app/
            │   ├── globals.css
            │   ├── layout.tsx
            │   ├── not-found.tsx
            │   ├── page.tsx
            │   └── session/
            │       └── [id]/
            │           └── page.tsx
            ├── components/
            │   ├── chat/
            │   │   ├── BlockChat.tsx
            │   │   └── ChatPanel.tsx
            │   ├── error/
            │   │   ├── ErrorBoundary.tsx
            │   │   └── PanelError.tsx
            │   ├── layout/
            │   │   └── Header.tsx
            │   ├── loading/
            │   │   ├── PipelineSkeleton.tsx
            │   │   ├── ResultsSkeleton.tsx
            │   │   └── SessionSkeleton.tsx
            │   ├── pipeline/
            │   │   ├── BlockSettings.tsx
            │   │   ├── DAGToolbar.tsx
            │   │   ├── PipelineEdge.tsx
            │   │   ├── PipelineEditor.tsx
            │   │   ├── PipelineNode.tsx
            │   │   └── TemplateSelector.tsx
            │   ├── providers/
            │   │   └── ClientProviders.tsx
            │   ├── results/
            │   │   ├── AnomalyChart.tsx
            │   │   ├── CodeViewer.tsx
            │   │   └── EDAReport.tsx
            │   └── ui/
            │       ├── badge.tsx
            │       ├── button.tsx
            │       ├── card.tsx
            │       ├── dialog.tsx
            │       ├── dropdown-menu.tsx
            │       ├── input.tsx
            │       ├── progress.tsx
            │       ├── scroll-area.tsx
            │       ├── separator.tsx
            │       ├── skeleton.tsx
            │       ├── sonner.tsx
            │       ├── table.tsx
            │       ├── tabs.tsx
            │       ├── textarea.tsx
            │       └── tooltip.tsx
            ├── hooks/
            │   ├── useSession.ts
            │   └── useSSE.ts
            ├── lib/
            │   ├── api.ts
            │   └── utils.ts
            ├── stores/
            │   ├── pipelineStore.ts
            │   ├── sessionStore.ts
            │   └── streamStore.ts
            └── types/
                └── index.ts
```

---

## 📋 API Reference

### Sessions

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/sessions` | Create a new analysis session |
| `GET` | `/api/sessions/{id}` | Get session details (status, results, config) |
| `POST` | `/api/sessions/{id}/command` | Send a command: `chat`, `cancel`, `modify`, `approve` |
| `POST` | `/api/sessions/{id}/recover` | Mark a stuck session as failed |
| `GET` | `/api/sessions/{id}/artifacts` | List generated filesystem artifacts |

### DAG & Blocks

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sessions/{id}/dag` | Load the full DAG (nodes + edges) |
| `PUT` | `/api/sessions/{id}/dag` | Save/overwrite the entire DAG definition |
| `POST` | `/api/sessions/{id}/dag/validate` | Validate DAG for cycles and type mismatches |
| `POST` | `/api/sessions/{id}/blocks` | Add a new block to the DAG |
| `PUT` | `/api/sessions/{id}/blocks/{block_id}` | Update block configuration |
| `DELETE` | `/api/sessions/{id}/blocks/{block_id}` | Remove a block |
| `POST` | `/api/sessions/{id}/edges` | Connect two blocks with an edge |
| `DELETE` | `/api/sessions/{id}/edges/{edge_id}` | Remove an edge |
| `GET` | `/api/sessions/{id}/blocks/{block_id}/messages` | Get block-level chat history |
| `POST` | `/api/sessions/{id}/blocks/{block_id}/chat` | Send a message to a block's agent |

### Pipeline Control

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/sessions/{id}/pipeline/control` | Control pipeline execution (actions: `run`, `stop`) |
| `POST` | `/api/sessions/{id}/apply-template` | Apply a pre-built pipeline template to the session |

### Templates & Uploads

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/templates` | List all available pipeline templates |
| `GET` | `/api/templates/{id}` | Get a specific template definition |
| `POST` | `/api/uploads` | Upload a CSV or JSON dataset |

### Streaming

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/stream/{id}` | SSE event stream (replays full history on connect) |

### SSE Event Types

```
pipeline.started    pipeline.completed    pipeline.failed       pipeline.cancelled
block.started       block.completed       block.failed          block.status
block.agent.message chat.response
command.chat        command.cancel        command.modify        command.approve
dag.validated
eda.started         eda.completed         eda.failed
algorithm.started   algorithm.completed   algorithm.failed
codegen.started     codegen.completed     codegen.failed
```

---

## 🚀 Getting Started

### Prerequisites

- **Python** 3.10+
- **Node.js** 20+
- **Mistral API Key** — obtain from [console.mistral.ai](https://console.mistral.ai)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and add your MISTRAL_API_KEY

uvicorn app.main:app --reload --port 8000
```

The backend automatically seeds the database with block definitions and pipeline templates on first startup.

### Frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the Anomalistral workbench.

### Environment Variables

#### Backend (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MISTRAL_API_KEY` | *(required)* | Your Mistral API key |
| `MISTRAL_DEFAULT_MODEL` | `mistral-large-latest` | Model for all agents |
| `DATABASE_URL` | `sqlite+aiosqlite:///./anomalistral.db` | Async SQLite connection string |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded datasets |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

#### Frontend (`.env.local`)

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g., `http://localhost:8000`) |

---

## 🐳 Deployment

### Docker (Backend)

```bash
cd backend
docker build -t anomalistral-backend .
docker run -p 8000:8000 -e MISTRAL_API_KEY=your_key anomalistral-backend
```

The multi-stage Dockerfile uses `python:3.12-slim`, installs dependencies, and runs Uvicorn on port 8000.

### Vercel (Frontend)

The frontend includes a `vercel.json` configuration and is optimized for Vercel deployment with automatic edge routing.

### Railway (Backend)

The backend includes a `railway.toml` for one-click Railway deployment.

---

## 🧪 Pipeline Templates

### Basic Anomaly Detection

A simple linear pipeline for straightforward anomaly detection tasks:

```
Upload → EDA → Normalization → Algorithm → Anomaly Visualization
```

- Default normalization: `min_max`
- Default algorithm prompt: "Use Isolation Forest to detect anomalies"

### Multi-Algorithm Ensemble

A parallel pipeline that runs three independent algorithm blocks and merges their results:

```
Upload → EDA → Normalization → ┬─ Algorithm 1 ─┬→ Aggregator → Anomaly Visualization
                                ├─ Algorithm 2 ─┤
                                └─ Algorithm 3 ─┘
```

- Default aggregation: `majority_vote`
- Each algorithm block can be configured with a different prompt to use different detection methods

---

## 🏆 Mistral AI Hackathon 2026

Built within **48 hours** for the [Mistral AI Hackathon 2026](https://mistral.ai), showcasing the power of the **Mistral Agents API** with:
- `client.beta.agents.create` — Per-block agent creation with specialized system prompts
- `conversations.start` — Autonomous execution with `code_interpreter` running real Python code
- `client.files.upload` — Dataset injection via `ToolFileChunk` for direct sandbox access
- `conversations.append` — Multi-turn chat with persistent conversation context

Anomalistral demonstrates how autonomous AI agents can bridge the gap between complex ML engineering and **zero-code accessibility** — enabling anyone to build, customize, and execute anomaly detection pipelines through an intuitive visual interface.

---

## 👥 Team

**KR Agents Team**

- [Kacper Kozik](https://github.com/Kacper0199)
- [Kamil Bednarz](https://github.com/kambedn)

---

<p align="center">
  <sub>Built with Mistral AI · Next.js · FastAPI · React Flow</sub>
</p>
