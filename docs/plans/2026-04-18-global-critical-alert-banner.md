# Global Critical Alert Banner — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** When any monitored patient is in the `red` / `critical` alert level, every authenticated page (`/ward`, `/patient/:id`) must display a persistent, 2 Hz-pulsing red banner that names the worst patient, shows how many others are critical, and lets the clinician jump to that patient or silence the pulse for 2 min — fully compliant with IEC 60601-1-8 and the Haoma design system.

**Architecture:**
1. A new `useCriticalPatients` hook (singleton store pattern — mirrors `useAudio.ts`) owns the poll of `/api/patients` and the per-patient acknowledge timers. Both the `/ward` page and the new banner subscribe to it, so the poll happens once per session regardless of active route.
2. A new `<CriticalAlertBar />` component is rendered inside `RootLayout` in `App.tsx`, conditional on session + route, so it sits above `TopBar` on `/ward` and `/patient/:id` and survives route transitions.
3. When the banner is active for patient X, the ward card's *own* glyph pulse is suppressed for X (via a `body[data-banner-owner]` CSS hook) so there is a single visual authority per critical patient — safer than stacking two 2 Hz pulses.

**Tech Stack:** React 19 · React Router v7 (data router) · framer-motion · Tailwind v4 · native CSS variables & keyframes (no new deps).

**Testing note (hackathon reality):** the `vite/` project has no JS test runner — only `npm run lint` + `npm run build`. Per project `CLAUDE.md` ("No over-engineering: this is a hackathon"), we do **not** bootstrap Vitest for this feature. Each task ends with `lint` + `build` passing and a short *manual* verification checklist the developer performs in their already-running dev server (Claude must **never** start one — see `vite/CLAUDE.md`). Mock mode (`VITE_USE_MOCKS=1`) gives a deterministic critical state on `p-001` Amelie within ~2.5 min.

**Out of scope:**
- Backend endpoint for centralised ward critical state (the existing `/api/patients` poll already returns `alert_level` per patient — sufficient).
- Audio alarm escalation during silence (`useAlertSound` already owns this; we only *mute* for the silence window, not re-design).
- Persisting acknowledges across page reload (2-min window is ephemeral, in-memory only — safer than stale localStorage state).

---

## Task 1 — CSS tokens + banner keyframe hook

**Files:**
- Modify: `vite/src/index.css` (append a new section near the existing `@keyframes alarm-pulse-high` around line 157)

**Step 1: Read the existing alarm-pulse rules**

```bash
grep -n "alarm-pulse\|pulse-high\|prefers-reduced-motion" vite/src/index.css
```
Expected: lines ~157, 167, 177, 181, 186 already define the 2 Hz keyframe, the `.pulse-high` class, and the reduced-motion guard. **Do not duplicate them** — we reuse `pulse-high` for the banner triangle and add a *banner-only* background wash.

**Step 2: Add the banner styles**

Append to `vite/src/index.css`:

```css
/* ─── Global critical alert banner — IEC 60601-1-8 high-priority ─────
 * `.alert-banner` is the strip container. It wears a solid red-pale
 * band so the banner stays visible (and readable) even when the
 * `.pulse-high` layer is silenced or when prefers-reduced-motion is
 * set — per IEC, an active high-priority alarm may never appear OFF.
 *
 * Why two layers (solid band + pulsing overlay):
 *  1. Removes flashing background from the whole banner → smaller
 *     animated surface reduces epilepsy risk vs. pulsing the entire
 *     bar at 2 Hz (WCAG 2.3.1 — large-area flash guidance).
 *  2. The solid layer carries the information (color + text + glyph),
 *     the overlay carries the attention cue. If motion is reduced,
 *     the information layer alone is still triple-encoded.
 */
.alert-banner {
  background: var(--critical-pale);
  color: var(--ink);
  border-top: 2px solid var(--critical);
  border-bottom: 2px solid var(--critical);
}
.alert-banner__pulse-overlay {
  /* Narrow 2px strip at the top/bottom of the banner pulses — tiny
   * animated area, same 2 Hz cadence. Reuses `pulse-high` so
   * prefers-reduced-motion guard already covers it. */
  background: var(--critical);
  height: 2px;
}
.alert-banner[data-silenced='true'] .alert-banner__pulse-overlay {
  animation: none;
  opacity: 0.35;
}

/* Body-level hook — when the banner owns the critical state for a
 * given patient, the ward card drops its own glyph pulse so we
 * never stack two 2 Hz sources on the same patient. */
body[data-banner-owner] .ward-card[data-patient-id]:not([data-patient-id='']) .pulse-high {
  animation: none !important;
}
```

