import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion'
import { SeverityTag } from '@/components/SeverityTag'
import { PatientCard } from '@/components/patient/PatientCard'
import { severityOf } from '@/lib/clinical'
import type { WebSocketFrame } from '@/types/api'

/**
 * Center column of the hero — "The verdict" stacked vertically:
 *   1. Score digit (220 px Instrument Serif, smooth count-up)
 *   2. Severity chip + trend word
 *   3. Slim horizontal gauge
 *   4. Recommendation card
 *
 * The divergence banner used to live inside this component; it now
 * renders full-width under the hero via <DivergenceBanner/> so the
 * "macro vitals nominal" headline can read across the whole viewport
 * next to the green vitals on the right — that contrast *is* the
 * Phase 2 narrative beat. Do not move it back.
 *
 * Degrades to em-dashes when `frame` is null so the layout never
 * collapses while the first WS payload is in flight.
 */
export function ScoreBanner({ frame }: { frame: WebSocketFrame | null }) {
  const score = frame ? Math.round(frame.haoma_index * 100) : null
  const alertLevel = frame?.alert_level ?? 'green'
  const pulseClass = severityOf(alertLevel).pulseClass

  // Suppress the trend line when it restates the severity (stable + green).
  // Any other combination is meaningful and stays visible.
  const showTrend =
    frame !== null && !(frame.haoma_trend === 'stable' && alertLevel === 'green')

  const recommendation = frame?.recommendation ?? '—'

  return (
    <section
      className="flex flex-col items-center"
      style={{ gap: 28, padding: '8px 0' }}
      aria-label="Haoma score and clinical verdict"
    >
      <div
        className="flex flex-col items-center"
        style={{ gap: 14 }}
        role="img"
        aria-label={
          score !== null
            ? `Haoma index ${score} out of 100`
            : 'Haoma index pending'
        }
      >
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <SmoothScoreNumber score={score} pulseClass={pulseClass} />
          <span
            aria-hidden="true"
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

        <div
          className="flex items-center"
          style={{ gap: 16, justifyContent: 'center' }}
        >
          {frame ? <SeverityTag level={alertLevel} size="ward" /> : null}
          {showTrend ? <TrendLine trend={frame.haoma_trend} /> : null}
        </div>

        <ScoreGauge score={score} alertLevel={alertLevel} />
      </div>

      <PatientCard
        style={{
          padding: '20px 24px',
          minWidth: 0,
          width: '100%',
          maxWidth: 520,
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
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--ink)',
              marginTop: 10,
              marginBottom: 0,
              lineHeight: 1.45,
            }}
          >
            {recommendation}
          </motion.p>
        </AnimatePresence>
      </PatientCard>
    </section>
  )
}

/* ── Score digit with smooth tween on value change ─────────────────── */

function SmoothScoreNumber({
  score,
  pulseClass,
}: {
  score: number | null
  pulseClass: string
}) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState<number>(score ?? 0)
  const previousRef = useRef<number>(score ?? 0)

  useEffect(() => {
    if (score === null) return
    const from = previousRef.current
    previousRef.current = score
    if (reduced || from === score) {
      setDisplay(score)
      return
    }
    const controls = animate(from, score, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [score, reduced])

  return (
    <span
      className={`tabular ${pulseClass}`}
      aria-hidden="true"
      style={{
        fontFamily: 'var(--serif)',
        fontSize: 220,
        fontWeight: 400,
        lineHeight: 0.88,
        letterSpacing: '-0.04em',
        color: 'var(--ink)',
      }}
    >
      {score !== null ? display : '—'}
    </span>
  )
}

/* ── Slim horizontal gauge under the severity chip ─────────────────── */

function ScoreGauge({
  score,
  alertLevel,
}: {
  score: number | null
  alertLevel: WebSocketFrame['alert_level']
}) {
  const reduced = useReducedMotion()
  const color = severityOf(alertLevel).colorVar
  const pct = score ?? 0

  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        maxWidth: 340,
        height: 6,
        background: 'var(--line-soft)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <motion.div
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{
          duration: reduced ? 0 : 0.9,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          height: '100%',
          background: color,
          transition: 'background-color 0.6s ease',
        }}
      />
    </div>
  )
}

function TrendLine({ trend }: { trend: WebSocketFrame['haoma_trend'] }) {
  const { arrow, word } =
    trend === 'rising'
      ? { arrow: '↑', word: 'worsening' }
      : trend === 'falling'
        ? { arrow: '↓', word: 'improving' }
        : { arrow: '→', word: 'stable' }
  return (
    <span
      aria-label={`Trend: ${word}`}
      style={{
        fontFamily: 'var(--sans)',
        fontSize: 16,
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: 'var(--ink-soft)',
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden="true">{arrow} </span>
      {word}
    </span>
  )
}
