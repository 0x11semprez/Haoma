/**
 * Live WebSocket connection status — triple-encoded (glyph + text + color).
 * "open" is the only state that uses the stable green signal; all non-open
 * states stay on the neutral/critical palette to avoid false reassurance.
 */

import { Glyph } from '@/components/Glyph'
import type { WsStatus } from '@/lib/api'

interface Props {
  status: WsStatus
}

type ChipSpec = {
  label: string
  shape: 'circle-filled' | 'circle-hollow' | 'triangle'
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
    shape: 'circle-filled',
    color: 'var(--stable)',
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
      <Glyph
        shape={spec.shape}
        size="inline"
        color={spec.color}
        pulseClass={spec.pulse}
      />
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