**Step 3: Verify no regression**

Run:
```bash
cd vite && npm run build
```
Expected: build passes. CSS is side-effect only — no TS/JSX consumer yet.

**Step 4: Commit**

```bash
git add vite/src/index.css
git commit -m "feat(vite): add alert-banner CSS tokens + body-level pulse-owner hook"
```

---

## Task 2 — `useCriticalPatients` hook (singleton store)

**Files:**
- Create: `vite/src/hooks/useCriticalPatients.ts`

**Step 1: Mirror the singleton pattern used in `useAudio.ts`**

Read `vite/src/hooks/useAudio.ts` lines 1-27 to confirm the `useSyncExternalStore` + `listeners: Set<() => void>` pattern. Reuse it verbatim.

**Step 2: Write the hook**

Create `vite/src/hooks/useCriticalPatients.ts`:

```ts
/**
 * Global store of currently-critical patients + per-patient silence windows.
 *
 * Why a singleton (not a React context):
 *  - One poll per session, regardless of which page subscribed (ward or banner).
 *  - Survives route changes without prop drilling through RootLayout.
 *  - Mirrors `useAudio` so devs only learn one pattern in this codebase.
 *
 * Poll cadence mirrors Ward's existing 2.5 s interval — same endpoint,
 * same data shape. The Ward page switches to consuming this store in
 * Task 3 so we don't double-poll.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { fetchWard, HaomaApiError } from '@/lib/api'
import { alertToSeverity } from '@/lib/clinical'
import type { PatientSummary, WardSummary } from '@/types/ui'

const POLL_MS = 2_500
const SILENCE_MS = 2 * 60 * 1_000 // IEC 60601-1-8 §6.3.3.3 — 2 min silence window

interface State {
  ward: WardSummary | null
  critical: PatientSummary[] // sorted haoma_index desc
  silencedUntil: Record<string, number> // patient_id → epoch ms
  lastError: string | null
}

let state: State = {
  ward: null,
  critical: [],
  silencedUntil: {},
  lastError: null,
}

const listeners = new Set<() => void>()
let pollTimer: number | null = null
let subscribers = 0

function notify() {
  listeners.forEach((cb) => cb())
}

function commit(next: State) {
  state = next
  notify()
}

function recomputeCritical(ward: WardSummary): PatientSummary[] {
  return ward.patients
    .filter((p) => alertToSeverity(p.alert_level) === 'critical')
    .sort((a, b) => b.haoma_index - a.haoma_index)
}

async function tick() {
  try {
    const ward = await fetchWard()
    commit({
      ...state,
      ward,
      critical: recomputeCritical(ward),
      lastError: null,
    })
  } catch (err) {
    const msg =
      err instanceof HaomaApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown error'
    commit({ ...state, lastError: msg })
  }
}

function startPolling() {
  if (pollTimer !== null) return
  void tick()
  pollTimer = window.setInterval(() => void tick(), POLL_MS)
}

function stopPolling() {
  if (pollTimer === null) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

export function silencePatient(patientId: string) {
  commit({
    ...state,
    silencedUntil: {
      ...state.silencedUntil,
      [patientId]: Date.now() + SILENCE_MS,
    },
  })
}

export function isSilenced(patientId: string): boolean {
  const until = state.silencedUntil[patientId]
  return typeof until === 'number' && until > Date.now()
}

export function useCriticalPatients() {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      subscribers += 1
      if (subscribers === 1) startPolling()
      return () => {
        listeners.delete(cb)
        subscribers -= 1
        if (subscribers === 0) stopPolling()
      }
    },
    () => state,
    () => state,
  )

  const silence = useCallback((id: string) => silencePatient(id), [])

  return {
    ward: snapshot.ward,
    critical: snapshot.critical,
    silencedUntil: snapshot.silencedUntil,
    lastError: snapshot.lastError,
    silence,
  }
}
```

