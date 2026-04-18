import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { PatientCard } from '@/components/patient/PatientCard'
import type { ShapContribution } from '@/types/api'

const MINUS_SIGN = '\u2212'

/**
 * SHAP top-3 contributors to the Haoma Index, rendered as proportional
 * bars so the jury *sees* the breakdown at a glance. Bar length encodes
 * magnitude (normalised to the largest contribution in the set), colour
 * encodes sign: critical for "pushing the score up", stable for "protecting".
 *
 * Animations shrink/grow the bar width — disabled under reduced-motion.
 * Empty input keeps the surface alive with a hyphen row so the band never
 * collapses while the first WS frame is in flight.
 */
export function ContributingFactors({
  contributions,
}: {
  contributions: ShapContribution[] | undefined
}) {
  const top3 = useMemo(() => {
    if (!contributions || contributions.length === 0) return []
    return [...contributions]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 3)
  }, [contributions])

  const maxAbs = useMemo(() => {
    if (top3.length === 0) return 1
    return Math.max(...top3.map((c) => Math.abs(c.value)))
  }, [top3])

  return (
    <section className="flex flex-col" style={{ gap: 12, minWidth: 0 }}>
      <span
        className="uppercase"
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '0.2em',
          color: 'var(--ink-soft)',
        }}
      >
        CONTRIBUTING FACTORS
      </span>

      <PatientCard className="patient-card--group" style={{ flex: 1 }}>
        {top3.length === 0 ? (
          <ShapBarRow label="—" value={null} maxAbs={1} first />
        ) : (
          <AnimatePresence initial={false}>
            {top3.map((c, idx) => (
              <motion.div
                key={c.feature}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <ShapBarRow
                  label={c.label}
                  value={c.value}
                  maxAbs={maxAbs}
                  first={idx === 0}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </PatientCard>
    </section>
  )
}

function formatShapValue(value: number): string {
  const abs = Math.abs(value).toFixed(2)
  const sign = value >= 0 ? '+' : MINUS_SIGN
  return `${sign}${abs}`
}

function ShapBarRow({
  label,
  value,
  maxAbs,
  first,
}: {
  label: string
  value: number | null
  maxAbs: number
  first: boolean
}) {
  const reduced = useReducedMotion()
  const hasValue = value !== null
  const positive = hasValue && value > 0
  const negative = hasValue && value < 0
  const color = positive
    ? 'var(--critical)'
    : negative
      ? 'var(--stable)'
      : 'var(--ink-soft)'
  const barBg = positive
    ? 'var(--critical-pale)'
    : negative
      ? 'var(--stable-pale)'
      : 'transparent'
  const widthPct = hasValue
    ? Math.max(6, Math.min(100, (Math.abs(value) / maxAbs) * 100))
    : 0

  return (
    <div
      style={{
        padding: '14px 20px',
        borderTop: first ? 'none' : '1px solid var(--line-soft)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '6px 16px',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: 17,
          color: 'var(--ink)',
          lineHeight: 1.3,
          gridColumn: '1 / 2',
          gridRow: '1 / 2',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 16,
          fontWeight: 500,
          color,
          whiteSpace: 'nowrap',
          gridColumn: '2 / 3',
          gridRow: '1 / 2',
        }}
      >
        {hasValue ? formatShapValue(value) : '—'}
      </span>
      {hasValue ? (
        <div
          aria-hidden="true"
          style={{
            gridColumn: '1 / 3',
            gridRow: '2 / 3',
            height: 6,
            background: 'var(--line-soft)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <motion.div
            initial={false}
            animate={{ width: `${widthPct}%` }}
            transition={{
              duration: reduced ? 0 : 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              height: '100%',
              background: barBg,
              borderRight: `2px solid ${color}`,
              boxSizing: 'border-box',
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
