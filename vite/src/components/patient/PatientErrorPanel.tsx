import { Link } from 'react-router-dom'
import { Glyph } from '@/components/Glyph'
import { SEVERITY } from '@/lib/clinical'

export function PatientErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  const critical = SEVERITY.critical
  return (
    <div
      className="flex flex-col items-center"
      style={{ padding: '96px 48px', gap: 24, textAlign: 'center' }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <Glyph
          shape={critical.glyph}
          size="medium"
          color={critical.colorVar}
          aria-label="Error"
        />
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: critical.colorVar,
          }}
        >
          {message}
        </span>
      </div>
      <div className="flex items-center" style={{ gap: 16 }}>
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 15,
            letterSpacing: '0.02em',
            padding: '10px 18px',
            background: 'var(--ink)',
            color: 'var(--bg)',
            border: '1px solid var(--ink)',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
        <Link
          to="/ward"
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 15,
            letterSpacing: '0.02em',
            color: 'var(--ink-soft)',
            textDecoration: 'underline',
          }}
        >
          Back to ward
        </Link>
      </div>
    </div>
  )
}
