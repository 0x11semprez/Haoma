/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  MOCK DATA — TO DELETE BEFORE DEMO / MERGE TO MAIN              ║
 * ║                                                                      ║
 * ║  Purpose: let Dev 3 iterate on the frontend before the FastAPI +     ║
 * ║  WebSocket layer is wired. Toggled by `VITE_USE_MOCKS=1`             ║
 * ║  (see `.env.development.local`).                                     ║
 * ║                                                                      ║
 * ║  Removal checklist — see vite/CLAUDE.md §Mocks. Grep this repo       ║
 * ║  for the literal tag `HAOMA_MOCK` to find every touch point.         ║
 * ║                                                                      ║
 * ║  DO NOT import this file from UI components. Only `lib/api.ts`       ║
 * ║  reads it — when mocks go, one file to delete + one block to strip.  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Shapes mirror `backend/src/haoma/schemas.py` 1:1. If the Pydantic side
 * changes, these fixtures drift — they are not a source of truth.
 */

import type {
  AlertLevel,
  DivergenceSignal,
  MacroVitalsState,
  ProjectedPoint,
  VitalsFrame,
  WebSocketFrame,
} from '@/types/api'
import type {
  AuthSession,
  PatientDetail,
  PatientSummary,
  WardSummary,
} from '@/types/ui'
import type { WsHandle, WsStatus } from './api'

/* ── Flag ────────────────────────────────────────────────────────────── */

// HAOMA_MOCK
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === '1'

/* ── Ward fixture ────────────────────────────────────────────────────── */

const WARD_PATIENTS: PatientSummary[] = [
  {
    patient_id: 'p-001',
    room_number: '12',
    display_name: 'Amelie R.',
    age_years: 4,
    pathology: 'Post-op sepsis',
    haoma_index: 0.81,
    alert_level: 'red',
    last_update: new Date().toISOString(),
  },
  {
    patient_id: 'p-002',
    room_number: '14',
    display_name: 'Lucas M.',
    age_years: 6,
    pathology: 'Post-op cardiac',
    haoma_index: 0.52,
    alert_level: 'orange',
    last_update: new Date().toISOString(),
  },
  {
    patient_id: 'p-003',
    room_number: '09',
    display_name: 'Mia F.',
    age_years: 3,
    pathology: 'Severe bronchiolitis',
    haoma_index: 0.46,
    alert_level: 'orange',
    last_update: new Date().toISOString(),
  },
  {
    patient_id: 'p-004',
    room_number: '07',
    display_name: 'Tom B.',
    age_years: 5,
    pathology: 'Post-op neurosurgery',
    haoma_index: 0.18,
    alert_level: 'green',
    last_update: new Date().toISOString(),
  },
  {
    patient_id: 'p-005',
    room_number: '03',
    display_name: 'Sara L.',
    age_years: 2,
    pathology: 'Pneumonia',
    haoma_index: 0.12,
    alert_level: 'green',
    last_update: new Date().toISOString(),
  },
  {
    patient_id: 'p-006',
    room_number: '05',
    display_name: 'Ethan V.',
    age_years: 7,
    pathology: 'Post-op monitoring',
    haoma_index: 0.08,
    alert_level: 'green',
    last_update: new Date().toISOString(),
  },
]

const HOSPITAL_NAME = "Children's Hospital of Philadelphia"
const WARD_NAME = 'Pediatric Intensive Care Unit'
const WARD_SHORT = 'PICU'
const BAY = 'Bay B'
const BEDS_TOTAL = 12
const SHIFT_NAME = 'Day shift'
const CHARGE_NURSE = 'L. Dumas, RN'
const CLINICIAN_NAME = 'Dr. Elena Reyes'

/** Demo day shift runs 07:00 → 19:00 local time. Both timestamps are
 *  reconstructed on each call so the handoff countdown stays accurate
 *  whenever the demo is rehearsed. */
function shiftBounds(): { startIso: string; endIso: string } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(7, 0, 0, 0)
  const end = new Date(now)
  end.setHours(19, 0, 0, 0)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

const PATIENT_DETAILS: Record<string, PatientDetail> = Object.fromEntries(
  WARD_PATIENTS.map((p) => [
    p.patient_id,
    {
      patient_id: p.patient_id,
      room_number: p.room_number,
      display_name: p.display_name,
      age_years: p.age_years,
      weight_kg: 12 + p.age_years * 2.8,
      pathology: p.pathology,
      admission_date: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
      hospital_name: HOSPITAL_NAME,
      ward_name: WARD_NAME,
    },
  ]),
)

