import { ScoreTimeline, type TimelinePoint } from '@/components/patient/ScoreTimeline'
import type { ProjectedPoint } from '@/types/api'

export function TimelineSection({
  timeline,
  projected,
  intervalSeconds,
  bufferSize,
}: {
  timeline: TimelinePoint[]
  projected: ProjectedPoint[]
  intervalSeconds: number
  bufferSize: number
}) {
  const bufferMinutes = Math.round((bufferSize * intervalSeconds) / 60)
  const projectionMinutes = projected.length
    ? Math.round(projected[projected.length - 1]!.seconds_ahead / 60)
    : 0
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minWidth: 0,
      }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ gap: 24, flexWrap: 'wrap' }}
      >
        <span
          className="uppercase"
          style={{
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.2em',
            color: 'var(--ink-soft)',
          }}
        >
          SCORE EVOLUTION (LAST {bufferMinutes} MIN)
        </span>
        {projectionMinutes > 0 ? (
          <TimelineLegend projectionMinutes={projectionMinutes} />
        ) : null}
      </div>
      {timeline.length === 0 ? (
        <div
          style={{
            height: 'clamp(260px, 34vh, 320px)',
            border: '1px dashed var(--line)',
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--sans)',
            fontSize: 16,
            fontWeight: 400,
            color: 'var(--ink-soft)',
          }}
        >
          Waiting for data…
        </div>
      ) : (
        <ScoreTimeline
          data={timeline}
          projected={projected}
          intervalSeconds={intervalSeconds}
        />
      )}
    </section>
  )
}

function TimelineLegend({ projectionMinutes }: { projectionMinutes: number }) {
  return (
    <div
      className="flex items-center"
      style={{ gap: 20, fontFamily: 'var(--sans)' }}
    >
      <LegendItem
        label="Observed"
        color="var(--ink)"
        dash={false}
      />
      <LegendItem
        label={`Projected · ${projectionMinutes} min`}
        color="var(--ink-soft)"
        dash
      />
    </div>
  )
}

function LegendItem({
  label,
  color,
  dash,
}: {
  label: string
  color: string
  dash: boolean
}) {
  return (
    <span
      className="flex items-center"
      style={{
        gap: 8,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--ink-soft)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 0,
          borderTop: dash ? `1.5px dashed ${color}` : `2px solid ${color}`,
        }}
      />
      {label}
    </span>
  )
}
