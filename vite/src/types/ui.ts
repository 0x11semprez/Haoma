/**
 * UI-only contracts — NOT in `schemas.py` (yet).
 *
 * These shapes describe what the frontend EXPECTS from endpoints that
 * Dev 3 will implement next. Sync with Dev 3 before the backend adds them
 * so the Pydantic side matches these names 1:1.
 *
 * Endpoints expected:
 *   GET  /api/patients            → PatientSummary[]   (ward view)
 *   GET  /api/patients/:id        → PatientDetail      (before WS connect)
 *   POST /api/auth/badge          → AuthSession        (login)
 *   WS   /ws/patients/:id         → WebSocketFrame stream
 */

import type { AlertLevel } from './api'

export interface PatientSummary {
  patient_id: string
  room_number: string
  display_name: string
  age_years: number
  pathology: string
  haoma_index: number
  alert_level: AlertLevel
  last_update: string
}

export interface WardSummary {
  hospital_name: string
  ward_name: string
  patients: PatientSummary[]
}

export interface PatientDetail {
  patient_id: string
  room_number: string
  display_name: string
  age_years: number
  weight_kg: number
  pathology: string
  admission_date: string
  hospital_name: string
  ward_name: string
}

export interface BadgeAuthRequest {
  badge_id: string
}

export interface AuthSession {
  token: string
  clinician_name: string
  role: string
  expires_at: string
}
