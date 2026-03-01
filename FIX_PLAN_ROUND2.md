# FIX_PLAN_ROUND2.md — Anomalistral Bug Fix Round 2

## Investigation Summary

### Method
- Phase 6: Deep web research (Recharts v3, React 19 ErrorBoundary, SSE reconnect, Clipboard API, Python NaN JSON)
- Phase 7: Live debugging via Puppeteer MCP + SQLite queries + REST API inspection + backend log analysis
- Branch: `fix/recharts-eda-sse-stability` (HEAD: 410a975)

### Key Evidence Collected

| Evidence | Finding |
|----------|---------|
| SQLite DB query | All 5 sessions stuck at `validation_running`, 0 have `validation.completed` or `pipeline.failed` events |
| REST API (`/api/sessions/{id}`) | Returns valid JSON with `eda_results` (proper dict), `generated_code` (string, 1800-5000 chars), `validation_results: null` |
| Events table | 9 events per session: modify → pipeline.started → eda.started → eda.completed → algorithm.started → algorithm.completed → codegen.started → codegen.completed → validation.started. NO validation.completed, NO pipeline.completed, NO pipeline.failed |
| Backend logs | No errors/exceptions/tracebacks logged — validation phase appears to have been killed when server was stopped |
| Backend log (polling) | Frontend polls `GET /api/sessions/{id}` every ~1-2 seconds endlessly — `loadSession` call in a loop from `page.tsx` |
| `algorithm_recommendations` field | Backend stores raw markdown-fenced JSON → `_parse_json` wraps it in `{"raw": "..."}` instead of parsing the inner JSON |
| EDA data in DB | Clean JSON, no NaN/Infinity issues in this test dataset (2 rows, integer values) |
| `generated_code` in DB | Present and valid Python string (3892 chars for test session) |
| Puppeteer screenshot | Confirmed: EDA tab shows "EDA report failed to render", Validation shows "Running" badge, Pipeline DAG shows validation node as running |

---

## Bug 1: EDA "failed to render" crash (P0)

### Root Cause (REVISED after live debugging)

The original hypothesis (NaN in JSON) is **NOT the cause** for the current test data — the EDA JSON in SQLite is valid with no NaN values.

The **actual root cause** is a **race condition between SSE events and `loadSession` polling**:

1. On page load, `useEffect` at line 104-109 of `page.tsx` calls `loadSession(sessionId)` — this fetches the session from REST API and calls `setSession(session)` which replaces the entire session in the Zustand store.
2. Meanwhile, SSE events arrive and the event processing `useEffect` (line 159-360) calls `updateSession()` which does `setSession(updater(session))` — a read-modify-write on the current store state.
3. **The problem**: `loadSession` is called at THREE additional places:
   - Line 213: after `eda.completed` event
   - Line 271: after `codegen.completed` event  
   - Line 303: after `validation.completed` event
   - Line 323: after `pipeline.completed` event
4. Each `loadSession` call replaces the entire session atomically, but the REST API returns the session from the DB which may have a DIFFERENT structure than what SSE events set.

**Specifically for EDA crash**: The `eda.completed` SSE event payload at line 208 extracts `results` via `getPayloadRecord(event.payload, "results")` and sets it directly. But when `loadSession` fires right after (line 213), the REST API response goes through `_parse_json` in `sessions.py` which wraps the data. For THIS test data, both return the same dict shape, so the shape isn't the issue.

