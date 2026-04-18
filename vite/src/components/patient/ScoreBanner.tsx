import { AnimatePresence, motion } from 'framer-motion'
import { SeverityTag } from '@/components/SeverityTag'
import type { WebSocketFrame } from '@/types/api'

/**
 * Band 1 — "The verdict". Horizontal banner that lays the three pieces
 * a physician needs in the first glance:
 *   - the score (lead visual — 220px Instrument Serif)
 *   - the severity (IEC-coded chip + optional trend)
 *   - the recommendation (what to do now)
 *
 * Degrades to em-dashes when `frame` is null so the layout never collapses
 * while the first WS payload is in flight.
 */
export function ScoreBanner({ frame }: { frame: WebSocketFrame | null }) {
  const score = frame ? Math.round(frame.haoma_index * 100) : null
  const alertLevel = frame?.alert_level ?? 'green'
  const pulseClass =
    frame?.alert_level === 'red'
      ? 'pulse-high'
      : frame?.alert_level === 'orange'
        ? 'pulse-med'
        : ''

  // Suppress the trend line when it restates the severity (stable + green).
  // Any other combination is meaningful and stays visible.
  const showTrend =
    frame !== null && !(frame.haoma_trend === 'stable' && alertLevel === 'green')

  const recommendation = frame?.recommendation ?? '—'

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 48,
        padding: '32px 0',
        borderBottom: '1px solid var(--line)',
      }}
      className="score-banner"
    >
      <div className="flex items-baseline" style={{ gap: 8 }}>
        <span
          className={`tabular ${pulseClass}`}
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 220,
            fontWeight: 400,
            lineHeight: 0.88,
            letterSpacing: '-0.04em',
            color: 'var(--ink)',
          }}
        >
          {score !== null ? score : '—'}
        </span>
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 36,
            fontWeight: 400,
            color: 'var(--ink-soft)',
            lineHeight: 1,
          }}
        >
          / 100
        </span>
      </div>

      <div className="flex flex-col" style={{ gap: 12 }}>
        {frame ? <SeverityTag level={alertLevel} size="ward" /> : null}
        {showTrend ? <TrendLine trend={frame.haoma_trend} /> : null}
      </div>

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-card)',
          padding: '20px 24px',
          minWidth: 0,
        }}
      >
        <span
          className="uppercase"
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: 'var(--ink-soft)',
          }}
        >
          RECOMMENDATION
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={recommendation}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 24,
              fontWeight: 400,
              color: 'var(--ink)',
              marginTop: 10,
              marginBottom: 0,
              lineHeight: 1.35,
            }}
          >
            {recommendation}
          </motion.p>
        </AnimatePresence>
      </div>
    </section>
  )
}

function TrendLine({ trend }: { trend: WebSocketFrame['haoma_trend'] }) {
  const text =
    trend === 'rising'
      ? '↑ worsening'
      : trend === 'falling'
        ? '↓ improving'
        : '→ stable'
  return (
    <span
      style={{
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 24,
        fontWeight: 400,
        color: 'var(--ink-soft)',
        lineHeight: 1.2,
      }}
    >
      {text}
    </span>
  )
}
