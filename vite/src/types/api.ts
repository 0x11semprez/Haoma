/**
 * TypeScript mirror of `backend/src/haoma/schemas.py`.
 *
 * Rule: this file ONLY contains types that exist in Pydantic.
 * New UI-only contracts go in `types/ui.ts` so the Python/TS boundary stays clean.
 * Keep fields in the same order as the Pydantic file.
 */

export type AlertLevel = 'green' | 'orange' | 'red'
export type HaomaTrend = 'rising' | 'stable' | 'falling'

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

export interface WebSocketFrame {
  timestamp: string
  patient_id: string
  vitals: VitalsFrame
  features: FeatureVector
  physics: PhysicsSummary
  haoma_index: number
  haoma_trend: HaomaTrend
  alert_level: AlertLevel
  shap_contributions: ShapContribution[]
  recommendation: string
}