**The REAL crash**: After investigation, the ErrorBoundary at line 414 uses `key={edaResults ? "eda-loaded" : "eda-pending"}`. When `loadSession` replaces the session, if ANY property access on the new `eda_results` throws (e.g., the component accesses a nested property that's now missing), the ErrorBoundary catches it. BUT the ErrorBoundary has **NO `componentDidCatch`** method, so the actual error is silently swallowed.

**Most likely**: The crash may actually be in Recharts/rendering during the `loadSession` replacement when the component unmounts/remounts due to the ErrorBoundary key change. Without `componentDidCatch` logging, we can't see the real error.

### Fix

**File: `frontend/src/components/error/ErrorBoundary.tsx`**

Add `componentDidCatch` to log the actual error and component stack:

After line 29 (after `getDerivedStateFromError`), add:

```typescript
componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
  console.error("[ErrorBoundary] Caught error:", error);
  console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
}
```

**File: `frontend/src/app/session/[id]/page.tsx`**

Remove the redundant `loadSession` calls after SSE events. The SSE event already updates the session store with the correct data — calling `loadSession` immediately after is redundant and causes a flash where the session is replaced.

Remove lines 212-214 (loadSession after eda.completed):
```
        if (sessionId) {
          void loadSession(sessionId);
        }
```

Remove lines 270-272 (loadSession after codegen.completed):
```
        if (sessionId) {
          void loadSession(sessionId);
        }
```

Remove lines 302-304 (loadSession after validation.completed):
```
        if (sessionId) {
          void loadSession(sessionId);
        }
```

Remove lines 322-324 (loadSession after pipeline.completed):
```
        if (sessionId) {
          void loadSession(sessionId);
        }
```

Also remove `loadSession` from the dependency array of the events useEffect (line 360):
Change:
```typescript
}, [addMessage, events, loadSession, sessionId, setNodeData, setNodeStatus, setSession]);
```
To:
```typescript
}, [addMessage, events, sessionId, setNodeData, setNodeStatus, setSession]);
```

**Why this fixes it**: The SSE events already carry the data payload and update the session store correctly. The `loadSession` calls are redundant, cause unnecessary REST API polling, create race conditions where the store is overwritten with potentially stale/different-shaped data, and trigger unnecessary re-renders in all result components.

**File: `frontend/src/components/results/EDAReport.tsx`**

Add defensive try/catch around the entire render body. Even though we're removing the race condition, we should still be defensive:

Wrap the `useMemo` calls and all data access in try/catch. Specifically, change the `statsRows` useMemo (line 288-292):

```typescript
const statsRows = useMemo(() => {
  if (!results) return [];
  try {
    const statsSource = getRecord(results, ["statistics", "stats"]);
    return statsSource ? getStatsRows(results, statsSource) : [];
  } catch {
    return [];
  }
}, [results]);
```

Do the same for `missingChartData` (line 294-300) and `meanChartData` useMemos — wrap the inner logic in try/catch.

---

## Bug 2: Validation stays running forever (P1)

### Root Cause

**The validation phase never completes because the Mistral code_interpreter sandbox execution times out or the server is killed while the validation agent is running.** Evidence:

1. All 5 sessions in the DB are `validation_running`
2. There are NO `validation.completed`, `pipeline.completed`, or `pipeline.failed` events in the events table
3. The backend logs show no errors — the validation was simply interrupted when the server was stopped
4. The executor has a 120s timeout (line 169-176 of `executor.py`) but if the server is killed during that wait, neither the success nor error handler runs

**Secondary issue**: When the frontend loads a session page for a session that's stuck at `validation_running`, the `sessionStatus` useEffect (line 131-157 of `page.tsx`) applies `statusProgressMap["validation_running"]` which sets upload/eda/algorithm/codegen as "success" and validation as "running". This is correct based on the stored status, but there's NO mechanism to detect that the backend pipeline is dead and transition to a recoverable state.

**Third issue**: SSE stream is not resilient. The `StreamManager.unsubscribe()` (line 36-43 of `streaming.py`) drops the queue when subscriber count reaches 0. If validation.completed fires while the frontend is disconnected (between reconnect attempts), the event is lost forever. The stream router (stream.py) has NO historical replay — it only yields live queue events.

### Fix (3 parts)

#### Part A: Backend — Add session recovery endpoint

**File: `backend/app/routers/sessions.py`**

Add a new endpoint after the `get_session` endpoint (after line 167):

```python
@router.post("/{session_id}/recover", response_model=SessionResponse)
async def recover_session(session_id: str, db: AsyncSession = Depends(get_db)) -> SessionResponse:
    session = await _get_session_or_404(db, session_id)
    stuck_statuses = {"eda_running", "algorithm_running", "codegen_running", "validation_running"}
    if session.status not in stuck_statuses:
        return _to_response(session)
    session.status = "failed"
    await db.commit()
    await db.refresh(session)
    return _to_response(session)
```

#### Part B: Backend — Add SSE historical replay

**File: `backend/app/routers/stream.py`**

Replace the entire file with:

```python
from fastapi import APIRouter, Query, Request
from sqlalchemy import select
from sse_starlette import EventSourceResponse

from app.db.session import AsyncSessionLocal
from app.models.database import Event
from app.models.schemas import SSEEvent
from app.services.streaming import stream_manager

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/{session_id}")
async def stream_session(
    session_id: str,
    request: Request,
    last_event_id: int = Query(default=0, alias="lastEventId"),
) -> EventSourceResponse:
    async def event_generator():
        if last_event_id > 0:
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
                    import json
                    from datetime import UTC, datetime
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
        await stream_manager.unsubscribe(session_id)

    return EventSourceResponse(event_generator())
```

#### Part C: Frontend — Detect stuck sessions and offer recovery

**File: `frontend/src/app/session/[id]/page.tsx`**

After the `sessionStatus` useEffect (after line 157), add a stuck-session detection effect:

```typescript
const isStuck = useMemo(() => {
  if (!currentSession) return false;
  const stuckStatuses = new Set(["eda_running", "algorithm_running", "codegen_running", "validation_running"]);
  if (!stuckStatuses.has(currentSession.status)) return false;
  const created = new Date(currentSession.created_at).getTime();
  const now = Date.now();
  return now - created > 5 * 60 * 1000;
}, [currentSession]);
```

Then in the JSX for the Pipeline DAG section, after the stream status `<span>`, add:

```tsx
{isStuck && (
  <button
    className="rounded bg-amber-600/80 px-2 py-0.5 text-xs text-white hover:bg-amber-600"
    onClick={async () => {
      await fetch(`${API_URL}/sessions/${sessionId}/recover`, { method: "POST" });
      void loadSession(sessionId);
    }}
  >
    Recover stuck session
  </button>
)}
```

Add the import for `API_URL` from `@/lib/api` at the top of the file.

#### Part D: Frontend — Pass lastEventId on SSE reconnect

**File: `frontend/src/hooks/useSSE.ts`**

Change line 46 to include `lastEventId` as a query parameter (the server now accepts it):

Replace line 46:
```typescript
void fetchEventSource(`${API_URL}/stream/${sessionId}`, {
```
With:
```typescript
void fetchEventSource(`${API_URL}/stream/${sessionId}?lastEventId=${seq}`, {
```

This way, on reconnect, the server will replay any events that were missed while the frontend was disconnected.

---

## Bug 3: Code tab copy/download broken (P1)

### Root Cause (REVISED after live debugging)

The code IS present in the database (`generated_code` has 3892 chars for the test session). The REST API returns it correctly. The CodeViewer component logic is actually correct — `handleCopy` and `handleDownload` both guard with `if (!cleanCode) return` and the code extraction works.

**The actual issue**: The code is `null` in the frontend because the SSE `codegen.completed` event (line 266-279 of `page.tsx`) does NOT include the generated code in its payload — it only sends `{"size": 3892}`. The code is only available via `loadSession` which fetches from the REST API.

Looking at the event handler:
```typescript
if (event.type === "codegen.completed") {
  setNodeStatus("codegen", "success");
  setNodeData("codegen", { completedAt: event.ts, previewData: "Code generated" });
  updateSession((session) => ({ ...session, status: "validation_running" }));
  if (sessionId) {
    void loadSession(sessionId);  // <-- THIS is what brings the code
  }
  ...
}
```

The `loadSession` call at line 270-272 is what brings `generated_code` from the REST API. **BUT in Bug 1 fix above, we removed all `loadSession` calls!** So we need a different approach.

**Revised approach**: Instead of removing ALL `loadSession` calls, we should:
1. Keep `loadSession` but make it NOT replace the full session — instead, MERGE the REST API data with existing store data
2. OR: Include `generated_code` in the `codegen.completed` SSE event payload

Option 2 is simpler and more correct. The backend already stores the code before publishing the event.

### Fix

#### Part A: Backend — Include generated_code in codegen.completed event

**File: `backend/app/agents/executor.py`**

Change line 163:
```python
await self._publish("codegen.completed", {"size": len(code_output)})
```
To:
```python
await self._publish("codegen.completed", {"size": len(code_output), "code": code_output})
```

#### Part B: Frontend — Extract code from codegen.completed event

**File: `frontend/src/app/session/[id]/page.tsx`**

In the `codegen.completed` handler (around line 266-279), after `updateSession`, add code extraction:

Change:
```typescript
if (event.type === "codegen.completed") {
  setNodeStatus("codegen", "success");
  setNodeData("codegen", { completedAt: event.ts, previewData: "Code generated" });
  updateSession((session) => ({ ...session, status: "validation_running" }));
  if (sessionId) {
    void loadSession(sessionId);
  }
```

To:
```typescript
if (event.type === "codegen.completed") {
  setNodeStatus("codegen", "success");
  setNodeData("codegen", { completedAt: event.ts, previewData: "Code generated" });
  const generatedCodeValue = getPayloadString(event.payload, "code");
  updateSession((session) => ({
    ...session,
    status: "validation_running",
    ...(generatedCodeValue ? { generated_code: generatedCodeValue } : {}),
  }));
```

#### Part C: Frontend — Add initial loadSession but with merge logic

Since we're removing the per-event `loadSession` calls (Bug 1 fix), we need the initial `loadSession` (line 104-109) to properly hydrate all fields. This already works — it fetches the full session from REST API on page load. For sessions that completed in the past, all fields will be populated from the DB.

**File: `frontend/src/stores/sessionStore.ts`** (check if `setSession` does a full replace)

Actually, looking at useSession.ts line 57-58: `const session = await getSession(id); setSession(session);` — this does a full replace. For the initial load, this is fine because no SSE data exists yet.

The combination of:
1. Initial `loadSession` on page mount (hydrates all fields from DB)
2. SSE events carrying data payloads (EDA results, algorithm recs, generated code, validation results)
3. No redundant `loadSession` after SSE events

...should work correctly.

#### Part D: Also include EDA results in eda.completed event payload (already done)

Looking at the executor.py (line ~147-148), the eda.completed event already includes `{"results": eda_data}`. Good.

But we should also include validation results in validation.completed. Check executor.py line 185:
```python
await self._publish("validation.completed", {"validation": validation_data})
```
This already includes the data. Good.

#### Part E: Frontend — clipboard fallback for non-secure contexts

**File: `frontend/src/components/results/CodeViewer.tsx`**

The `handleCopy` function (line 71-92) already has a try/catch around `navigator.clipboard.writeText`. Add a fallback using `document.execCommand`:

Replace the `handleCopy` function:

```typescript
const handleCopy = async () => {
  if (!cleanCode) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cleanCode);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = cleanCode;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);

    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }

    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);

    toast.success("Code copied to clipboard");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Clipboard action failed.");
  }
};
```

---

## Additional Fix: Stop frontend polling storm

### Root Cause

The backend logs show the frontend polling `GET /api/sessions/{id}` every 1-2 seconds. This comes from the `loadSession` calls that fire on every SSE event + the initial mount.

### Fix

Already addressed by removing redundant `loadSession` calls in Bug 1 fix. The only remaining call is the initial mount `loadSession` at line 104-109, which fires once per session page load. This is correct behavior.

---

## Additional Fix: Backend NaN sanitization (preventive)

Even though the current test data doesn't have NaN values, real-world pandas EDA stats WILL produce NaN/Infinity for columns with all-null values, division by zero, etc.

**File: `backend/app/agents/executor.py`**

Add a NaN sanitizer function before line 24 (after imports):

```python
import math

def _sanitize_for_json(obj: Any) -> Any:
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(item) for item in obj]
    return obj
```

Then in the `_to_structured_payload` method, apply it before returning. Find the method and wrap its return value:

```python
def _to_structured_payload(self, raw_text: str) -> dict[str, Any]:
    # ... existing logic ...
    return _sanitize_for_json(result)
```

Also apply it before `json.dumps` calls at lines 135 and 182:

Line ~135 (eda results):
```python
eda_data = _sanitize_for_json(self._to_structured_payload(eda_raw))
```

Line ~182 (validation results):
```python
validation_data = _sanitize_for_json(self._to_structured_payload(validation_raw))
```

**File: `backend/app/routers/sessions.py`**

Improve `_parse_json` to handle Python's non-standard NaN in stored JSON:

Replace lines 26-35:
```python
def _parse_json(value: str | None) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        cleaned = value.replace("NaN", "null").replace("Infinity", "null").replace("-Infinity", "null")
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return {"raw": value}
    if isinstance(parsed, dict):
        return parsed
    return {"data": parsed}
```

---

## Execution Order

1. **ErrorBoundary componentDidCatch** (1 file, 3 lines) — gives us visibility into any remaining crashes
2. **Remove redundant loadSession calls** (1 file, ~15 lines removed) — fixes EDA crash + polling storm
3. **Include generated_code in codegen.completed SSE event** (2 files, ~5 lines) — fixes Code tab
4. **Backend NaN sanitizer** (2 files, ~20 lines) — preventive
5. **SSE historical replay** (1 file, full rewrite ~50 lines) — fixes validation lost events
6. **Session recovery endpoint** (1 file, ~10 lines) — fixes stuck sessions
7. **Frontend stuck session detection** (1 file, ~15 lines) — UX for stuck sessions
8. **Clipboard fallback** (1 file, ~15 lines) — fixes Code tab copy in edge cases
9. **SSE lastEventId query param** (1 file, 1 line) — completes SSE replay

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `frontend/src/components/error/ErrorBoundary.tsx` | Add `componentDidCatch` |
| `frontend/src/app/session/[id]/page.tsx` | Remove 4 `loadSession` calls, add stuck detection, extract code from SSE |
| `frontend/src/components/results/EDAReport.tsx` | Add defensive try/catch in useMemos |
| `frontend/src/components/results/CodeViewer.tsx` | Add clipboard fallback |
| `frontend/src/hooks/useSSE.ts` | Add lastEventId query param |
| `backend/app/agents/executor.py` | Add NaN sanitizer, include code in codegen.completed |
| `backend/app/routers/sessions.py` | Improve `_parse_json` NaN handling, add recovery endpoint |
| `backend/app/routers/stream.py` | Full rewrite with historical replay |

## Verification Steps

1. Clear the SQLite DB: `sqlite3 backend/anomalistral.db "DELETE FROM events; DELETE FROM sessions;"`
2. Restart backend: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
3. Open frontend: `http://localhost:3000`
4. Upload test_data.csv with prompt "Detect anomalies"
5. Verify:
   - EDA tab renders correctly and stays rendered (no flash/crash)
   - Code tab shows the generated Python code
   - Copy button works (check clipboard)
   - Download button downloads the file
   - Validation either completes (if Mistral API works) or times out → pipeline.failed event → error state in UI
   - If you kill the backend mid-validation and restart, the "Recover stuck session" button appears after 5 minutes
6. Check browser console — no errors should appear (ErrorBoundary will now log any that occur)
7. Check backend logs — no polling storm (should see only 1-2 GET requests per page load, not dozens)

---
END OF FIX_PLAN_ROUND2.md