/* ── REST ────────────────────────────────────────────────────────────── */

export async function mockFetchWard(): Promise<WardSummary> {
  await delay(120)
  const { startIso, endIso } = shiftBounds()
  return {
    hospital_name: HOSPITAL_NAME,
    ward_name: WARD_NAME,
    ward_short: WARD_SHORT,
    bay: BAY,
    beds_total: BEDS_TOTAL,
    shift_name: SHIFT_NAME,
    shift_end_iso: endIso,
    charge_nurse: CHARGE_NURSE,
    monitoring_since_iso: startIso,
    frames_dropped: 0,
    patients: WARD_PATIENTS.map((p) => ({ ...p })),
  }
}

export async function mockFetchPatient(id: string): Promise<PatientDetail> {
  await delay(120)
  const detail = PATIENT_DETAILS[id]
  if (!detail) throw new MockApiError(404, `Unknown mock patient ${id}`)
  return { ...detail }
}

export async function mockAuthenticate(badgeId: string): Promise<AuthSession> {
  await delay(220)
  const session: AuthSession = {
    token: `mock-token-${badgeId || 'anon'}`,
    clinician_name: CLINICIAN_NAME,
    role: 'attending',
    expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
  }
  localStorage.setItem('haoma.auth', JSON.stringify(session))
  return session
}

export async function mockFetchHealth() {
  await delay(40)
  return { status: 'ok', version: 'mock-0.0.0', mode: 'mocks' }
}

/* ── WebSocket ───────────────────────────────────────────────────────── */

// Real backend ticks every 2-3 s (root CLAUDE.md §Technical architecture > WebSocket).
// We use 2 000 ms to stay at the lower bound so UI devs see the same cadence.
const FRAME_INTERVAL_MS = 2000

export function mockSubscribeToPatient(
  patientId: string,
  handlers: {
    onFrame: (frame: WebSocketFrame) => void
    onStatus?: (status: WsStatus) => void
  },
): WsHandle {
  handlers.onStatus?.('connecting')
  let closed = false
  let step = 0
  const summary = WARD_PATIENTS.find((p) => p.patient_id === patientId)

  const open = window.setTimeout(() => {
    if (closed) return
    handlers.onStatus?.('open')
    tick()
  }, 180)

  let timer: number | null = null
  const tick = () => {
    if (closed) return
    const frame = summary
      ? makeFrame(summary, step)
      : makeFrame(WARD_PATIENTS[0], step)
    handlers.onFrame(frame)
    step += 1
    timer = window.setTimeout(tick, FRAME_INTERVAL_MS)
  }

  return {
    close() {
      closed = true
      window.clearTimeout(open)
      if (timer !== null) window.clearTimeout(timer)
      handlers.onStatus?.('closed')
    },
  }
}

/* ── Frame generator ─────────────────────────────────────────────────── */

/**
 * Phase progression (loops every ~90 frames ≈ 2.5 min so UI dev sees
 * green → orange → red cycles quickly). For non-featured patients the
 * curve is offset so the ward shows a mix of states.
 *
 * Sigmoid profile — NEVER linear (see root CLAUDE.md §Pillars).
 */
function progress(step: number, offset: number): number {
  const cycle = 90
  const t = ((step + offset) % cycle) / cycle // 0..1
  // Sigmoid centred at 0.55 with slope 10 → long plateau then fast climb
  const s = 1 / (1 + Math.exp(-10 * (t - 0.55)))
  return s
}

function levelFor(hi: number): AlertLevel {
  if (hi >= 0.7) return 'red'
  if (hi >= 0.4) return 'orange'
  return 'green'
}

function offsetFor(patientId: string): number {
  if (patientId === 'p-001') return 0
  if (patientId === 'p-002') return 20
  if (patientId === 'p-003') return 40
  return 60 + Number.parseInt(patientId.slice(-1), 10)
}

/** Shared hi generator so the projection is consistent with the live curve. */
function haomaAt(summary: PatientSummary, step: number): number {
  if (summary.patient_id === 'p-001') {
    return clamp(0.12 + progress(step, 0) * 0.78, 0, 1)
  }
  const offset = offsetFor(summary.patient_id)
  return clamp(
    summary.haoma_index + Math.sin((step + offset) / 6) * 0.04,
    0,
    1,
  )
}

