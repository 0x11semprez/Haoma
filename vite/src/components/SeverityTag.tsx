/**
 * Inline severity tag — triple encoding: color + shape + text.
 * Use wherever a state label appears near the patient context.
 */

import { Glyph } from './Glyph'
import { severityOf } from '@/lib/clinical'
import type { AlertLevel } from '@/types/api'

interface Props {
  level: AlertLevel
  size?: 'inline' | 'medium' | 'ward'
  showLabel?: boolean
}

export function SeverityTag({ level, size = 'inline', showLabel = true }: Props) {
  const s = severityOf(level)
  return (
    <span
      className="inline-flex items-center gap-2 align-middle"
      aria-label={`Clinical state: ${s.label}`}
    >
      <Glyph
        shape={s.glyph}
        size={size}
        color={s.colorVar}
        pulseClass={s.pulseClass}
      />
      {showLabel ? (
        <span
          className="uppercase text-[13px] font-semibold tracking-[0.18em]"
          style={{ color: s.colorVar }}
        >
          {s.label}
        </span>
      ) : null}
    </span>
  )
}