**Step 3: Verify it type-checks**

Run:
```bash
cd vite && npm run build
```
Expected: build passes. The hook is referenced nowhere yet so there are no integration errors to catch.

**Step 4: Commit**

```bash
git add vite/src/hooks/useCriticalPatients.ts
git commit -m "feat(vite): add useCriticalPatients singleton store with silence window"
```

---

## Task 3 — Refactor `WardPage` to read from the store

**Files:**
- Modify: `vite/src/pages/Ward.tsx` (lines 1-107 — the polling effect + local cache)

**Why this task:** Task 2 introduces a new poll. Leaving Ward's own poll in place means duplicated network traffic AND races between two stale copies. Ward becomes a pure subscriber.

**Step 1: Replace the local `useState` + polling effect**

In `vite/src/pages/Ward.tsx`:

- Remove lines 16 (`let cachedWard`), 78-107 (the `useState`/`useCallback`/`useEffect` block that implements the poll), and the `fetchWard`/`HaomaApiError` imports on lines 12.
- Add `import { useCriticalPatients } from '@/hooks/useCriticalPatients'`.
- Replace the body of `WardPage` with:

```tsx
export function WardPage() {
  const { ward, lastError } = useCriticalPatients()
  const loading = ward === null && lastError === null

  const wardCtx = ward ? toWardContext(ward) : undefined

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg)' }}>
      <TopBar
        hospitalName={ward?.hospital_name}
        departmentName={ward?.ward_name}
        ward={wardCtx}
      />

      {loading ? (
        <CenteredMessage text="Loading patients…" />
      ) : lastError && ward === null ? (
        <ErrorPanel message={lastError} onRetry={() => window.location.reload()} />
      ) : ward ? (
        ward.patients.length === 0 ? (
          <CenteredMessage text="No patients to monitor" />
        ) : (
          <Grid patients={ward.patients} />
        )
      ) : null}
    </div>
  )
}
```

The `onRetry` hard-reload is intentional: once the store is primed, transient failures recover silently; a reload is only needed if the first tick never succeeded, which in practice means the backend is down — the page reload is fine there.

**Step 2: Lint + build**

```bash
cd vite && npm run lint && npm run build
```
Expected: pass. Dead-code warnings on `fetchWard`, `HaomaApiError`, `POLL_INTERVAL_MS` imports should prompt you to remove them too.

**Step 3: Manual verification** *(developer, in their running dev server — do not start a new one)*

Open `/ward`. Confirm:
- [ ] Patient list paints within one poll cycle.
- [ ] DevTools → Network tab shows exactly **one** `/api/patients` request every 2.5 s, not two.
- [ ] Navigating to `/patient/:id` and back does not trigger a double-fetch.

**Step 4: Commit**

```bash
git add vite/src/pages/Ward.tsx
git commit -m "refactor(vite): ward page subscribes to useCriticalPatients store"
```

---

## Task 4 — `<CriticalAlertBar />` component

**Files:**
- Create: `vite/src/components/CriticalAlertBar.tsx`

**Step 1: Write the component**

