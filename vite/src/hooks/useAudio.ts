import { useCallback, useSyncExternalStore } from 'react'
import { haomaAudio, type HaomaSound } from '@/lib/audio'

/** Global mute state, persisted across pages. */
const listeners = new Set<() => void>()

export function useAudio() {
  const muted = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => haomaAudio.muted,
    () => false,
  )

  const setMuted = useCallback((next: boolean) => {
    haomaAudio.setMuted(next)
    listeners.forEach((cb) => cb())
  }, [])

  const play = useCallback((sound: HaomaSound) => haomaAudio.play(sound), [])
  const unlock = useCallback(() => haomaAudio.unlock(), [])

  return { muted, setMuted, play, unlock }
}
