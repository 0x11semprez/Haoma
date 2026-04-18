import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ShapContribution } from '@/types/api'

const MINUS_SIGN = '\u2212'

/**
 * SHAP top-3 contributors to the Haoma Index. Positive values push the
 * score up (worse), negative values pull it down (better). Colour is IEC:
 * critical for "making it worse", stable for "protecting the patient".
 *
 * Empty / undefined input renders a single hyphen row so the band never
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

      <div
        className="info-hover-group"
        style={{
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        {top3.length === 0 ? (
          <ShapRow label="—" value={null} first />
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
                <ShapRow label={c.label} value={c.value} first={idx === 0} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  )
}

function formatShapValue(value: number): string {
  const abs = Math.abs(value).toFixed(2)
  const sign = value >= 0 ? '+' : MINUS_SIGN
  return `${sign}${abs}`
}

function ShapRow({
  label,
  value,
  first,
}: {
  label: string
  value: number | null
  first: boolean
}) {
  const hasValue = value !== null
  const positive = hasValue && value > 0
  const negative = hasValue && value < 0
  const color = positive
    ? 'var(--critical)'
    : negative
      ? 'var(--stable)'
      : 'var(--ink-soft)'
  const arrow = positive ? '↑' : negative ? '↓' : ''

  return (
    <div
      className="info-hover flex items-center justify-between"
      style={{
        padding: '14px 20px',
        borderTop: first ? 'none' : '1px solid var(--line-soft)',
        gap: 16,
      }}
    >
      <span
        style={{
          fontSize: 17,
          color: 'var(--ink)',
          lineHeight: 1.3,
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
        }}
      >
        {hasValue ? `${arrow} ${formatShapValue(value)}` : '—'}
      </span>
    </div>
  )
}
