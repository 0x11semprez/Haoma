import { VitalCard } from '@/components/patient/VitalCard'
import { LOINC } from '@/lib/clinical'
import type { WebSocketFrame } from '@/types/api'

/**
 * Band 2 — Vitals row. Four compact cards on a single line at ≥1100px,
 * wrapping to 2×2 below that. Thermal gradient reads `features.delta_t`
 * (single source of truth — see Option A in the layout audit).
 */
export function VitalsGrid({ frame }: { frame: WebSocketFrame | null }) {
  const v = frame?.vitals
  const f = frame?.features
  const bp =
    v !== undefined
      ? `${Math.round(v.bp_systolic)} / ${Math.round(v.bp_diastolic)}`
      : '—'
  const deltaT = f !== undefined ? f.delta_t.toFixed(2) : '—'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
      }}
    >
      <VitalCard
        label="Heart rate"
        value={v !== undefined ? String(Math.round(v.heart_rate)) : '—'}
        unit="bpm"
        loincCode={LOINC.HEART_RATE}
      />
      <VitalCard
        label="O₂ saturation"
        value={v !== undefined ? String(Math.round(v.spo2)) : '—'}
        unit="%"
        loincCode={LOINC.SPO2}
      />
      <VitalCard
        label="Blood pressure"
        value={bp}
        unit="mmHg"
        loincCode={LOINC.BP_SYSTOLIC}
      />
      <VitalCard
        label="Thermal gradient"
        value={deltaT}
        unit="°C"
        loincCode={LOINC.TEMP_CENTRAL}
      />
    </div>
  )
}
