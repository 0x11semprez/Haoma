/**
 * Single vital display block — sober card, tabular numeric value.
 * No animation: IEC 60601-1-8 keeps pulsing reserved for the score to
 * avoid attention fracturing across multiple simultaneous alarms.
 *
 * Layout: compact. Label caps at top; value + unit share a baseline so
 * the eye reads "99 bpm" as a single measurement, not as a value with a
 * disconnected unit floating elsewhere in the card.
 */

import type { CSSProperties } from 'react'

interface Props {
  label: string
  value: string
  unit: string
  loincCode?: string
}

export function VitalCard({ label, value, unit, loincCode }: Props) {
  const style: CSSProperties = {
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: '14px 18px',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 92,
  }

  const accessibleUnit = unit.trim()
  const ariaLabel = accessibleUnit
    ? `${label}: ${value} ${accessibleUnit}`
    : `${label}: ${value}`

  return (
    <div
      className="info-hover info-hover--rose"
      style={style}
      aria-label={ariaLabel}
      data-loinc={loincCode}
    >
      <span
        className="uppercase"
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '0.2em',
          color: 'var(--ink-soft)',
        }}
      >
        {label}
      </span>

      <span className="flex items-baseline" style={{ gap: 8 }}>
        <span
          className="tabular"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 42,
            lineHeight: 1,
            color: 'var(--ink)',
            fontWeight: 400,
          }}
        >
          {value}
        </span>
        {accessibleUnit ? (
          <span
            style={{
              fontSize: 15,
              color: 'var(--ink-soft)',
              lineHeight: 1,
            }}
          >
            {accessibleUnit}
          </span>
        ) : null}
      </span>
    </div>
  )
}
