/**
 * Ward patient card — horizontal room compartment.
 *
 * Layout (horizontal): bed diagram → patient identity → Haoma score + severity.
 * Reads landscape so the card shape matches the "hospital room" metaphor.
 *
 * Design system: triple-encoded severity (border color + glyph + label).
 * Bed illustration stays in ink strokes only so it doesn't fight the IEC
 * palette — clinical meaning is carried by the border + glyph, not the bed.
 */

import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Glyph } from '@/components/Glyph'
import { severityOf, type Severity } from '@/lib/clinical'
import { useAudio } from '@/hooks/useAudio'
import type { PatientSummary } from '@/types/ui'

interface Props {
  patient: PatientSummary
}

export function PatientCard({ patient }: Props) {
  const navigate = useNavigate()
  const { play } = useAudio()
  const severity = severityOf(patient.alert_level)
  const score = Math.round(patient.haoma_index * 100)

  // Uniform 2px border across all severities so every card has identical outer
  // dimensions. Severity is still encoded via color (border) + glyph + label.
  const borderColor =
    severity.severity === 'critical' || severity.severity === 'watch'
      ? severity.colorVar
      : 'var(--line)'

  const cardStyle: CSSProperties = {
    border: `2px solid ${borderColor}`,
    background: 'var(--bg)',
    borderRadius: 'var(--radius-card)',
    padding: '32px 36px',
    textAlign: 'left',
    cursor: 'pointer',
    // transform + border-color transitions live in `.ward-card` (index.css) so
    // hover/press animate smoothly. Setting `transition` here would shadow them.
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    // Fixed height + full width — every card identical regardless of content.
    // `width: 100%` is load-bearing: without it a <button> shrinks to fit.
    width: '100%',
    height: 280,
    boxSizing: 'border-box',
  }

  const ariaLabel = `Room ${patient.room_number}, ${patient.display_name}, score ${score}, ${severity.label}`

  const onClick = () => {
    play('uiClick')
    navigate(`/patient/${encodeURIComponent(patient.patient_id)}`)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="ward-card"
      style={cardStyle}
    >
      {/* Bed diagram — top-down schematic on the left. Breath animation is
       * severity-keyed: stable = none (per §5 "stable has no motion"), watch
       * ≈ 20/min, critical ≈ 30/min (tachypnea). The bed becomes a passive
       * second indicator — a motion-coded severity scan of the ward. */}
      <div
        className="ward-card-divider flex items-center justify-center"
        style={{
          flexShrink: 0,
          paddingRight: 12,
          borderRight: '1px solid var(--line-soft)',
        }}
        aria-hidden="true"
      >
        <span className="ward-card-bed" style={{ display: 'inline-flex' }}>
          <BedGlyph severity={severity.severity} />
        </span>
      </div>

      {/* Identity column: room, name, meta — vertically centred */}
      <div
        className="flex flex-col"
        style={{ gap: 10, flex: 1, minWidth: 0, justifyContent: 'center' }}
      >
        <span
          className="ward-card-room tabular uppercase"
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '0.2em',
            color: 'var(--ink-soft)',
          }}
        >
          ROOM {patient.room_number}
        </span>
        <span
          className="ward-card-name"
          style={{
            display: 'inline-block',
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {patient.display_name}
        </span>
        <span
          className="ward-card-meta"
          style={{
            fontSize: 17,
            color: 'var(--ink-soft)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {patient.age_years} yrs · {patient.pathology}
        </span>
      </div>

      {/* Score + severity label — grouped, right-aligned, vertically centred */}
      <div
        className="flex flex-col items-end"
        style={{ flexShrink: 0, gap: 8, justifyContent: 'center' }}
      >
        <span
          className="ward-card-score tabular"
          style={{
            display: 'inline-block',
            fontFamily: 'var(--serif)',
            fontSize: 88,
            lineHeight: 1,
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
          }}
        >
          {score}
        </span>
        <span
          className="ward-card-label uppercase"
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.2em',
            color: severity.colorVar,
          }}
        >
          {severity.label}
        </span>
      </div>

      {/* Glyph column — dedicated slot, centred both axes. Same x-position on
       * every card in the grid so the eye scans a column of ▲ ◆ ● ○ down the
       * ward at a glance (triple-encoded severity, dead-centre). */}
      <div
        className="ward-card-glyph-slot flex items-center justify-center"
        style={{ flexShrink: 0, width: 56 }}
      >
        <Glyph
          shape={severity.glyph}
          size="medium"
          color={severity.colorVar}
          pulseClass={severity.pulseClass}
          aria-label={severity.label}
        />
      </div>
    </button>
  )
}

/**
 * Top-down hospital bed — monochrome ink strokes, reads at a glance.
 * Headboard · mattress · pillow · blanket fold · footboard ticks.
 *
 * Whole-SVG breath animation (see `.bed-breath-*` in index.css):
 * stable → none (CLAUDE.md §5), watch → ~20/min, critical → ~30/min tachypnea.
 */
function BedGlyph({ severity }: { severity: Severity }) {
  const breathClass =
    severity === 'critical'
      ? 'bed-breath bed-breath--critical'
      : severity === 'watch'
        ? 'bed-breath bed-breath--watch'
        : ''
  return (
    <svg
      className={breathClass}
      width={96}
      height={144}
      viewBox="0 0 80 104"
      role="img"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* Headboard */}
      <line
        x1={6}
        y1={3}
        x2={74}
        y2={3}
        stroke="var(--ink)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Mattress frame */}
      <rect
        x={8}
        y={6}
        width={64}
        height={94}
        rx={3}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.25}
      />
      {/* Pillow — filled so it reads as visible mass during the breath */}
      <rect
        x={18}
        y={12}
        width={44}
        height={20}
        rx={2}
        fill="var(--ink)"
        fillOpacity={0.82}
        stroke="var(--ink)"
        strokeWidth={1}
      />
      {/* Blanket fold */}
      <line
        x1={8}
        y1={58}
        x2={72}
        y2={58}
        stroke="var(--ink)"
        strokeWidth={1}
        opacity={0.5}
      />
      {/* Footboard tick marks */}
      <FootTick x={24} />
      <FootTick x={56} />
    </svg>
  )
}

function FootTick({ x }: { x: number }) {
  return (
    <line
      x1={x}
      y1={100}
      x2={x}
      y2={94}
      stroke="var(--ink)"
      strokeWidth={1}
      opacity={0.5}
    />
  )
}
