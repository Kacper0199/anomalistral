# FIX_PLAN_ROUND3 — Validation, SSE, CodeViewer, Distribution, Chat, Performance

Branch: `fix/validation-code-distribution-polish`
Base: `main` @ `17fa664`

---

## Implementation Order (dependency graph)

1. **SSE Infrastructure** (backend) — broadcast model, replay fix, double-unsub
2. **Validation Stuck** (backend) — guaranteed phase events, timeout, per-phase try/finally
3. **loadSession infinite loop** (frontend) — useCallback stabilization
4. **CodeViewer Shiki failure** (frontend) — dynamic import with fallback
5. **Distribution chart crash** (frontend) — replace Recharts BarChart with CSS bars
6. **Chat message hydration** (frontend) — replay DB events into chat on initial load

---

## Fix 1: SSE Infrastructure (backend)

### Problem
- `streaming.py` uses a single `asyncio.Queue` per session. Multiple subscribers do destructive `.get()` — events go to one subscriber only, not broadcast.
- `stream.py:56` calls `unsubscribe()` explicitly, but `streaming.py:26` already calls it in the generator's `finally` block → double-unsubscribe can delete the queue while other subscribers still connected.
- `stream.py:23` gate `if last_event_id > 0:` skips all DB event replay when client connects fresh with `lastEventId=0`.

### Changes

**File: `backend/app/services/streaming.py`** (full rewrite — 46 → ~55 lines)

Replace single-queue model with per-subscriber queues:

```python
import asyncio
from typing import AsyncGenerator

from app.models.schemas import SSEEvent


class StreamManager:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[SSEEvent]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> AsyncGenerator[SSEEvent, None]:
        queue: asyncio.Queue[SSEEvent] = asyncio.Queue()
        async with self._lock:
            self._subscribers.setdefault(session_id, []).append(queue)
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            async with self._lock:
                subs = self._subscribers.get(session_id)
                if subs and queue in subs:
                    subs.remove(queue)
                if subs is not None and len(subs) == 0:
                    self._subscribers.pop(session_id, None)

    async def publish(self, session_id: str, event: SSEEvent) -> None:
        async with self._lock:
            queues = self._subscribers.get(session_id, [])
            snapshot = list(queues)
        for q in snapshot:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def unsubscribe(self, session_id: str) -> None:
        pass


stream_manager = StreamManager()
```

