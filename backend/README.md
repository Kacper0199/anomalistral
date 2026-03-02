# Anomalistral — Backend

FastAPI-based backend powering the Anomalistral agentic MLOps platform.

## Stack

- **FastAPI** — Async REST API with dependency injection
- **SQLAlchemy 2.0 + aiosqlite** — Async SQLite ORM for sessions, blocks, edges, events
- **Mistral AI SDK** — Agent creation (`beta.agents.create`), conversation execution (`beta.conversations.start`), file upload (`files.upload`)
- **sse-starlette** — Server-Sent Events with per-subscriber broadcast queues
- **Pandas / NumPy** — Local data preprocessing and dataset validation on upload

## Quick Start

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add your MISTRAL_API_KEY to .env

uvicorn app.main:app --reload --port 8000
```

The database is auto-seeded with block definitions and pipeline templates on first startup.

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MISTRAL_API_KEY` | *(required)* | Mistral API key |
| `MISTRAL_DEFAULT_MODEL` | `mistral-large-latest` | Model used for all agents |
| `DATABASE_URL` | `sqlite+aiosqlite:///./anomalistral.db` | Database connection string |
| `UPLOAD_DIR` | `./uploads` | Upload storage directory |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

## Deployment

- **Docker**: `docker build -t anomalistral-backend .` (multi-stage, Python 3.12-slim)
- **Railway**: Configured via `railway.toml`
