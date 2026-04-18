/**
 * TypeScript mirror of `backend/src/haoma/schemas.py`.
 *
 * Rule: this file ONLY contains types that exist in Pydantic.
 * New UI-only contracts go in `types/ui.ts` so the Python/TS boundary stays clean.
 * Keep fields in the same order as the Pydantic file.
 */

export type AlertLevel = 'green' | 'orange' | 'red'
export type HaomaTrend = 'rising' | 'stable' | 'falling'
export type MacroVitalsState = 'nominal' | 'borderline' | 'abnormal'

export interface VitalsFrame {
  heart_rate: number
  spo2: number
  bp_systolic: number
  bp_diastolic: number
  temp_central: number
  temp_peripheral: number
  perfusion_index: number
  respiratory_rate: number
}

export interface FeatureVector {
  delta_t: number
  hrv_trend_30min: number
  pi_fc_ratio: number
  degradation_slope_30min: number
}

export interface PINNOutput {
  resistance: number
  flow: number
  haoma_index: number
}

export interface ShapContribution {
  feature: string
  value: number
  label: string
}

export interface PhysicsSummary {
  resistance: number
  resistance_delta_pct: number
  flow: number
  flow_delta_pct: number
}

/**
 * Forward-looking risk sample emitted by the PINN (or a slope extrapolation
 * until the PINN ships). Horizon is expressed relative to the current frame.
 */
export interface ProjectedPoint {
  seconds_ahead: number
  score: number
}

/**
 * "Silent compensation" flag — macro vitals still nominal while the Haoma
 * index is climbing. This is the Phase 2 moment of the pitch; the backend
 * owns the clinical logic so the UI never re-derives it.
 */
export interface DivergenceSignal {
  active: boolean
  lead_minutes: number | null
  rationale: string | null
}

export interface WebSocketFrame {
  timestamp: string
  patient_id: string
  vitals: VitalsFrame
  features: FeatureVector
  physics: PhysicsSummary
  haoma_index: number
  haoma_trend: HaomaTrend
  alert_level: AlertLevel
  macro_vitals_state: MacroVitalsState
  shap_contributions: ShapContribution[]
  projected_trajectory: ProjectedPoint[]
  divergence: DivergenceSignal
  recommendation: string
}
