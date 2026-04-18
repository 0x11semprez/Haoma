/**
 * Clinical constants shared across UI components.
 * LOINC codes are mirrored from `backend/src/haoma/core/loinc.py`.
 */

import type { AlertLevel } from '@/types/api'

export const LOINC = {
  HEART_RATE: '8867-4',
  SPO2: '2708-6',
  BP_SYSTOLIC: '8480-6',
  BP_DIASTOLIC: '8462-4',
  TEMP_CENTRAL: '8329-5',
  TEMP_PERIPHERAL: '8310-5',
  PERFUSION_INDEX: '61006-3',
  RESPIRATORY_RATE: '9279-1',
} as const

/** User-facing labels for vital signs (English — jury language). */
export const VITAL_LABEL: Record<string, string> = {
  [LOINC.HEART_RATE]: 'Heart rate',
  [LOINC.SPO2]: 'O₂ saturation',
  [LOINC.BP_SYSTOLIC]: 'Systolic BP',
  [LOINC.BP_DIASTOLIC]: 'Diastolic BP',
  [LOINC.TEMP_CENTRAL]: 'Core temperature',
  [LOINC.TEMP_PERIPHERAL]: 'Peripheral temperature',
  [LOINC.PERFUSION_INDEX]: 'Perfusion index',
  [LOINC.RESPIRATORY_RATE]: 'Respiratory rate',
}

export const VITAL_UNIT: Record<string, string> = {
  [LOINC.HEART_RATE]: 'bpm',
  [LOINC.SPO2]: '%',
  [LOINC.BP_SYSTOLIC]: 'mmHg',
  [LOINC.BP_DIASTOLIC]: 'mmHg',
  [LOINC.TEMP_CENTRAL]: '°C',
  [LOINC.TEMP_PERIPHERAL]: '°C',
  [LOINC.PERFUSION_INDEX]: '',
  [LOINC.RESPIRATORY_RATE]: '/min',
}

/**
 * AlertLevel → clinical severity.
 * Translation chosen with medical advisor: green = stable, orange = watch (surveillance), red = critical.
 */
export type Severity = 'stable' | 'watch' | 'critical'
export type GlyphShape = 'circle-filled' | 'diamond' | 'triangle' | 'circle-hollow'

export const alertToSeverity = (level: AlertLevel): Severity => {
  if (level === 'red') return 'critical'
  if (level === 'orange') return 'watch'
  return 'stable'
}

export interface SeverityDescriptor {
  severity: Severity
  label: string
  iecPriority: string
  glyph: GlyphShape
  pulseClass: '' | 'pulse-high' | 'pulse-med'
  colorVar: string
  colorPaleVar: string
}

export const SEVERITY: Record<Severity, SeverityDescriptor> = {
  critical: {
    severity: 'critical',
    label: 'Critical',
    iecPriority: 'High priority',
    glyph: 'triangle',
    pulseClass: 'pulse-high',
    colorVar: 'var(--critical)',
    colorPaleVar: 'var(--critical-pale)',
  },
  watch: {
    severity: 'watch',
    label: 'Watch',
    iecPriority: 'Medium priority',
    glyph: 'diamond',
    pulseClass: 'pulse-med',
    colorVar: 'var(--warning)',
    colorPaleVar: 'var(--warning-pale)',
  },
  stable: {
    severity: 'stable',
    label: 'Stable',
    iecPriority: 'Normal',
    glyph: 'circle-filled',
    pulseClass: '',
    colorVar: 'var(--stable)',
    colorPaleVar: 'var(--stable-pale)',
  },
}

export const severityOf = (level: AlertLevel): SeverityDescriptor =>
  SEVERITY[alertToSeverity(level)]
