# 🌌 Anomalistral

[![Mistral Hackathon 2026](https://img.shields.io/badge/Mistral-Hackathon_2026-blueviolet?style=for-the-badge&logo=mistralai)](https://mistral.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Stack: Next.js 15](https://img.shields.io/badge/Frontend-Next.js_15-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![Stack: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

**Autonomous Agentic MLOps Platform for Time-Series Anomaly Detection.**

Anomalistral transforms natural language descriptions into production-ready anomaly detection pipelines. By orchestrating five specialized Mistral agents, the platform automates data ingestion, exploratory analysis, algorithm selection, code generation, and statistical validation—all visualized through an interactive DAG editor.

---

## 🛠️ Architecture

Anomalistral uses a multi-agent orchestration pattern powered by the **Mistral Agents API**. The frontend synchronizes with the backend via **Server-Sent Events (SSE)** to provide real-time updates on agent progress and pipeline state.

```mermaid
graph TD
    User([User]) <--> Frontend[Next.js 15 + React Flow 12]
    Frontend -- REST API --> Backend[FastAPI + SQLAlchemy]
    Backend -- SSE Events --> Frontend
    
    subgraph "Mistral Agentic Core"
        Orchestrator[Orchestrator Agent]
        EDA[EDA Agent]
        Algo[Algorithm Selector]
        CodeGen[Code Generator]
        Validator[Validation Agent]
        
        Orchestrator <--> EDA
        Orchestrator <--> Algo
        Orchestrator <--> CodeGen
        Orchestrator <--> Validator
    end
    
    Backend -- Agent Completion --> Orchestrator
    Storage[(SQLite + Filesystem)] <--> Backend
```

---

<!-- screenshots -->
*(Screenshots showing the interactive DAG, real-time agent chat, and anomaly visualization)*

---

## ✨ Features

- **Natural Language Orchestration**: Describe your data and detection goals; the Orchestrator handles the rest.
- **Interactive DAG Editor**: Visualize and modify the generated MLOps pipeline using React Flow 12.
- **Automated EDA**: Deep statistical analysis, distribution plots, and data quality scoring powered by Mistral-Large.
- **Intelligent Model Selection**: Algorithm recommendations (Isolation Forest, Local Outlier Factor, etc.) tailored to your specific data characteristics.
- **Production-Ready Code**: Instant generation of clean, documented Python code using Codestral.
- **Rigorous Validation**: Statistical performance metrics and automated validation reports to ensure reliability.
- **Real-time Streaming**: SSE-powered UI that reflects agent thoughts and pipeline execution status instantly.

---

## 💻 Tech Stack

| Component | Technology |
| :--- | :--- |
| **LLM Core** | Mistral Agents API (Large, Small, Codestral), Code Interpreter |
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| **State & Flow** | React Flow 12, Zustand |
| **Visuals** | Recharts (Time-series), Shiki (Syntax highlighting) |
| **Backend** | FastAPI, sse-starlette, SQLAlchemy (Async), SQLite |
| **Data Ops** | Pandera (Validation), Pandas, NumPy |
| **DevOps** | Docker (Multi-stage), Vercel, Railway |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 20+
- Mistral API Key

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

## 📂 Project Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── prompts/       (orchestrator, eda, algorithm, codegen, validation)
│   │   │   ├── executor.py
│   │   │   └── registry.py
│   │   ├── db/
│   │   ├── models/
│   │   ├── routers/           (sessions, pipelines, uploads, stream)
│   │   ├── services/          (streaming, file_handler, retry)
│   │   ├── config.py
│   │   └── main.py
│   ├── Dockerfile
│   ├── railway.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/               (landing page, session workspace, 404)
│   │   ├── components/
│   │   │   ├── chat/          (ChatPanel)
│   │   │   ├── error/         (ErrorBoundary, PanelError)
│   │   │   ├── loading/       (SessionSkeleton, PipelineSkeleton, ResultsSkeleton)
│   │   │   ├── pipeline/      (PipelineEditor, PipelineNode)
│   │   │   ├── results/       (EDAReport, CodeViewer, ValidationReport, AnomalyChart)
│   │   │   └── ui/            (shadcn/ui components)
│   │   ├── hooks/             (useSSE, useSession)
│   │   ├── stores/            (pipelineStore, sessionStore, streamStore)
│   │   └── types/
│   ├── vercel.json
│   └── package.json
└── README.md
```

---

## 📋 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/sessions` | `POST` | Initialize a new analysis session |
| `/api/sessions/:id/command` | `POST` | Dispatch natural language commands to agents |
| `/api/pipelines/:id/start` | `POST` | Trigger the full autonomous pipeline |
| `/api/uploads` | `POST` | Ingest CSV/Parquet time-series data |
| `/api/stream/:id` | `GET` | Connect to the SSE event stream |
| `/api/health` | `GET` | System health check |

---

## 🚢 Deployment

The project is architected for cloud-native deployment:
- **Frontend**: Optimized for Vercel with edge-ready API routes.
- **Backend**: Multi-stage Dockerfile ready for Railway or Render.
- **Resilience**: Implements exponential backoff on all LLM calls to respect rate limits.

---

## 🏆 Mistral Hackathon 2026

Built within 48 hours for the Mistral Hackathon, focusing on the power of **Agentic Handoffs** and the **Mistral Agents API**. Anomalistral demonstrates how autonomous agents can bridge the gap between complex ML requirements and zero-code accessibility.

**Team:** KR Agents Team — [Kacper Kozik](https://github.com/Kacper0199), Kamil Bednarz