/**
 * Pediatric normal ranges for a 4-year-old — root CLAUDE.md §Pillars.
 * Used to classify the "macro" view of the patient so the frontend doesn't
 * re-derive clinical logic. Only the four vitals the physician would glance
 * at first are scored; temperature gradient lives in the features block.
 */
function classifyMacro(v: VitalsFrame): MacroVitalsState {
  let out = 0
  if (v.heart_rate < 80 || v.heart_rate > 120) out += 1
  if (v.spo2 < 95) out += 1
  if (v.bp_systolic < 90 || v.bp_systolic > 110) out += 1
  if (v.respiratory_rate < 20 || v.respiratory_rate > 30) out += 1
  if (out === 0) return 'nominal'
  if (out <= 2) return 'borderline'
  return 'abnormal'
}

/** The Phase 2 moment — active when the macro view is still nominal
 *  but the micro-score is already drifting. The real PINN will emit this;
 *  the mock derives it from the same sigmoid that drives the live curve.
 */
function divergenceFrom(
  macro: MacroVitalsState,
  hi: number,
  trajectory: ProjectedPoint[],
): DivergenceSignal {
  if (macro !== 'nominal' || hi < 0.35) {
    return { active: false, lead_minutes: null, rationale: null }
  }
  const criticalPoint = trajectory.find((p) => p.score >= 80)
  return {
    active: true,
    lead_minutes: criticalPoint ? criticalPoint.seconds_ahead / 60 : null,
    rationale:
      'Macro vitals still within pediatric range while the micro-score climbs — vascular reserve is being consumed silently.',
  }
}

/** Forward risk trajectory — sampled from the same deterministic generator
 *  so the projected line joins the historical line seamlessly. Horizon is
 *  expressed in seconds; the frontend re-emits it on its x-axis.
 */
function projectTrajectory(
  summary: PatientSummary,
  step: number,
  horizonFrames: number,
  intervalSeconds: number,
): ProjectedPoint[] {
  const out: ProjectedPoint[] = []
  for (let k = 1; k <= horizonFrames; k++) {
    out.push({
      seconds_ahead: k * intervalSeconds,
      score: haomaAt(summary, step + k) * 100,
    })
  }
  return out
}

/**
 * Backend PINN output bounds, mirrored exactly from root CLAUDE.md
 * §Technical architecture > PINN model:
 *   - R̂: softplus + clamp [0.5, 5.0]   (vascular resistance head)
 *   - Q̂: softplus + clamp [0.1, 3.0]   (micro-vascular flow head)
 *   - Haoma index: sigmoid [0, 1]      (clinical risk head)
 *
 * Pediatric vitals ranges from root CLAUDE.md §Pillars (4-year-old):
 *   HR 80-120, BP sys 90-110, SpO2 95-100, RR 20-30 — STABLE.
 *   Degradation legitimately pushes these out of range; we clamp only
 *   at physiologically impossible limits so the UI sees the same extremes
 *   the real patient simulator will produce.
 */
const R_MIN = 0.5
const R_MAX = 5.0
const Q_MIN = 0.1
const Q_MAX = 3.0
// Physical baselines used to compute the percentage deltas the real
// backend emits (`resistance_delta_pct`, `flow_delta_pct`).
const R_BASELINE = 1.2
const Q_BASELINE = 1.4

