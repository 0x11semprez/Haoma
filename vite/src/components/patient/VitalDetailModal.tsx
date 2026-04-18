/**
 * Detail view for a vital card. The modal fades in with a subtle scale
 * from 0.96 → 1; a dimming curtain fades in behind. Click-outside or
 * ESC closes. No shared-layout morph — this pattern is bulletproof
 * across WS re-renders (the `layoutId` approach glitched on close
 * because the grid's card position shifted between open and landing).
 *
 * Pediatric normal ranges are hardcoded for a 4-year-old (per CLAUDE.md
 * "Pediatric values"). Copy is English-only per project convention.
 *
 * A11y: role="dialog" + aria-modal; ESC closes; the curtain absorbs
 * outside clicks via onClick on the wrap.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'

type Tone = 'rose' | 'indigo' | 'slate'

interface Props {
  label: string
  value: string
  unit: string
  loincCode?: string
  tone?: Tone
  normalRange: string
  description: string
  trace?: ReactNode
  onClose: () => void
}

export function VitalDetailModal({
  label,
  value,
  unit,
  loincCode,
  tone = 'rose',
  normalRange,
  description,
  trace,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prev?.focus?.()
    }
  }, [onClose])

  return (
    <>
      <motion.div
        className="vital-curtain"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="vital-expanded-wrap"
        onClick={onClose}
        role="presentation"
      >
        <motion.div
          ref={dialogRef}
          className="vital-expanded"
          data-tone={tone}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} detail`}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 3 }}
          transition={{
            type: 'spring',
            stiffness: 240,
            damping: 28,
            mass: 0.9,
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <span
              className="uppercase"
              style={{
                fontSize: 13,
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
                  fontSize: 12,
                  letterSpacing: '0.04em',
                  color: 'var(--ink-muted)',
                }}
              >
                LOINC {loincCode}
              </span>
            ) : null}
          </header>

          <div
            className="flex items-baseline"
            style={{ gap: 14, marginBottom: 28 }}
          >
            <span
              className="tabular"
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 160,
                lineHeight: 0.88,
                color: 'var(--ink)',
                fontWeight: 400,
                letterSpacing: '-0.03em',
              }}
            >
              {value}
            </span>
            {unit.trim() ? (
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 22,
                  fontWeight: 400,
                  color: 'var(--ink-soft)',
                  lineHeight: 1,
                }}
              >
                {unit}
              </span>
            ) : null}
          </div>

          {trace ? <div style={{ marginBottom: 28 }}>{trace}</div> : null}

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 18,
              rowGap: 10,
              margin: 0,
              paddingTop: 18,
              borderTop: '1px solid var(--line)',
            }}
          >
            <dt style={detailLabelStyle}>Normal (pediatric, 4 yrs)</dt>
            <dd style={detailValueStyle}>{normalRange}</dd>
            <dt style={detailLabelStyle}>What this is</dt>
            <dd style={detailValueStyle}>{description}</dd>
          </dl>
        </motion.div>
      </div>
    </>
  )
}

const detailLabelStyle = {
  fontFamily: 'var(--sans)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-soft)',
  margin: 0,
  whiteSpace: 'nowrap' as const,
}

const detailValueStyle = {
  fontFamily: 'var(--sans)',
  fontSize: 15,
  fontWeight: 400,
  color: 'var(--ink)',
  lineHeight: 1.5,
  margin: 0,
}
