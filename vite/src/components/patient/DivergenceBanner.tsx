import { AnimatePresence, motion } from 'framer-motion'
import { Glyph } from '@/components/Glyph'
import type { WebSocketFrame } from '@/types/api'

/**
 * Full-width "silent compensation" banner — the Phase 2 wow moment.
 * Renders directly under the hero so the headline reads across the full
 * viewport: macro vitals (right column) still nominal while the micro
 * score (center) climbs. Server-owned signal (frame.divergence), UI only
 * animates the reveal.
 */
export function DivergenceBanner({ frame }: { frame: WebSocketFrame | null }) {
  const divergence = frame?.divergence
  return (
    <AnimatePresence initial={false}>
      {divergence?.active ? (
        <DivergenceRow key="divergence" signal={divergence} />
      ) : null}
    </AnimatePresence>
  )
}

function DivergenceRow({
  signal,
}: {
  signal: NonNullable<WebSocketFrame['divergence']>
}) {
  const leadText =
    signal.lead_minutes !== null && signal.lead_minutes >= 1
      ? `Projected to cross critical threshold in ~${Math.round(signal.lead_minutes)} min.`
      : null
  const rationale = signal.rationale ?? ''
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      style={{
        overflow: 'hidden',
        border: '1px solid var(--warning)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--warning-pale)',
      }}
    >
      <div
        className="flex items-start"
        style={{ gap: 16, padding: '14px 20px' }}
        role="status"
        aria-live="polite"
      >
        <div style={{ marginTop: 4 }}>
          <Glyph shape="diamond" size="medium" color="var(--warning)" />
        </div>
        <div className="flex flex-col" style={{ gap: 4, minWidth: 0 }}>
          <span
            className="uppercase"
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: 'var(--warning)',
            }}
          >
            SILENT COMPENSATION · MACRO VITALS NOMINAL
          </span>
          <span
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 16,
              fontWeight: 400,
              color: 'var(--ink)',
              lineHeight: 1.45,
            }}
          >
            {rationale}
            {leadText ? <> {leadText}</> : null}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
