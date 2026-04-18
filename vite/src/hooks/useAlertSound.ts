import { useEffect, useRef } from 'react'
import { haomaAudio } from '@/lib/audio'
import type { AlertLevel } from '@/types/api'

/**
 * Plays an IEC 60601-1-8 alarm on level change only — not on every frame.
 * Escalations play. Recoveries play once (stable chime). Same-level no-ops.
 */
export function useAlertSound(level: AlertLevel | null | undefined): void {
  const prev = useRef<AlertLevel | null>(null)
  useEffect(() => {
    if (!level) return
    const last = prev.current
    prev.current = level
    if (last === null) return // first frame — no sound

    if (level === last) return
    if (level === 'red') haomaAudio.play('critical')
    else if (level === 'orange') haomaAudio.play('watch')
    else if (level === 'green' && last !== 'green') haomaAudio.play('stable')
  }, [level])
}
