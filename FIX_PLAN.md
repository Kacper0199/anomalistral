# Fix Plan: Recharts Crash + EDA Timing + SSE Stability

Branch: `fix/recharts-eda-sse-stability` (from `main` at `4fdaf17`)

## Bug Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | "Maximum update depth exceeded" — Recharts infinite loop | P0 FATAL | `EDAReport.tsx`, `AnomalyChart.tsx` |
| 2 | EDA results panel timing/sync flakiness | P1 | `page.tsx`, `EDAReport.tsx` |
| 3 | SSE "reconnecting" flicker during Validation stage | P2 | `useSSE.ts`, `page.tsx` |

---

## Bug 1: Recharts v3 Infinite Re-render Loop (P0 FATAL)

### Root Cause

Recharts v3.7.0 internally uses a Redux-based `ChartDataContextProvider`. When component props
contain **inline object/array/function literals**, every parent re-render creates new references.
Recharts v3 detects prop changes via reference equality → updates its internal Redux store →
triggers `forceStoreRerender` → parent re-renders → new inline references → infinite loop.

This was confirmed by:
- **recharts/recharts#6613** (v3.4.1): `useActiveTooltipDataPoints` infinite loop caused by inline
  `activeDot={{}}` objects. Fix: hoist objects outside component or `useMemo`.
- **Recharts maintainer @PavelVanecek**: "You're passing a new object reference on every render.
  v2 and v3 have completely different internals."
- Our stack trace: `ChartDataContextProvider.useEffect` → Redux dispatch → React-Redux
  `forceStoreRerender` → 128-frame loop.

### Trigger Points

Both `EDAReport.tsx` and `AnomalyChart.tsx` pass **inline object literals** directly as JSX props
to Recharts components. Every re-render (caused by SSE events updating Zustand stores) creates
new object references, triggering the Recharts v3 internal loop.

### Fix Strategy

Extract ALL inline object/array/function props on Recharts components into **module-level
constants** (for static values) or **`useMemo`/`useCallback` hooks** (for dynamic values).
This breaks the reference-equality loop.

### Exact Changes

#### File: `frontend/src/components/results/EDAReport.tsx`

**Step 1: Add module-level constants AFTER the existing `badgeToneClass` constant (line 243) and
BEFORE the `EDAReport` function (line 245).**

Add these constants:

```typescript
const CHART_MARGIN = { top: 10, right: 10, left: 0, bottom: 40 };

const XAXIS_TICK_LINE = { stroke: "hsl(var(--border))" };
const XAXIS_AXIS_LINE = { stroke: "hsl(var(--border))" };
const YAXIS_TICK_LINE = { stroke: "hsl(var(--border))" };
const YAXIS_AXIS_LINE = { stroke: "hsl(var(--border))" };

const TOOLTIP_CURSOR = { fill: "rgba(59,130,246,0.12)" };
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};
```

**Step 2: Replace inline objects in the BarChart JSX (lines 426-464).**