```tsx
/**
 * Persistent high-priority alarm banner (IEC 60601-1-8 §6.1.2).
 *
 * Visibility rule: visible on every authenticated route whenever the
 * ward store has ≥1 patient at alert_level === 'red'. On the patient's
 * own page, the banner still shows — the clinician needs confirmation
 * that the alarm state they're investigating is still active, and the
 * page's own 220 px pulsing score handles the primary attention cue.
 *
 * Dual-action bar: the label is a button that navigates to the patient;
 * the silence button mutes the pulse for 2 min per IEC.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Glyph } from './Glyph'
import { isSilenced, useCriticalPatients } from '@/hooks/useCriticalPatients'
import { useAudio } from '@/hooks/useAudio'

export function CriticalAlertBar() {
  const { critical, silence } = useCriticalPatients()
  const { setMuted } = useAudio()
  const navigate = useNavigate()
  const [, force] = useState(0)

  // Silence window is time-based; re-render once per second so the bar
  // un-silences itself when the 2 min window lapses.
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1_000)
    return () => window.clearInterval(id)
  }, [])

  // Body-level hook so the ward card knows to suppress its own pulse.
  useEffect(() => {
    const top = critical[0]?.patient_id
    if (top) document.body.setAttribute('data-banner-owner', top)
    else document.body.removeAttribute('data-banner-owner')
    return () => document.body.removeAttribute('data-banner-owner')
  }, [critical])

  const featured = critical[0]
  const silenced = featured ? isSilenced(featured.patient_id) : false
  const extras = Math.max(0, critical.length - 1)

  const onOpen = useCallback(() => {
    if (!featured) return
    navigate(`/patient/${encodeURIComponent(featured.patient_id)}`)
  }, [featured, navigate])

  const onSilence = useCallback(() => {
    if (!featured) return
    silence(featured.patient_id)
    setMuted(true)
  }, [featured, silence, setMuted])

  if (!featured) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="alert-banner"
      data-silenced={silenced ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 48px',
        gap: 24,
      }}
    >
      <div className="alert-banner__pulse-overlay pulse-high" aria-hidden />

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open critical patient ${featured.display_name}, room ${featured.room_number}`}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <Glyph
          shape="triangle"
          size="medium"
          color="var(--critical)"
          pulseClass={silenced ? '' : 'pulse-high'}
          aria-label="Critical"
        />
        <span
          className="uppercase"
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.2em',
            color: 'var(--critical)',
          }}
        >
          Critical
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          {featured.display_name} · Room {featured.room_number}
        </span>
        {extras > 0 ? (
          <span
            className="tabular"
            style={{
              fontSize: 15,
              color: 'var(--ink-soft)',
              fontStyle: 'italic',
              fontFamily: 'var(--serif)',
            }}
          >
            + {extras} more critical
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={onSilence}
        aria-label={silenced ? 'Silenced (2 min)' : 'Silence alarm for 2 minutes'}
        disabled={silenced}
        className="uppercase"
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.18em',
          padding: '8px 14px',
          background: silenced ? 'transparent' : 'var(--ink)',
          color: silenced ? 'var(--ink-soft)' : 'var(--bg)',
          border: `1px solid var(--ink)`,
          borderRadius: 3,
          cursor: silenced ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--sans)',
        }}
      >
        {silenced ? 'Silenced' : 'Silence 2 min'}
      </button>
    </div>
  )
}
```

**Step 2: Lint + build**

```bash
cd vite && npm run lint && npm run build
```
Expected: pass. The component is still unused — that's intentional; Task 5 mounts it.

**Step 3: Commit**

```bash
git add vite/src/components/CriticalAlertBar.tsx
git commit -m "feat(vite): add CriticalAlertBar with silence window + nav to patient"
```

---

## Task 5 — Mount the banner in `RootLayout`

**Files:**
- Modify: `vite/src/App.tsx` (lines 145-169 — the `RootLayout` return block)

**Step 1: Gate the banner on authenticated, non-landing routes**

Import the component:
```tsx
import { CriticalAlertBar } from './components/CriticalAlertBar'
```

Inside `RootLayout`, just before the `<AnimatePresence>` block (around line 146), compute:

```tsx
const session = getSession()
const isAuthedRoute =
  location.pathname === '/ward' || location.pathname.startsWith('/patient/')
