/**
 * Degraded-monitoring banner shown when the FastAPI backend fails its
 * `/api/health` probe.
 *
 * Design rules (vite/CLAUDE.md §3.3, §3.4, §4):
 *   - Uses the AMBER (`--warning`) palette — NEVER `--critical`. Red is
 *     reserved for IEC 60601-1-8 high-priority patient alarms. A backend
 *     outage is a technical degradation, not a clinical emergency.
 *   - Triple encoding: diamond glyph (shape) + "Monitoring backend
 *     unreachable" text + amber color. Readable in grayscale and under
 *     deuteranopia/protanopia.
 *   - No animation. Patient alarms pulse — degraded-monitoring hints do
 *     not, so the two cannot be confused. `prefers-reduced-motion` is a
 *     no-op here by design.
 *   - No shadow, no gradient — stays in the "scientific instrument"
 *     register (vite/CLAUDE.md §6).
 *   - Slim ~44 px height, full width. Placed above everything else in the
 *     authenticated layout (above CriticalAlertBar) so degraded-backend
 *     state takes visual priority but never overlaps patient rows.
 */

import { Glyph } from '@/components/Glyph'

export interface BackendUnreachableBannerProps {
  onRetry: () => void
  onDismiss?: () => void
}

export function BackendUnreachableBanner({
  onRetry,
  onDismiss,
}: BackendUnreachableBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: '100%',
        minHeight: 44,
        background: 'var(--warning-pale)',
        borderBottom: '2px solid var(--warning)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 24px',
        fontFamily: 'var(--sans)',
        color: 'var(--ink)',
        // Sits above CriticalAlertBar and TopBar in the authenticated layout.
        // Kept in normal flow (not fixed) so content below simply reflows.
      }}
    >
      <Glyph
        shape="diamond"
        size="inline"
        color="var(--warning)"
        aria-label="Degraded monitoring"
      />
      <span
        style={{
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: '0.01em',
        }}
      >
        Monitoring backend unreachable
      </span>
      <span
        style={{
          fontSize: 14,
          color: 'var(--ink-soft)',
          fontWeight: 400,
        }}
      >
        — live patient data is not being received.
      </span>

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 15,
            letterSpacing: '0.02em',
            padding: '6px 14px',
            background: 'transparent',
            color: 'var(--ink)',
            border: '1px solid var(--ink)',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss banner for this session"
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 18,
              lineHeight: 1,
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: 'var(--ink-soft)',
              border: '1px solid var(--line)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            {/* Literal x character — avoids pulling in an icon dep.
                aria-label above provides the a11y name. */}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
