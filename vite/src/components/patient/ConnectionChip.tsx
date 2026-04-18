/**
 * Live WebSocket connection status — glyph + text + color.
 * "open" is intentionally minimal: a plain LIVE label in ink, no glyph,
 * so the nominal state fades into the instrument register. Degraded
 * states keep their glyph to stay noticeable.
 */

import { Glyph } from '@/components/Glyph'
import type { WsStatus } from '@/lib/api'

interface Props {
  status: WsStatus
}

type ChipSpec = {
  label: string
  shape: 'circle-filled' | 'circle-hollow' | 'triangle' | null
  color: string
  pulse: '' | 'pulse-high' | 'pulse-med'
}

const SPECS: Record<WsStatus, ChipSpec> = {
  idle: {
    label: 'STANDBY',
    shape: 'circle-hollow',
    color: 'var(--ink-muted)',
    pulse: '',
  },
  connecting: {
    label: 'CONNECTING…',
    shape: 'circle-hollow',
    color: 'var(--ink-muted)',
    pulse: '',
  },
  open: {
    label: 'LIVE',
    shape: null,
    color: 'var(--ink-soft)',
    pulse: '',
  },
  closed: {
    label: 'RECONNECTING…',
    shape: 'circle-hollow',
    color: 'var(--ink-muted)',
    pulse: '',
  },
  error: {
    label: 'CONNECTION LOST',
    shape: 'triangle',
    color: 'var(--critical)',
    pulse: 'pulse-med',
  },
}

export function ConnectionChip({ status }: Props) {
  const spec = SPECS[status]
  return (
    <span
      className="inline-flex items-center gap-2"
      aria-label={`Connection status: ${spec.label}`}
      style={{
        padding: '6px 12px',
        border: '1px solid var(--line)',
        borderRadius: 3,
      }}
    >
      {spec.shape ? (
        <Glyph
          shape={spec.shape}
          size="inline"
          color={spec.color}
          pulseClass={spec.pulse}
        />
      ) : null}
      <span
        className="uppercase"
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '0.18em',
          color: spec.color,
        }}
      >
        {spec.label}
      </span>
    </span>
  )
}