const showBanner = session !== null && isAuthedRoute
```

Note: `getSession` is already imported on line 15.

Return:

```tsx
return (
  <>
    {showBanner ? <CriticalAlertBar /> : null}

    <AnimatePresence mode="wait" initial={false}>
      {/* unchanged motion.div */}
    </AnimatePresence>

    {authWipe && (
      <div
        className="auth-wipe-hold"
        aria-hidden="true"
        onAnimationEnd={handleAuthWipeEnd}
      />
    )}
  </>
)
```

The banner sits **outside** `AnimatePresence` deliberately — it must NOT unmount/remount during route transitions, otherwise the alarm flickers mid-navigation (jarring + violates IEC persistence).

**Step 2: Lint + build**

```bash
cd vite && npm run lint && npm run build
```
Expected: pass.

**Step 3: Manual verification** *(developer)*

With `VITE_USE_MOCKS=1` set and the dev server running locally:
- [ ] `/login` and `/` (Landing): banner NOT visible.
- [ ] `/ward`: within ~2.5 min the mock cycles Amelie to red → banner appears at top of page, pulses at 2 Hz, label reads `Critical — Amelie R. · Room 12`.
- [ ] Click the label: routes to `/patient/p-001`. Banner stays visible on the patient page.
- [ ] Use browser back: banner persists (no flicker).
- [ ] `prefers-reduced-motion: reduce` (Chrome DevTools → Rendering): banner keeps solid red band, glyph + pulse-overlay stop animating. Text still legible.

**Step 4: Commit**

```bash
git add vite/src/App.tsx
git commit -m "feat(vite): render CriticalAlertBar in RootLayout for authed routes"
```

---

## Task 6 — Suppress double-pulse on the ward card

**Files:**
- Modify: `vite/src/components/ward/PatientCard.tsx` (around line 64 — the `<button>` wrapper)

**Step 1: Tag the card with its patient id**

Add `data-patient-id={patient.patient_id}` to the `<button>` so the CSS selector added in Task 1 can target it:

```tsx
<button
  type="button"
  onClick={onClick}
  aria-label={ariaLabel}
  className="ward-card"
  data-patient-id={patient.patient_id}
  style={cardStyle}
