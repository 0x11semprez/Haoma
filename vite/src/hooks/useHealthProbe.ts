/**
 * Single-shot backend health probe.
 *
 * Calls `fetchHealth()` once at mount and on each explicit `retry()`.
 * Deliberately NOT a polling loop: the banner it feeds is a degraded-monitoring
 * hint ("backend unreachable"), not a clinical alarm — continuous polling would
 * burn bandwidth and add noise to the network tab with no clinical benefit.
 *
 * A 5-second AbortController timeout bounds the "checking" state so the banner
 * cannot hang forever on a silent network. Slow-responding backends count as
 * unreachable for the purposes of live monitoring.
 *
 * An explicit `mode === 'mocks'` response (legacy backend mode) also reads as
 * 'unreachable' — we refuse to trust a mocked backend for live clinical
 * monitoring, even if the process itself is up.
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchHealth } from '@/lib/api'

export type HealthStatus = 'checking' | 'ok' | 'unreachable'

const PROBE_TIMEOUT_MS = 5_000

export function useHealthProbe(): {
  status: HealthStatus
  retry: () => void
} {
  const [status, setStatus] = useState<HealthStatus>('checking')
  // `nonce` increments on every `retry()` — used as the effect dependency so a
  // retry re-runs the probe without needing refs or imperative fetch calls.
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

    // `fetchHealth()` does not currently accept a signal, so the 5 s cap is
    // enforced via Promise.race against an abort-rejection. When api.ts is
    // updated to thread an AbortSignal through, swap this for a signal pass.
    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new DOMException('Health probe timed out', 'AbortError'))
      })
    })

    Promise.race([fetchHealth(), timeoutPromise])
      .then((result) => {
        if (cancelled) return
        const mode = (result as { mode?: string } | undefined)?.mode
        if (mode === 'mocks') {
          setStatus('unreachable')
          return
        }
        setStatus('ok')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('unreachable')
      })
      .finally(() => {
        window.clearTimeout(timer)
      })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [nonce])

  // Reset to 'checking' in the event-handler path (not in an effect) so the
  // experimental `react-hooks/set-state-in-effect` rule stays quiet while the
  // UI still reflects the in-flight probe until the next result lands.
  const retry = useCallback(() => {
    setStatus('checking')
    setNonce((n) => n + 1)
  }, [])

  return { status, retry }
}
