/**
 * Physiology-correlated traces for the vital cards. Each trace is driven
 * by real patient data (not decoration) and its rhythm matches bedside
 * monitor semantics — an ECG strip at the patient's HR, a pleth wave
 * synced to the pulse, etc.
 *
 * IEC 60601-1-8 register: these are data displays, not alarm signals.
 * Alarm signaling (§5) stays reserved for the score and vitals-in-alarm.
 * `prefers-reduced-motion` freezes every trace — handled in index.css.
 *
 * Beat duration is clamped to [30, 220] bpm AND quantized to a 5-bpm
 * step. Without the quantization, every WS frame (~2 s) rewrote the
 * inline `animation-duration` with a fresh string, which restarts the
 * CSS keyframe loop from 0 — producing a visible jump on the ECG and
 * pleth strips every tick. The step keeps the string stable across
 * small HR jitter while remaining visually faithful.
 */

import type { CSSProperties } from 'react'

type Tone = 'rose' | 'indigo' | 'slate'

const BPM_STEP = 5
const quantizeBpm = (bpm: number) => {
  const clamped = Math.max(30, Math.min(bpm, 220))
  return Math.round(clamped / BPM_STEP) * BPM_STEP
}
const beatSeconds = (bpm: number) => 60 / quantizeBpm(bpm)

const toneColor = (tone: Tone) => `var(--accent-${tone})`

interface TraceProps {
  heartRate: number
  tone?: Tone
  /** Render at a taller height (expanded detail view). */
  tall?: boolean
}

/* ── ECG strip ──────────────────────────────────────────────────────── */

export function EcgTrace({ heartRate, tone = 'rose', tall = false }: TraceProps) {
  const duration = beatSeconds(heartRate)
  const style: CSSProperties = {
    animationDuration: `${duration}s`,
    color: toneColor(tone),
  }
  return (
    <div className={`physio-trace${tall ? ' physio-trace--tall' : ''}`} aria-hidden="true">
      <svg
        className="physio-trace__scroll physio-trace__scroll--step"
        viewBox="0 0 400 56"
        preserveAspectRatio="none"
        style={style}
      >
        {[0, 100, 200, 300].map((ox) => (
          <path
            key={ox}
            d={ecgPath(ox)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
}

function ecgPath(x: number) {
  const y = 30
  return [
    `M ${x} ${y}`,
    `L ${x + 20} ${y}`,
    `Q ${x + 26} ${y - 3}, ${x + 32} ${y}`,
    `L ${x + 42} ${y}`,
    `L ${x + 47} ${y + 3}`,
    `L ${x + 50} ${y - 18}`,
    `L ${x + 53} ${y + 14}`,
    `L ${x + 56} ${y}`,
    `L ${x + 64} ${y}`,
    `Q ${x + 72} ${y - 5}, ${x + 80} ${y}`,
    `L ${x + 100} ${y}`,
  ].join(' ')
}

/* ── Plethysmograph (SpO₂) ──────────────────────────────────────────── */

export function PlethTrace({ heartRate, tone = 'indigo', tall = false }: TraceProps) {
  const duration = beatSeconds(heartRate)
  const style: CSSProperties = {
    animationDuration: `${duration}s`,
    color: toneColor(tone),
  }
  return (
    <div className={`physio-trace${tall ? ' physio-trace--tall' : ''}`} aria-hidden="true">
      <svg
        className="physio-trace__scroll physio-trace__scroll--step"
        viewBox="0 0 400 56"
        preserveAspectRatio="none"
        style={style}
      >
        {[0, 100, 200, 300].map((ox) => (
          <path
            key={ox}
            d={plethPath(ox)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
}

function plethPath(x: number) {
  const y = 30
  return [
    `M ${x} ${y}`,
    `L ${x + 10} ${y}`,
    `C ${x + 18} ${y - 2}, ${x + 22} ${y - 22}, ${x + 32} ${y - 22}`,
    `C ${x + 40} ${y - 22}, ${x + 46} ${y - 10}, ${x + 52} ${y - 6}`,
    `C ${x + 56} ${y - 10}, ${x + 60} ${y - 8}, ${x + 66} ${y - 4}`,
    `L ${x + 100} ${y}`,
  ].join(' ')
}

/* ── Pulse marker (BP) ──────────────────────────────────────────────── */

export function PulseTrace({ heartRate, tone = 'slate', tall = false }: TraceProps) {
  const duration = beatSeconds(heartRate)
  const color = toneColor(tone)
  return (
    <div className={`physio-trace${tall ? ' physio-trace--tall' : ''}`} aria-hidden="true">
      <svg
        viewBox="0 0 400 56"
        preserveAspectRatio="xMidYMid meet"
        className="physio-trace__pulse-svg"
      >
        <line
          x1={40}
          x2={400}
          y1={28}
          y2={28}
          stroke={color}
          strokeOpacity={0.28}
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        <g className="physio-pulse-dot" style={{ animationDuration: `${duration}s` }}>
          <circle cx={24} cy={28} r={8} fill={color} opacity={0.22} />
          <circle cx={24} cy={28} r={5} fill={color} />
        </g>
      </svg>
    </div>
  )
}

/* ── Thermal gradient (delta-T) ─────────────────────────────────────── */

interface ThermalProps {
  tempCentral: number
  tempPeripheral: number
  tall?: boolean
}

export function ThermalTrace({ tempCentral, tempPeripheral, tall = false }: ThermalProps) {
  const toPct = (t: number) => Math.max(2, Math.min(98, ((t - 30) / 10) * 100))
  const periph = toPct(tempPeripheral)
  const central = toPct(tempCentral)
  return (
    <div className={`thermal-trace${tall ? ' thermal-trace--tall' : ''}`} aria-hidden="true">
      <div className="thermal-trace__rail" />
      <div
        className="thermal-trace__gap"
        style={{ left: `${periph}%`, width: `${Math.max(0, central - periph)}%` }}
      />
      <div
        className="thermal-trace__mark thermal-trace__mark--periph"
        style={{ left: `${periph}%` }}
      >
        <span>periph.</span>
      </div>
      <div
        className="thermal-trace__mark thermal-trace__mark--central"
        style={{ left: `${central}%` }}
      >
        <span>central</span>
      </div>
    </div>
  )
}