>
```

The Task 1 CSS rule `body[data-banner-owner] .ward-card[data-patient-id]:not([data-patient-id='']) .pulse-high { animation: none !important; }` is broad on purpose — when the banner is active, ALL ward card pulses go silent. Rationale: if 3 patients are critical, the banner shows the worst one and the 2 others rely on the solid red border + glyph (already triple-encoded). Adding 2 more 2 Hz sources would be visually chaotic.

**Step 2: Lint + build**

```bash
cd vite && npm run lint && npm run build
```
Expected: pass.

**Step 3: Manual verification**

- [ ] With mocks: on `/ward` when Amelie is red, the banner pulses at 2 Hz, **and** Amelie's ward card glyph does NOT pulse (stays solid red triangle, solid red border).
- [ ] Silence the banner: the banner pulse-overlay dims to 0.35 opacity; ward card glyph still static (correct — we don't want to *resume* ward pulse just because the banner was silenced, the banner is still the authority).
- [ ] Once all patients drop below red, banner disappears; ward's normal pulse behavior resumes automatically because `body[data-banner-owner]` is removed.

**Step 4: Commit**

```bash
git add vite/src/components/ward/PatientCard.tsx
git commit -m "feat(vite): tag ward cards with patient_id so banner suppresses their pulse"
```

---

## Task 7 — Pre-demo rehearsal checklist

**Files:** none — this is a QA pass.

**Step 1: Run a full mock cycle (developer)**

With `VITE_USE_MOCKS=1`, from a cold page load:
- [ ] Start on `/` → Landing. No banner.
- [ ] `/login`, scan card → lands on `/ward`. No banner yet (Amelie starts green).
- [ ] Wait ~2 min (mock sigmoid). Amelie reaches red: banner paints in, starts pulsing, ward card Amelie stops pulsing, other cards behave normally.
- [ ] Click banner label → `/patient/p-001`. Banner persists. Big 220 px Haoma score pulses (existing behavior). Banner still pulses below the TopBar.
- [ ] Back to `/ward`. Banner unchanged.
- [ ] Click `Silence 2 min`. Button dims to `Silenced`. Audio goes muted (MuteToggle should reflect this). Banner overlay dims, glyph stops pulsing. Text is 100% legible.
- [ ] Wait 2 min or manually clear `state.silencedUntil` via DevTools to re-arm. Banner resumes pulse.
- [ ] Mock cycles Amelie back to orange / green → banner disappears cleanly, no stuck classes.

**Step 2: Accessibility grayscale + reduced-motion test**

In DevTools → Rendering:
- [ ] `Emulate CSS media feature prefers-reduced-motion: reduce`: banner still legible, pulse stops, glyph static.
- [ ] Elements → Filters → `grayscale(1)` on `<body>`: banner still clearly signals critical via triangle ▲ + word "Critical" + position at top of screen. Information intact without hue.
- [ ] Color-blind emulation (deuteranopia, protanopia, tritanopia): red band → brown-ish but glyph + label carry the message.

**Step 3: Lint + build final**

```bash
cd vite && npm run lint && npm run build
```
Expected: pass.

**Step 4: Pre-merge checklist from `vite/CLAUDE.md` §9**

Tick off in the PR description:
- [ ] No new clinical color used outside IEC context.
- [ ] Triple encoding: ▲ glyph + "Critical" word + red color.
- [ ] Grayscale test passed.
- [ ] `prefers-reduced-motion` respected.
- [ ] Night mode: banner contrast checked (foreground `--ink` on `--critical-pale` → verify ≥ 7:1 for AAA; if not, swap foreground to `--critical` text for the label).
- [ ] No `HAOMA_MOCK` tag touched (unchanged).
- [ ] English-only strings.

**Step 5: Final commit / PR**

If any last tweaks (e.g. night-mode contrast fix) are needed, commit them separately with a clear message. Then open the PR against `main`.

---

## Skills the executor should invoke

- `superpowers:executing-plans` — to walk the tasks in order.
- `superpowers:verification-before-completion` — before declaring "done" on any task, especially Tasks 5-7 where behavior is only observable in the browser.
- `frontend-design:frontend-design` — if the executor wants an independent review of the banner's visual choices against the design system.

---

## Known risks & design decisions (for the executor to respect)

1. **Don't stack 2 Hz pulses.** Task 6's CSS suppression is load-bearing — WCAG 2.3.1 discourages multiple simultaneous flashes in the viewport. If you are tempted to "also pulse the ward card to match", don't.
2. **Don't hide the banner when silenced.** Silencing mutes *attention*, not *information*. IEC 60601-1-8 forbids making an active high-priority alarm disappear from view. The solid red band must remain.
3. **Don't persist silence in localStorage.** A nurse handing off shift must not inherit a silenced alarm from the previous shift. In-memory only.
4. **Don't poll twice.** Task 3 is about *removing* the ward page's own poll. If you skip Task 3 you'll have two fetchers racing — the UI will flicker between stale snapshots.
5. **Banner must live outside `AnimatePresence`.** Inside it, the banner unmounts during the 260 ms route transition → the red bar blinks away mid-nav → the user reads that as "alarm cleared" — dangerous.
