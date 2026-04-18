import { ScoreTimeline, type TimelinePoint } from '@/components/patient/ScoreTimeline'

export function TimelineSection({
  timeline,
  intervalSeconds,
  bufferSize,
}: {
  timeline: TimelinePoint[]
  intervalSeconds: number
  bufferSize: number
}) {
  const bufferMinutes = Math.round((bufferSize * intervalSeconds) / 60)
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
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
        SCORE EVOLUTION (LAST {bufferMinutes} MINUTES)
      </span>
      {timeline.length === 0 ? (
        <div
          style={{
            height: 220,
            border: '1px dashed var(--line)',
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 19,
            color: 'var(--ink-soft)',
          }}
        >
          Waiting for data…
        </div>
      ) : (
        <ScoreTimeline data={timeline} intervalSeconds={intervalSeconds} />
      )}
    </section>
  )
}
