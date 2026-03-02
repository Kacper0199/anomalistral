# Anomalistral — Frontend

Next.js 15 frontend for the Anomalistral agentic MLOps platform — an interactive DAG workbench for building and executing anomaly detection pipelines.

## Stack

- **Next.js 15** (App Router) + **React 19** — SSR-ready SPA with file-based routing
- **React Flow 12** (`@xyflow/react`) — Interactive DAG editor with custom nodes and animated edges
- **Zustand 5** — Three dedicated stores: session, pipeline, stream
- **shadcn/ui + Radix UI** — Accessible, composable component library
- **Tailwind CSS 4** — Utility-first styling with dark mode
- **Shiki 4** — WASM-based syntax highlighting for generated Python code (dynamic import)
- **react-markdown + remark-gfm** — Chat message rendering with GFM support
- **@microsoft/fetch-event-source** — Robust SSE client with auto-reconnection
- **Lucide React** — Consistent iconography

## Quick Start

```bash
npm install

cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Pages

| Route | Description |
| :--- | :--- |
| `/` | Landing page — create session, describe goal, upload dataset |
| `/session/[id]` | Main workspace — three-panel layout: Chat (left), DAG Canvas (center), Results (right) |

## Deployment

Configured for **Vercel** via `vercel.json`. Supports edge-optimized deployment out of the box.
