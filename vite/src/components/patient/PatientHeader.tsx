import type { WsStatus } from '@/lib/api'
import type { WebSocketFrame } from '@/types/api'
import type { PatientDetail } from '@/types/ui'

/**
 * Patient header — name, room/age/pathology, and a "waiting for data" hint.
 * Connection status (LIVE / RECONNECTING / LOST) lives in the global TopBar;
 * duplicating it here created two chips saying the same thing.
 */
export function PatientHeader({
  patient,
  frame,
  wsStatus,
}: {
  patient: PatientDetail
  frame: WebSocketFrame | null
  wsStatus: WsStatus
}) {
  const waitingForFirstFrame = !frame && wsStatus !== 'error'
  return (
    <div
      style={{
        position: 'relative',
        padding: '8px 48px 20px',
      }}
    >
      <div
        className="flex flex-col items-center"
        style={{ gap: 10, textAlign: 'center' }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--serif)',
            fontSize: 56,
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {patient.display_name}
        </h1>
        <span
          className="uppercase"
          style={{
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.2em',
            color: 'var(--ink-soft)',
          }}
        >
          ROOM {patient.room_number} · {patient.age_years} YRS ·{' '}
          {patient.pathology}
        </span>
      </div>

      {waitingForFirstFrame ? (
        <span
          className="uppercase"
          style={{
            position: 'absolute',
            right: 48,
            bottom: 28,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.18em',
            color: 'var(--ink-soft)',
          }}
        >
          Waiting for first reading…
        </span>
      ) : null}
    </div>
  )
}
