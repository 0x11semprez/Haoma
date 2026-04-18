import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'

import { VitalCard } from '@/components/patient/VitalCard'
import { VitalDetailModal } from '@/components/patient/VitalDetailModal'
import {
  EcgTrace,
  PlethTrace,
  PulseTrace,
  ThermalTrace,
} from '@/components/patient/PhysioTrace'
import { LOINC } from '@/lib/clinical'
import type { WebSocketFrame } from '@/types/api'

/**
 * Band 2 — Vitals row. Four large clickable cards. Clicking a card
 * opens a centered detail modal (fade + scale) over a dimming curtain.
 *
 * No shared-layout `layoutId` morph: earlier attempts (card hero-
 * expands into the modal, then retracts on close) kept glitching at
 * the landing frame because the grid re-layouts every WebSocket tick
 * while the morph is in flight — framer's card-slot measurement was
 * stale by the time the exit completed. The plain fade+scale pattern
 * is bulletproof across re-renders.
 *
 * Physiology traces (ECG / pleth / pulse / thermal) live in the modal
 * only, never in the grid — scanning mode stays number-first, and the
 * grid stays lightweight.
 *
 * Thermal gradient reads `features.delta_t` (single source of truth —
 * Option A in the layout audit). Mark positions in ThermalTrace come
 * from vitals.temp_peripheral / vitals.temp_central directly.
 */

type VitalKey = 'hr' | 'spo2' | 'bp' | 'thermal'

type Tone = 'rose' | 'indigo' | 'slate'

interface VitalSpec {
  key: VitalKey
  label: string
  value: string
  unit: string
  loinc: string
  tone: Tone
  /** Pediatric normal range (4-year-old) — per CLAUDE.md pediatric values. */
  normalRange: string
  description: string
}

export function VitalsGrid({ frame }: { frame: WebSocketFrame | null }) {
  const [active, setActive] = useState<VitalKey | null>(null)

  const openDetail = (k: VitalKey) => setActive(k)
  const closeDetail = () => setActive(null)

  const v = frame?.vitals
  const f = frame?.features

  const specs = useMemo<VitalSpec[]>(() => {
    const hr = v?.heart_rate
    const bp =
      v !== undefined
        ? `${Math.round(v.bp_systolic)} / ${Math.round(v.bp_diastolic)}`
        : '—'
    const deltaT = f?.delta_t
    return [
      {
        key: 'hr',
        label: 'Heart rate',
        value: hr !== undefined ? String(Math.round(hr)) : '—',
        unit: 'bpm',
        loinc: LOINC.HEART_RATE,
        tone: 'rose',
        normalRange: '80 – 120 bpm',
        description:
          'Frequency of ventricular contraction. Elevated rate is one of the earliest compensations in hypovolemia before blood pressure moves.',
      },
      {
        key: 'spo2',
        label: 'O₂ saturation',
        value: v !== undefined ? String(Math.round(v.spo2)) : '—',
        unit: '%',
        loinc: LOINC.SPO2,
        tone: 'indigo',
        normalRange: '95 – 100 %',
        description:
          'Peripheral capillary oxygen saturation (SpO₂). Measured by pulse oximetry. Holds stable until late-stage compensation fails.',
      },
      {
        key: 'bp',
        label: 'Blood pressure',
        value: bp,
        unit: 'mmHg',
        loinc: LOINC.BP_SYSTOLIC,
        tone: 'slate',
        normalRange: 'Syst. 90 – 110 / Diast. 55 – 75 mmHg',
        description:
          'Systolic over diastolic arterial pressure. In children, BP is a late indicator — drop is preceded by tachycardia, cold extremities, and rising thermal gradient.',
      },
      {
        key: 'thermal',
        label: 'Thermal gradient',
        value: deltaT !== undefined ? deltaT.toFixed(2) : '—',
        unit: '°C',
        loinc: LOINC.TEMP_CENTRAL,
        tone: 'rose',
        normalRange: '< 3 °C (core minus peripheral)',
        description:
          'Difference between core and peripheral skin temperature. Widening gradient signals peripheral vasoconstriction — a silent compensation phase visible here before macro vitals move.',
      },
    ]
  }, [v, f])

  const renderModalTrace = (k: VitalKey) => {
    if (!v) return null
    switch (k) {
      case 'hr':
        return <EcgTrace heartRate={v.heart_rate} tone="rose" tall />
      case 'spo2':
        return <PlethTrace heartRate={v.heart_rate} tone="indigo" tall />
      case 'bp':
        return <PulseTrace heartRate={v.heart_rate} tone="slate" tall />
      case 'thermal':
        return (
          <ThermalTrace
            tempCentral={v.temp_central}
            tempPeripheral={v.temp_peripheral}
            tall
          />
        )
    }
  }

  const activeSpec = active !== null ? specs.find((s) => s.key === active) : null

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 16,
        }}
      >
        {specs.map((s) => (
          <VitalCard
            key={s.key}
            label={s.label}
            value={s.value}
            unit={s.unit}
            loincCode={s.loinc}
            tone={s.tone}
            onOpen={() => openDetail(s.key)}
          />
        ))}
      </div>

      <AnimatePresence>
        {activeSpec ? (
          <VitalDetailModal
            key={activeSpec.key}
            label={activeSpec.label}
            value={activeSpec.value}
            unit={activeSpec.unit}
            loincCode={activeSpec.loinc}
            tone={activeSpec.tone}
            normalRange={activeSpec.normalRange}
            description={activeSpec.description}
            trace={renderModalTrace(activeSpec.key)}
            onClose={closeDetail}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