function makeFrame(summary: PatientSummary, step: number): WebSocketFrame {
  const hi = haomaAt(summary, step)
  const alert = levelFor(hi)

  // Correlated physiology — HR up, HRV down, ΔT widens, PI drops with hi.
  // Clamps reflect physiological extremes rather than "stable" ranges.
  const hr = clamp(92 + hi * 40 + Math.sin(step / 3) * 2, 60, 220)
  const spo2 = clamp(99 - hi * 6 + Math.sin(step / 5) * 0.3, 70, 100)
  const bpSys = clamp(104 - hi * 14 + Math.sin(step / 4) * 2, 40, 180)
  const bpDia = clamp(62 - hi * 10 + Math.sin(step / 4) * 1.5, 20, 120)
  const tCentral = clamp(37.4 + hi * 0.6, 34, 42)
  const tPeripheral = clamp(35.8 - hi * 2.4, 28, 38)
  const pi = clamp(2.4 - hi * 1.9, 0.02, 20)
  const rr = clamp(22 + hi * 10, 8, 80)

  const deltaT = tCentral - tPeripheral
  const hrvTrend = -0.8 * hi + Math.sin(step / 7) * 0.05
  const piFcRatio = pi / hr
  const slope = 0.002 + hi * 0.03

  // PINN heads R̂ / Q̂ match the backend clamps exactly.
  const resistance = clamp(R_BASELINE + hi * 2.0, R_MIN, R_MAX)
  const flow = clamp(Q_BASELINE - hi * 1.1, Q_MIN, Q_MAX)
  const resistanceDelta = ((resistance - R_BASELINE) / R_BASELINE) * 100
  const flowDelta = ((flow - Q_BASELINE) / Q_BASELINE) * 100

  const prev = previousHi.get(summary.patient_id) ?? hi
  previousHi.set(summary.patient_id, hi)
  const trend =
    hi - prev > 0.004 ? 'rising' : hi - prev < -0.004 ? 'falling' : 'stable'

  const vitals: VitalsFrame = {
    heart_rate: hr,
    spo2,
    bp_systolic: bpSys,
    bp_diastolic: bpDia,
    temp_central: tCentral,
    temp_peripheral: tPeripheral,
    perfusion_index: pi,
    respiratory_rate: rr,
  }

  const macroState = classifyMacro(vitals)
  const projected = projectTrajectory(
    summary,
    step,
    PROJECTION_HORIZON_FRAMES,
    FRAME_INTERVAL_MS / 1000,
  )
  const divergence = divergenceFrom(macroState, hi, projected)

  return {
    timestamp: new Date().toISOString(),
    patient_id: summary.patient_id,
    vitals,
    features: {
      delta_t: deltaT,
      hrv_trend_30min: hrvTrend,
      pi_fc_ratio: piFcRatio,
      degradation_slope_30min: slope,
    },
    physics: {
      resistance,
      resistance_delta_pct: resistanceDelta,
      flow,
      flow_delta_pct: flowDelta,
    },
    haoma_index: hi,
    haoma_trend: trend,
    alert_level: alert,
    macro_vitals_state: macroState,
    shap_contributions: shapFor(alert),
    projected_trajectory: projected,
    divergence,
    recommendation: recommendationFor(alert),
  }
}

// 30 frames × 2s = 60s of forward look-ahead. Enough to show the steep
// section of the sigmoid without overrunning the visible window on the chart.
const PROJECTION_HORIZON_FRAMES = 30

const previousHi = new Map<string, number>()

function shapFor(alert: AlertLevel): WebSocketFrame['shap_contributions'] {
  if (alert === 'red') {
    return [
      {
        feature: 'delta_t',
        value: 0.34,
        label: 'Thermal gradient widening (peripheral vasoconstriction)',
      },
      {
        feature: 'pi_fc_ratio',
        value: 0.21,
        label: 'Capillary pulsatile flow collapsing',
      },
      {
        feature: 'hrv_trend_30min',
        value: 0.17,
        label: 'Heart-rate variability dropping',
      },
      {
        feature: 'degradation_slope_30min',
        value: 0.12,
        label: '30-min trajectory accelerating',
      },
    ]
  }
  if (alert === 'orange') {
    return [
      {
        feature: 'hrv_trend_30min',
        value: 0.18,
        label: 'Heart-rate variability drifting downward',
      },
      {
        feature: 'delta_t',
        value: 0.11,
        label: 'Thermal gradient slowly widening',
      },
      {
        feature: 'pi_fc_ratio',
        value: 0.07,
        label: 'Perfusion index normalised for HR — mild drop',
      },
    ]
  }
  return [
    {
      feature: 'pi_fc_ratio',
      value: -0.08,
      label: 'Capillary perfusion stable',
    },
    {
      feature: 'delta_t',
      value: -0.05,
      label: 'Thermal gradient within range',
    },
    {
      feature: 'hrv_trend_30min',
      value: -0.03,
      label: 'Heart-rate variability normal',
    },
  ]
}

function recommendationFor(alert: AlertLevel): string {
  if (alert === 'red') {
    return 'Escalate to senior. Reassess fluid status and consider a bolus.'
  }
  if (alert === 'orange') {
    return 'Close watch. Recheck vitals in 5 minutes.'
  }
  return 'No action. Routine monitoring.'
}

/* ── Utilities ───────────────────────────────────────────────────────── */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class MockApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'MockApiError'
    this.status = status
  }
}