Replace the current BarChart block (lines 425-464) with:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={chartData} margin={CHART_MARGIN}>
    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
    <XAxis
      dataKey="name"
      stroke="hsl(var(--muted-foreground))"
      tickLine={XAXIS_TICK_LINE}
      axisLine={XAXIS_AXIS_LINE}
      angle={-28}
      textAnchor="end"
      interval={0}
      height={64}
    />
    <YAxis
      stroke="hsl(var(--muted-foreground))"
      tickLine={YAXIS_TICK_LINE}
      axisLine={YAXIS_AXIS_LINE}
    />
    <RechartsTooltip
      cursor={TOOLTIP_CURSOR}
      contentStyle={TOOLTIP_CONTENT_STYLE}
      formatter={tooltipFormatter}
    />
    <Bar dataKey="value" fill="#3b82f6" radius={BAR_RADIUS}>
      {chartData.map((entry) => (
        <Cell
          key={entry.name}
          fill={activeMetric === "missing" && entry.value > 0 ? "#f59e0b" : "#3b82f6"}
        />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

**Step 3: Add more module-level constants (after the ones from Step 1):**

```typescript
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
```

**Step 4: Inside the `EDAReport` function, add a `useCallback` for the tooltip formatter.
Place it right after the `results` useMemo (after line 270):**

```typescript
const tooltipFormatter = useCallback(
  (value: unknown) => {
    const numeric = Array.isArray(value) ? toNumber(value[0]) : toNumber(value);
    return [formatNumber(numeric, 2), activeMetric === "missing" ? "Missing" : "Mean"];
  },
  [activeMetric],
);
```

**Step 5: Update imports (line 3). Add `useCallback`:**

Change:
```typescript
import { useMemo, useState } from "react";
```
To:
```typescript
import { useCallback, useMemo, useState } from "react";
```

#### File: `frontend/src/components/results/AnomalyChart.tsx`

**Step 1: Add module-level constants AFTER the `VALUE_KEY_PRIORITY` array (line 94) and BEFORE
the `isRecord` function (line 96).**

Add these constants:

```typescript
const COMPOSED_CHART_MARGIN = { top: 16, right: 20, left: 6, bottom: 8 };

const AC_XAXIS_TICK = { fill: "#a1a1aa", fontSize: 12 };
const AC_XAXIS_TICK_LINE = { stroke: "#3f3f46" };
const AC_XAXIS_AXIS_LINE = { stroke: "#3f3f46" };

const AC_YAXIS_TICK = { fill: "#a1a1aa", fontSize: 12 };
const AC_YAXIS_TICK_LINE = { stroke: "#3f3f46" };
const AC_YAXIS_AXIS_LINE = { stroke: "#3f3f46" };

const AC_TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "0.5rem",
};
const AC_TOOLTIP_CURSOR = { stroke: "#52525b", strokeDasharray: "4 4" };
const AC_TOOLTIP_LABEL_STYLE = { color: "#d4d4d8" };
const AC_TOOLTIP_ITEM_STYLE = { color: "#e4e4e7" };

const AC_LEGEND_STYLE = { color: "#d4d4d8", fontSize: "12px" };
```

**Step 2: Find the `ComposedChart` JSX block (lines 614-679). Replace inline objects:**

Replace the current block with:

```tsx
<ResponsiveContainer width="100%" height={300}>
  <ComposedChart data={seriesData} margin={COMPOSED_CHART_MARGIN}>
    <defs>
      <linearGradient id="anomalyAreaGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
      </linearGradient>
    </defs>
    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
    <XAxis
      dataKey="x"
      tick={AC_XAXIS_TICK}
      tickLine={AC_XAXIS_TICK_LINE}
      axisLine={AC_XAXIS_AXIS_LINE}
      minTickGap={24}
      tickFormatter={formatXAxisTickMemo}
    />
    <YAxis
      tick={AC_YAXIS_TICK}
      tickLine={AC_YAXIS_TICK_LINE}
      axisLine={AC_YAXIS_AXIS_LINE}
      width={62}
    />
    <RechartsTooltip
      contentStyle={AC_TOOLTIP_CONTENT_STYLE}
      cursor={AC_TOOLTIP_CURSOR}
      labelStyle={AC_TOOLTIP_LABEL_STYLE}
      itemStyle={AC_TOOLTIP_ITEM_STYLE}
    />
    <Legend wrapperStyle={AC_LEGEND_STYLE} />
    <Area type="monotone" dataKey="value" fill="url(#anomalyAreaGradient)" stroke="none" name="Signal" />
    <Line
      type="monotone"
      dataKey="value"
      name="Time Series"
      stroke="#3b82f6"
      strokeWidth={2}
      dot={false}
      isAnimationActive={false}
    />
    {thresholds.map((threshold, index) => (
      <ReferenceLine
        key={`threshold-${threshold}-${index}`}
        y={threshold}
        stroke="#facc15"
        strokeDasharray="7 5"
        strokeWidth={1.5}
      />
    ))}
    {anomalies.map((anomaly) => (
      <ReferenceDot
        key={`anomaly-${anomaly.pointIndex}`}
        x={anomaly.x}
        y={anomaly.y}
        r={6}
        fill="#ef4444"
        stroke="#991b1b"
        strokeWidth={1.5}
        ifOverflow="visible"
      />
    ))}
  </ComposedChart>
</ResponsiveContainer>
```

**Step 3: The `tickFormatter` on XAxis is currently an inline arrow function (line 629):
`tickFormatter={(value) => formatXAxisTick(value as string | number)}`

Find the `formatXAxisTick` function in AnomalyChart.tsx and add a memoized wrapper.
Inside the main component function, add this `useCallback` (after other hooks):**

```typescript
const formatXAxisTickMemo = useCallback(
  (value: unknown) => formatXAxisTick(value as string | number),
  [],
);
```

**Step 4: Update imports (line 3). Add `useCallback`:**

Change:
```typescript
import { useMemo } from "react";
```
To:
```typescript
import { useCallback, useMemo } from "react";
```

---

## Bug 2: EDA Results Panel Timing/Sync Flakiness (P1)

### Root Cause

The `eda.completed` SSE event handler (page.tsx lines 205-218) calls `updateSession()` which
reads `useSessionStore.getState().currentSession`. If `currentSession` is `null` at that moment
(race condition with `loadSession` not yet completed), the update is silently skipped. The
`edaResults` memo (line 356-359) stays `null` → "Waiting for EDA analysis..." persists.

Eventually `codegen.completed` (line 268) or `pipeline.completed` (line 317) call
`loadSession(sessionId)` which fetches the full session from the API → `eda_results` finally
populates.

The ErrorBoundary key then switches from `"eda-pending"` to `"eda-loaded"` (line 408), causing a
full subtree unmount/remount. If the Recharts chart crashes during this remount (Bug 1), the
ErrorBoundary catches it and shows "EDA report failed to render".

### Fix Strategy

Two-part fix:
1. **Make `updateSession` resilient** — if `currentSession` is null, queue the update to apply
   when session loads.
2. **Force a `loadSession` call after `eda.completed`** — ensures server-side data is always
   fetched, removing dependence on SSE payload extraction.

### Exact Changes

#### File: `frontend/src/app/session/[id]/page.tsx`

**Step 1: After the `eda.completed` handler sets results via `updateSession` (line 211), add a
forced `loadSession` call. Change lines 205-218:**

Current code:
```typescript
if (event.type === "eda.completed") {
  setNodeStatus("eda", "success");
  setNodeData("eda", { completedAt: event.ts, previewData: "EDA analysis complete" });
  const results = getPayloadRecord(event.payload, "results");
  if (results) {
    updateSession((session) => ({ ...session, eda_results: results }));
  }
  addMessage({
    id: `${event.seq}`,
    role: "system",
    content: "EDA analysis completed.",
    timestamp: event.ts,
  });
  continue;
}
```

Replace with:
```typescript
if (event.type === "eda.completed") {
  setNodeStatus("eda", "success");
  setNodeData("eda", { completedAt: event.ts, previewData: "EDA analysis complete" });
  const results = getPayloadRecord(event.payload, "results");
  if (results) {
    updateSession((session) => ({ ...session, eda_results: results }));
  }
  if (sessionId) {
    void loadSession(sessionId);
  }
  addMessage({
    id: `${event.seq}`,
    role: "system",
    content: "EDA analysis completed.",
    timestamp: event.ts,
  });
  continue;
}
```

The only addition is `if (sessionId) { void loadSession(sessionId); }` after the
`updateSession` call. This ensures that even if `updateSession` silently fails
(because `currentSession` is null), the full session will be fetched from the API
and `eda_results` will populate.

**Step 2: Apply the same pattern to `validation.completed` (lines 292-306). Add
`if (sessionId) { void loadSession(sessionId); }` after the `updateSession` call
on line 298:**

Current (lines 292-306):
```typescript
if (event.type === "validation.completed") {
  setNodeStatus("validation", "success");
  setNodeData("validation", { completedAt: event.ts, previewData: "Validation complete" });
  const validation = getPayloadRecord(event.payload, "validation");
  if (validation) {
    updateSession((session) => ({ ...session, validation_results: validation }));
  }
  addMessage({ ... });
  continue;
}
```

Replace with:
```typescript
if (event.type === "validation.completed") {
  setNodeStatus("validation", "success");
  setNodeData("validation", { completedAt: event.ts, previewData: "Validation complete" });
  const validation = getPayloadRecord(event.payload, "validation");
  if (validation) {
    updateSession((session) => ({ ...session, validation_results: validation }));
  }
  if (sessionId) {
    void loadSession(sessionId);
  }
  addMessage({ ... });
  continue;
}
```

---

## Bug 3: SSE "Reconnecting" Flicker (P2)

### Root Cause

The SSE connection via `@microsoft/fetch-event-source` calls `onclose` when the server closes
the connection. During long pipeline stages (Validation), the server may have idle timeouts or
the HTTP connection may be interrupted. When `onclose` fires, `setConnected(false)` triggers
immediately, showing "reconnecting" in the UI even though the library auto-retries.

Additionally, the `.finally()` block (line 91-96) always calls `setConnected(false)` when the
fetch promise resolves, even during normal reconnection.

### Fix Strategy

1. **Debounce the "reconnecting" visual state** — don't show "reconnecting" immediately on
   `onclose`; wait 2 seconds to see if reconnection succeeds first.
2. **Guard `.finally()` block** — only set disconnected if this is the current controller
   (not a stale one from a retry).

### Exact Changes

#### File: `frontend/src/hooks/useSSE.ts`

**Step 1: Add a `reconnectTimerRef` after `retriesRef` (after line 16):**

Change:
```typescript
const abortRef = useRef<AbortController | null>(null);
const retriesRef = useRef(0);
```
To:
```typescript
const abortRef = useRef<AbortController | null>(null);
const retriesRef = useRef(0);
const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**Step 2: In the `disconnect` function (lines 21-28), clear the timer:**

Change:
```typescript
const disconnect = useCallback(() => {
  const controller = abortRef.current;
  abortRef.current = null;
  if (controller) {
    controller.abort();
  }
  setConnected(false);
}, [setConnected]);
```
To:
```typescript
const disconnect = useCallback(() => {
  if (reconnectTimerRef.current) {
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }
  const controller = abortRef.current;
  abortRef.current = null;
  if (controller) {
    controller.abort();
  }
  setConnected(false);
}, [setConnected]);
```

**Step 3: In `onopen` (lines 48-54), clear any pending reconnect timer and set connected:**

Change:
```typescript
onopen: async (response) => {
  if (!response.ok) {
    throw new Error(`SSE connection failed with status ${response.status}`);
  }
  retriesRef.current = 0;
  setConnected(true);
},
```
To:
```typescript
onopen: async (response) => {
  if (!response.ok) {
    throw new Error(`SSE connection failed with status ${response.status}`);
  }
  if (reconnectTimerRef.current) {
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }
  retriesRef.current = 0;
  setConnected(true);
},
```

**Step 4: In `onclose` (lines 66-77), debounce the `setConnected(false)` call:**

Change:
```typescript
onclose: () => {
  setConnected(false);
  if (controller.signal.aborted) {
    return;
  }
  if (retriesRef.current >= MAX_RETRIES) {
    abortRef.current = null;
    return;
  }
  retriesRef.current += 1;
  throw new Error("SSE closed by server");
},
```
To:
```typescript
onclose: () => {
  if (controller.signal.aborted) {
    setConnected(false);
    return;
  }
  if (retriesRef.current >= MAX_RETRIES) {
    abortRef.current = null;
    setConnected(false);
    return;
  }
  if (!reconnectTimerRef.current) {
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setConnected(false);
    }, 2000);
  }
  retriesRef.current += 1;
  throw new Error("SSE closed by server");
},
```

**Step 5: In `onerror` (lines 78-90), apply the same debounced disconnect pattern:**

Change:
```typescript
onerror: () => {
  if (controller.signal.aborted) {
    return null;
  }
  setConnected(false);
  if (retriesRef.current >= MAX_RETRIES) {
    abortRef.current = null;
    return null;
  }
  retriesRef.current += 1;
  const delay = Math.min(BASE_DELAY * Math.pow(2, retriesRef.current - 1), 10000);
  return delay;
},
```
To:
```typescript
onerror: () => {
  if (controller.signal.aborted) {
    return null;
  }
  if (retriesRef.current >= MAX_RETRIES) {
    abortRef.current = null;
    setConnected(false);
    return null;
  }
  if (!reconnectTimerRef.current) {
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setConnected(false);
    }, 2000);
  }
  retriesRef.current += 1;
  const delay = Math.min(BASE_DELAY * Math.pow(2, retriesRef.current - 1), 10000);
  return delay;
},
```

**Step 6: Guard the `.finally()` block (lines 91-96):**

Change:
```typescript
}).finally(() => {
  if (abortRef.current === controller) {
    abortRef.current = null;
  }
  setConnected(false);
});
```
To:
```typescript
}).finally(() => {
  if (abortRef.current === controller) {
    abortRef.current = null;
    setConnected(false);
  }
});
```

---

## Verification

After applying all changes, verify:

1. `cd frontend && npm run build` — must succeed with zero errors
2. `cd frontend && npm run lint` — must succeed
3. Manual test: Start a pipeline run, observe:
   - No "Maximum update depth exceeded" crash at any point
   - EDA results appear in the right panel within seconds of "EDA analysis completed" chat message
   - Stream status stays "connected" during stage transitions (brief "reconnecting" only after 2s gap)

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `frontend/src/components/results/EDAReport.tsx` | Hoist 8 inline objects to module constants, add `useCallback` for tooltip formatter, add `useCallback` import |
| `frontend/src/components/results/AnomalyChart.tsx` | Hoist 11 inline objects to module constants, add `useCallback` for tickFormatter, add `useCallback` import |
| `frontend/src/app/session/[id]/page.tsx` | Add `loadSession` calls after `eda.completed` and `validation.completed` events |
| `frontend/src/hooks/useSSE.ts` | Add reconnect timer debounce (2s), guard `.finally()` block, clear timer on disconnect/reconnect |
