/**
 * Global store of currently-critical patients + per-patient silence windows.
 *
 * Why a singleton (not a React context):
 *  - One poll per session regardless of which page subscribed (ward or banner).
 *  - Survives route changes without prop drilling through RootLayout.
 *  - Mirrors `useAudio` so devs only learn one pattern in this codebase.
 *
 * Poll cadence mirrors Ward's previous 2.5 s interval — same endpoint,
 * same data shape. The Ward page now consumes this store so we don't
 * double-poll.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { fetchWard, HaomaApiError } from '@/lib/api'
import { alertToSeverity } from '@/lib/clinical'
import type { PatientSummary, WardSummary } from '@/types/ui'

const POLL_MS = 2_500
// IEC 60601-1-8 §6.3.3.3 — 2 min silence window
const SILENCE_MS = 2 * 60 * 1_000

interface State {
  ward: WardSummary | null
  critical: PatientSummary[]
  silencedUntil: Record<string, number>
  lastError: string | null
}

let state: State = {
  ward: null,
  critical: [],
  silencedUntil: {},
  lastError: null,
}

const listeners = new Set<() => void>()
let pollTimer: number | null = null
let subscribers = 0

function notify() {
  listeners.forEach((cb) => cb())
}

function commit(next: State) {
  state = next
  notify()
}

function recomputeCritical(ward: WardSummary): PatientSummary[] {
  return ward.patients
    .filter((p) => alertToSeverity(p.alert_level) === 'critical')
    .sort((a, b) => b.haoma_index - a.haoma_index)
}

async function tick() {
  try {
    const ward = await fetchWard()
    commit({
      ...state,
      ward,
      critical: recomputeCritical(ward),
      lastError: null,
    })
  } catch (err) {
    const msg =
      err instanceof HaomaApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown error'
    commit({ ...state, lastError: msg })
  }
}

function startPolling() {
  if (pollTimer !== null) return
  void tick()
  pollTimer = window.setInterval(() => void tick(), POLL_MS)
}

function stopPolling() {
  if (pollTimer === null) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

export function silencePatient(patientId: string) {
  commit({
    ...state,
    silencedUntil: {
      ...state.silencedUntil,
      [patientId]: Date.now() + SILENCE_MS,
    },
  })
}

export function isSilenced(patientId: string): boolean {
  const until = state.silencedUntil[patientId]
  return typeof until === 'number' && until > Date.now()
}

export function useCriticalPatients() {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      subscribers += 1
      if (subscribers === 1) startPolling()
      return () => {
        listeners.delete(cb)
        subscribers -= 1
        if (subscribers === 0) stopPolling()
      }
    },
    () => state,
    () => state,
  )

  const silence = useCallback((id: string) => silencePatient(id), [])

  return {
    ward: snapshot.ward,
    critical: snapshot.critical,
    silencedUntil: snapshot.silencedUntil,
    lastError: snapshot.lastError,
    silence,
  }
}