Key changes:
- `_subscribers` is now `dict[str, list[asyncio.Queue]]` — each subscriber gets its own queue
- `publish` iterates ALL subscriber queues for the session (broadcast)
- `unsubscribe()` is now a no-op (cleanup is in generator's `finally`) — safe for the double-call in stream.py
- `subscribe` generator's `finally` removes only its own queue from the list
- Queue cleanup happens automatically when the subscriber disconnects

**File: `backend/app/routers/stream.py`** (lines 22-56)

Remove the `if last_event_id > 0:` gate so initial connect ALWAYS replays DB events:

```python
    async def event_generator():
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Event)
                .where(Event.session_id == session_id, Event.seq > last_event_id)
                .order_by(Event.seq)
            )
            missed_events = result.scalars().all()
            for db_event in missed_events:
                if await request.is_disconnected():
                    return
                payload = json.loads(db_event.payload) if isinstance(db_event.payload, str) else db_event.payload
                sse_event = SSEEvent(
                    session_id=session_id,
                    seq=db_event.seq,
                    ts=db_event.created_at.isoformat() if db_event.created_at else datetime.now(UTC).isoformat(),
                    type=db_event.event_type,
                    payload=payload,
                )
                yield {
                    "id": str(sse_event.seq),
                    "event": sse_event.type,
                    "data": sse_event.model_dump_json(),
                }

        async for event in stream_manager.subscribe(session_id):
            if await request.is_disconnected():
                break
            yield {
                "id": str(event.seq),
                "event": event.type,
                "data": event.model_dump_json(),
            }

    return EventSourceResponse(event_generator())
```

Changes:
- Removed `if last_event_id > 0:` gate — now ALWAYS queries DB for events with `seq > last_event_id`
- Removed explicit `await stream_manager.unsubscribe(session_id)` after the `async for` loop (cleanup is now in the generator's `finally`)
- When `last_event_id=0`, all persisted events are replayed, then live stream begins

### Verification
- Backend: `python -c "from app.services.streaming import stream_manager"` — no import error
- Backend: `python -c "from app.routers.stream import router"` — no import error

---

## Fix 2: Validation Stuck Forever (backend)

### Problem
- `asyncio.wait_for(asyncio.to_thread(...), timeout=120.0)` cannot reliably kill a blocking thread if Mistral SDK hangs (no socket timeout).
- On error, only `pipeline.failed` is published. There is NO per-phase `<phase>.failed` event.
- No `finally` block guarantees a "phase done" event — if the call hangs past the `wait_for` timeout but the thread doesn't raise, status stays `validation_running` forever.

### Changes

**File: `backend/app/agents/executor.py`**

#### Change 1: Add HTTP timeout to Mistral SDK calls (line 231-235)

Replace `_call_agent`:
```python
def _call_agent(self, agent_id: str, prompt: str, file_id: str | None = None) -> tuple[str, str | None]:
    inputs = _build_inputs_with_file(prompt, file_id)
    response = retry_sync(
        self.client.beta.conversations.start,
        agent_id=agent_id,
        inputs=inputs,
        timeout_ms=90_000,
    )
    return self._extract_conversation_text(response), self._conversation_id(response)
```

Add `timeout_ms=90_000` (90 seconds) to the SDK call. This ensures the HTTP request itself has a deadline. The Mistral Python SDK supports `timeout_ms` as a top-level parameter.

#### Change 2: Wrap each phase in try/finally with guaranteed events (lines 129-198)

Refactor the four sequential phases to use a helper that guarantees completion/failure events:

Add method `_run_phase` to the class:
```python
async def _run_phase(
    self,
    phase: str,
    status_key: str,
    agent_id: str,
    prompt: str,
    file_id: str | None = None,
    timeout: float = 120.0,
) -> str:
    await self._set_status(status_key)
    await self._publish(f"{phase}.started", {"session_id": self.session_id})
    try:
        raw, conversation_id = await asyncio.wait_for(
            self._run_agent_phase(agent_id=agent_id, prompt=prompt, file_id=file_id),
            timeout=timeout,
        )
        if phase == "eda" and conversation_id:
            await self._update_session(conversation_id=conversation_id)
        return raw
    except Exception as exc:
        await self._publish(f"{phase}.failed", {"error": self._error_message(exc)})
        raise
```

Then refactor `execute()` to use `_run_phase`:

```python
async def execute(self, user_prompt: str, dataset_path: str | None) -> None:
    try:
        self._current_phase = "init"
        await self._publish("pipeline.started", {"status": "started", "session_id": self.session_id})

        file_id: str | None = None
        dataset_context = ""
        if dataset_path:
            dataset_context = await asyncio.to_thread(_build_dataset_context, dataset_path)
            file_id = await asyncio.to_thread(_upload_file_to_mistral, self.client, dataset_path)
            if file_id:
                await self._update_session(mistral_file_id=file_id)

        self._current_phase = "eda"
        eda_raw = await self._run_phase(
            phase="eda",
            status_key="eda_running",
            agent_id=self._agent_id(await self.registry.get_eda_agent()),
            prompt=self._eda_prompt(user_prompt, dataset_context),
            file_id=file_id,
        )
        eda_data = _sanitize_for_json(self._to_structured_payload(eda_raw))
        await self._update_session(eda_results=json.dumps(eda_data))
        await self._publish("eda.completed", {"results": eda_data})

        self._current_phase = "algorithm"
        algorithm_raw = await self._run_phase(
            phase="algorithm",
            status_key="algorithm_running",
            agent_id=self._agent_id(await self.registry.get_algorithm_agent()),
            prompt=self._algorithm_prompt(eda_data),
        )
        algorithm_data = self._to_structured_payload(algorithm_raw)
        await self._update_session(algorithm_recommendations=json.dumps(algorithm_data))
        await self._publish("algorithm.completed", {"recommendations": algorithm_data})

        self._current_phase = "codegen"
        code_output = await self._run_phase(
            phase="codegen",
            status_key="codegen_running",
            agent_id=self._agent_id(await self.registry.get_code_agent()),
            prompt=self._code_prompt(eda_data, algorithm_data, dataset_context),
            file_id=file_id,
        )
        code_output = _extract_code_block(code_output)
        await self._update_session(generated_code=code_output)
        await self._persist_generated_code(code_output)
        await self._publish("codegen.completed", {"size": len(code_output), "code": code_output})

        self._current_phase = "validation"
        validation_raw = await self._run_phase(
            phase="validation",
            status_key="validation_running",
            agent_id=self._agent_id(await self.registry.get_validation_agent()),
            prompt=self._validation_prompt(code_output, dataset_context),
            file_id=file_id,
        )
        validation_data = _sanitize_for_json(self._to_structured_payload(validation_raw))
        await self._update_session(validation_results=json.dumps(validation_data), status="completed")
        await self._publish("validation.completed", {"validation": validation_data})

        self._current_phase = "complete"
        await self._publish("pipeline.completed", {"status": "completed", "session_id": self.session_id})
    except Exception as exc:
        message = self._error_message(exc)
        await self._set_status("failed")
        await self._publish("pipeline.failed", {"error": message, "phase": self._current_phase})
        raise
```

Key changes:
- `_run_phase` helper publishes `<phase>.started` and on exception publishes `<phase>.failed`
- Each phase still has its own `<phase>.completed` published explicitly after data processing
- `_call_agent` now passes `timeout_ms=90_000` to the Mistral SDK
- On timeout (`asyncio.TimeoutError`), `_run_phase`'s except clause publishes `<phase>.failed` → the outer except publishes `pipeline.failed` and sets status="failed"

#### Change 3: Handle `<phase>.failed` on frontend (page.tsx)

Add handling for the new phase-specific failure events in the SSE event processor. This is done in Fix 6's changes to page.tsx.

### Verification
- Backend: `python -c "from app.agents.executor import PipelineExecutor"` — no import error
- Review: timeout path → `asyncio.TimeoutError` caught by `_run_phase` except → publishes `validation.failed` → re-raised → caught by outer except → publishes `pipeline.failed` + sets status="failed"

---

## Fix 3: loadSession Infinite Loop (frontend)

### Problem
- `loadSession` in `useSession.ts:54` is a plain function inside the hook — **new reference every render**.
- `page.tsx:105-110` has `useEffect(() => { void loadSession(sessionId); }, [loadSession, sessionId])`.
- Since `loadSession` changes every render, the effect fires continuously: fetch → setSession → re-render → new loadSession → effect → infinite loop.

### Changes

**File: `frontend/src/hooks/useSession.ts`**

Wrap `loadSession` with `useCallback`:

```typescript
import { useCallback } from "react";
```

And change the function:
```typescript
const loadSession = useCallback(async (id: string): Promise<Session> => {
    setLoading(true);
    try {
      const session = await getSession(id);
      const existing = useSessionStore.getState().currentSession;
      if (existing && existing.id === id) {
        const merged: Session = {
          ...session,
          eda_results: session.eda_results ?? existing.eda_results,
          algorithm_recommendations: session.algorithm_recommendations ?? existing.algorithm_recommendations,
          generated_code: session.generated_code ?? existing.generated_code,
          validation_results: session.validation_results ?? existing.validation_results,
        };
        setSession(merged);
        return merged;
      }
      setSession(session);
      return session;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setSession]);
```

Since `setLoading` and `setSession` are Zustand selectors (stable references), the `useCallback` deps are stable → `loadSession` reference is stable → the effect in page.tsx stops looping.

Also wrap `createNewSession` for consistency:
```typescript
const createNewSession = useCallback(async (prompt: string, file?: File): Promise<Session> => {
    // ... same body ...
}, [setLoading, setSession, addMessage]);
```

### Verification
- `npm run build` — no errors
- `npm run lint` — no warnings about missing deps

---

## Fix 4: CodeViewer Shiki WASM Failure (frontend)

### Problem
- `import { codeToHtml } from "shiki"` is a static import that bundles Shiki's WASM loader.
- The WASM chunk (`_app-pages-browser_node_modules_shiki_dist_wasm_mjs`) times out loading in some environments.
- When it fails, the entire CodeViewer component fails to hydrate → buttons don't work.

### Changes

**File: `frontend/src/components/results/CodeViewer.tsx`**

Replace static `import { codeToHtml } from "shiki"` with dynamic import inside the effect:

Remove line 6: `import { codeToHtml } from "shiki";`

Change the highlight effect (lines 31-61):
```typescript
useEffect(() => {
    if (!cleanCode) {
      return;
    }

    let isMounted = true;

    const highlight = async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(cleanCode, {
          lang: "python",
          theme: "github-dark",
        });
        if (isMounted) {
          setHighlightedHtml(html);
        }
      } catch {
        if (isMounted) {
          setHighlightedHtml("");
        }
      }
    };

    void highlight();

    return () => {
      isMounted = false;
    };
  }, [cleanCode]);
```

Key changes:
- `codeToHtml` is now imported dynamically inside the async function — WASM load failure is caught silently
- If dynamic import fails, `highlightedHtml` stays `""` and the fallback `<pre>` renders
- Buttons are in the JSX *outside* the highlighted HTML section, so they always render and hydrate
- Removed the `toast.error` on highlight failure — it's noise, the fallback `<pre>` is good enough

### Verification
- `npm run build` — no errors (shiki becomes a lazy chunk, not blocking)
- Buttons work even when shiki fails because they're siblings of the highlight output, not children

---

## Fix 5: Distribution Chart Crash (frontend)

### Problem
- Recharts v3.7.0 internal bug: `getCateCoordinateOfBar` assumes `ticks` is always an array for categorical axes. During initial render, `ticks` can be `undefined`, causing `TypeError`.
- Inner ErrorBoundary catches it → shows "Distribution chart unavailable" instead of crashing EDA tab.
- But the chart SHOULD render, not crash.

### Changes

**File: `frontend/src/components/results/EDAReport.tsx`**

Replace the Recharts BarChart section (lines 421-489) with a pure CSS bar chart:

Remove Recharts imports (lines 2-13):
```typescript
// REMOVE:
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
```

Remove all Recharts-related module constants (lines 239-253):
```typescript
// REMOVE: CHART_MARGIN, XAXIS_TICK_LINE, XAXIS_AXIS_LINE, YAXIS_TICK_LINE, YAXIS_AXIS_LINE,
//         TOOLTIP_CURSOR, TOOLTIP_CONTENT_STYLE, BAR_RADIUS
```

Remove `tooltipFormatter` useCallback (lines 326-332).

Remove the `ErrorBoundary` import from the chart section (keep it for other uses).

Replace the chart rendering block (lines 421-489) with a CSS bar chart:

```tsx
{chartData.length > 0 ? (
    <Card className="border-border/70 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Distribution Preview</CardTitle>
          {missingChartData.length > 0 && meanChartData.length > 0 ? (
            <div className="inline-flex rounded-md border border-border/70 bg-muted/20 p-0.5">
              <button
                type="button"
                onClick={() => setMetricPreference("missing")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  activeMetric === "missing" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Missing
              </button>
              <button
                type="button"
                onClick={() => setMetricPreference("mean")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  activeMetric === "mean" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mean
              </button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <CSSBarChart data={chartData} metricType={activeMetric} />
      </CardContent>
    </Card>
) : null}
```

Add `CSSBarChart` component above `EDAReport`:

```tsx
interface BarDatum {
  name: string;
  value: number;
}

function CSSBarChart({ data, metricType }: { data: BarDatum[]; metricType: "missing" | "mean" }) {
  const maxValue = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="space-y-1.5">
      {data.map((entry) => {
        const pct = Math.min((Math.abs(entry.value) / maxValue) * 100, 100);
        const color = metricType === "missing" && entry.value > 0 ? "bg-amber-500" : "bg-blue-500";
        return (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-muted-foreground" title={entry.name}>
              {entry.name}
            </span>
            <div className="relative h-5 flex-1 rounded bg-muted/30">
              <div
                className={`absolute inset-y-0 left-0 rounded ${color} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatNumber(entry.value, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

This eliminates the Recharts dependency from EDAReport entirely. Pure CSS bars = zero crash risk, zero WASM, zero Redux store conflicts.

Also check if Recharts is still used elsewhere. If `AnomalyChart.tsx` uses it, keep the package. But EDAReport is now free of it.

### Verification
- `npm run build` — no errors (removed imports that were causing runtime crashes)
- `npm run lint` — no unused imports
- Visual: bars render immediately, no flicker, no ErrorBoundary trigger

---

## Fix 6: Chat Message Hydration (frontend)

### Problem
- Chat messages are ephemeral client-side state — stored only in `sessionStore.messages`.
- On page load, SSE connects with `lastEventId=0` but the old code skipped replay (Fix 1 addresses this).
- With Fix 1, all persisted events are replayed. The event processor in page.tsx:197-372 already creates chat messages from SSE events.
- BUT: messages from events that occurred before the SSE connection completes could still be lost if the connection takes time.

### Changes

After Fix 1 (SSE replay), ALL persisted events are replayed on initial connect. The event processor in page.tsx already handles each event type and calls `addMessage()`. The dedup guard in `sessionStore.ts:24` prevents duplicate messages.

The only remaining issue: `streamStore.clear()` is called on unmount (page.tsx:124), which resets `lastSeq` to 0. On remount, the SSE reconnects with `lastEventId=0`, replays all events, and the event processor re-creates all messages. This is correct behavior.

**File: `frontend/src/stores/streamStore.ts`**

Add a monotonic guard to `addEvent` — never go backwards on seq:

```typescript
addEvent: (event) =>
    set((state) => {
      if (event.seq <= state.lastSeq) {
        return state;
      }
      return {
        events: [...state.events, event].slice(-500),
        lastSeq: event.seq,
      };
    }),
```

**File: `frontend/src/app/session/[id]/page.tsx`**

Add handling for new `<phase>.failed` events from Fix 2. Add after the existing `pipeline.failed` handler (line 355):

```typescript
const phaseFailedMatch = event.type.match(/^(eda|algorithm|codegen|validation)\.failed$/);
if (phaseFailedMatch) {
    const failedPhase = phaseFailedMatch[1] as PipelineNodeId;
    setNodeStatus(failedPhase, "error");
    const errorMessage = getPayloadString(event.payload, "error") ?? "Unknown error";
    addMessage({
        id: `${event.seq}`,
        role: "system",
        content: `${failedPhase.charAt(0).toUpperCase() + failedPhase.slice(1)} failed: ${errorMessage}`,
        timestamp: event.ts,
    });
    continue;
}
```

Also: add `loadSession` call after `eda.completed` and `validation.completed` events to sync full session state from DB. This was done in a previous fix but may have been lost — verify it's present. Actually, the current code already calls `updateSession` inline which sets the store directly from the SSE event payload. With Fix 1's full replay, this is sufficient. No additional `loadSession` call needed.

### Verification
- `npm run build` — no errors
- `npm run lint` — no warnings
- Behavior: On page load → SSE connects with lastEventId=0 → all DB events replayed → event processor creates all messages → chat shows full history

---

## Frontend SSEEvent Type Update

**File: `frontend/src/types/index.ts`**

Add phase failure event types:
```typescript
export type SSEEventType =
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "eda.started"
  | "eda.completed"
  | "eda.failed"
  | "algorithm.started"
  | "algorithm.completed"
  | "algorithm.failed"
  | "codegen.started"
  | "codegen.completed"
  | "codegen.failed"
  | "validation.started"
  | "validation.completed"
  | "validation.failed"
  | "chat.response"
  | "command.chat"
  | "command.approve"
  | "command.modify"
  | "command.cancel";
```

---

## Summary of ALL file changes

| # | File | Change type | Lines affected |
|---|------|-------------|----------------|
| 1 | `backend/app/services/streaming.py` | Full rewrite | 46 → ~42 |
| 2 | `backend/app/routers/stream.py` | Remove gate + unsub | Lines 22-58 |
| 3 | `backend/app/agents/executor.py` | Add _run_phase, timeout_ms, refactor execute() | Lines 115-206, 219-236 |
| 4 | `frontend/src/hooks/useSession.ts` | Add useCallback to loadSession | Lines 1-83 |
| 5 | `frontend/src/hooks/useSSE.ts` | No changes needed (Fix 1 handles replay) | - |
| 6 | `frontend/src/components/results/CodeViewer.tsx` | Dynamic shiki import | Lines 6, 31-61 |
| 7 | `frontend/src/components/results/EDAReport.tsx` | Remove Recharts, add CSSBarChart | Lines 2-13, 239-253, 326-332, 421-489 |
| 8 | `frontend/src/app/session/[id]/page.tsx` | Add phase.failed handler | Lines 355+ |
| 9 | `frontend/src/stores/streamStore.ts` | Monotonic seq guard | Lines 20-24 |
| 10 | `frontend/src/types/index.ts` | Add phase.failed event types | Lines 10-26 |

## Testing checklist (after all fixes)

1. `cd frontend && npm run build` — 0 errors
2. `cd frontend && npm run lint` — 0 errors, 0 warnings
3. `cd backend && python -c "from app.services.streaming import stream_manager"` — no error
4. `cd backend && python -c "from app.routers.stream import router"` — no error
5. `cd backend && python -c "from app.agents.executor import PipelineExecutor"` — no error
6. Commit on branch, merge to main with `--no-ff`
