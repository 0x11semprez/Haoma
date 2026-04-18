/**
 * Vital display block — clickable, opens a centered detail modal.
 *
 * Layout: large serif value dominates the card. Pronounced hover
 * (lift + scale + ink border) — see `.vital-card:hover` in index.css.
 * Hover is driven by CSS so it restores instantly when the modal
 * curtain is removed from the DOM, even if the pointer hasn't moved.
 *
 * Border/surface still obey §6 (radius ≤ `--radius-card` token, no
 * shadow, no gradient). Accent hover tones come from non-clinical
 * tokens (§3.5 — clinical red/amber/green/cyan stay reserved for state).
 */

import type { CSSProperties, KeyboardEvent } from 'react'

type Tone = 'rose' | 'indigo' | 'slate'

interface Props {
  label: string
  value: string
  unit: string
  loincCode?: string
  tone?: Tone
  onOpen: () => void
}

export function VitalCard({
  label,
  value,
  unit,
  loincCode,
  tone = 'rose',
  onOpen,
}: Props) {
  const style: CSSProperties = {
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: '22px 26px 22px 26px',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    minHeight: 140,
    position: 'relative',
    overflow: 'hidden',
  }

  const accessibleUnit = unit.trim()
  const ariaLabel = accessibleUnit
    ? `${label}: ${value} ${accessibleUnit}. Activate for details.`
    : `${label}: ${value}. Activate for details.`

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      className="vital-card"
      data-tone={tone}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-loinc={loincCode}
      onClick={onOpen}
      onKeyDown={onKey}
    >
      <div className="vital-card__header">
        <span
          className="uppercase"
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.22em',
            color: 'var(--ink-soft)',
          }}
        >
          {label}
        </span>
        {loincCode ? (
          <span
            className="tabular"
            style={{
              fontSize: 11,
              letterSpacing: '0.04em',
              color: 'var(--ink-muted)',
            }}
          >
            LOINC {loincCode}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline" style={{ gap: 10, marginTop: 10 }}>
        <span
          className="tabular"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 80,
            lineHeight: 0.92,
            color: 'var(--ink)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {accessibleUnit ? (
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 17,
              fontWeight: 400,
              color: 'var(--ink-soft)',
              lineHeight: 1,
            }}
          >
            {accessibleUnit}
          </span>
        ) : null}
      </div>
    </div>
  )
}
