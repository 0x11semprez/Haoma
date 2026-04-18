/**
 * Haoma backend client.
 *
 * Two transports:
 *   - REST (fetch) for list/detail/auth       → /api/* proxied to FastAPI :8000
 *   - WebSocket for live patient frames       → /ws/patients/:id
 *
 * URL base is a Vite proxy in dev (see vite.config.ts). In a non-Vite host
 * the client also honors `VITE_API_URL` / `VITE_WS_URL` env vars.
 */

import type { WebSocketFrame } from '@/types/api'
import type {
  AuthSession,
  BadgeAuthRequest,
  PatientDetail,
  WardSummary,
} from '@/types/ui'
// ┌─────────────────────────────── HAOMA_MOCK ──────────────────────────────┐
// │ TEMP: mocks let Dev 3 iterate on the UI before FastAPI is wired.        │
// │ REMOVE before merge — see vite/CLAUDE.md §Mocks. Full checklist there.  │
// │ Flip via `.env.development.local` → `VITE_USE_MOCKS=1`.                 │
// └─────────────────────────────────────────────────────────────────────────┘
import {
  mockAuthenticate,
  mockFetchHealth,
  mockFetchPatient,
  mockFetchWard,
  mockSubscribeToPatient,
  USE_MOCKS,
} from './mocks'

const REST_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api'

const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ?? ''

const AUTH_KEY = 'haoma.auth'

export class HaomaApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HaomaApiError'
  }
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as AuthSession).token
  } catch {
    return null
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${REST_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) msg = body.detail
    } catch {
      /* swallow */
    }
    throw new HaomaApiError(res.status, msg || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

/* ── Auth ──────────────────────────────────────────────────────────── */

export async function authenticateBadge(badgeId: string): Promise<AuthSession> {
  if (USE_MOCKS) return mockAuthenticate(badgeId) // HAOMA_MOCK
  const session = await request<AuthSession>('/auth/badge', {
    method: 'POST',
    body: JSON.stringify({ badge_id: badgeId } satisfies BadgeAuthRequest),
  })
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  return session
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_KEY)
}

/* ── Ward + patient REST ──────────────────────────────────────────── */

export const fetchWard = (): Promise<WardSummary> =>
  USE_MOCKS /* HAOMA_MOCK */
    ? mockFetchWard()
    : request<WardSummary>('/patients')

export const fetchPatient = (id: string): Promise<PatientDetail> =>
  USE_MOCKS /* HAOMA_MOCK */
    ? mockFetchPatient(id)
    : request<PatientDetail>(`/patients/${encodeURIComponent(id)}`)

/* ── Health ───────────────────────────────────────────────────────── */

export const fetchHealth = () =>
  USE_MOCKS /* HAOMA_MOCK */
    ? mockFetchHealth()
    : request<{ status: string; version: string; mode: string }>('/health')

/* ── WebSocket ────────────────────────────────────────────────────── */

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface WsHandle {
  close(): void
}

/**
 * Subscribe to a patient's live frame stream. Auto-reconnects with
 * exponential back-off. Caller must invoke `close()` on unmount.
 */
export function subscribeToPatient(
  patientId: string,
  handlers: {
    onFrame: (frame: WebSocketFrame) => void
    onStatus?: (status: WsStatus) => void
    onError?: (err: unknown) => void
  },
): WsHandle {
  if (USE_MOCKS) return mockSubscribeToPatient(patientId, handlers) // HAOMA_MOCK
  const url = buildWsUrl(`/ws/patients/${encodeURIComponent(patientId)}`)
  let socket: WebSocket | null = null
  let attempt = 0
  let closed = false
  let reconnectTimer: number | null = null

  const connect = () => {
    if (closed) return
    handlers.onStatus?.('connecting')
    try {
      socket = new WebSocket(url)
    } catch (err) {
      handlers.onError?.(err)
      handlers.onStatus?.('error')
      scheduleReconnect()
      return
    }
    socket.onopen = () => {
      attempt = 0
      handlers.onStatus?.('open')
    }
    socket.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data as string) as WebSocketFrame
        handlers.onFrame(frame)
      } catch (err) {
        handlers.onError?.(err)
      }
    }
    socket.onerror = (ev) => {
      handlers.onError?.(ev)
      handlers.onStatus?.('error')
    }
    socket.onclose = () => {
      handlers.onStatus?.('closed')
      scheduleReconnect()
    }
  }

  const scheduleReconnect = () => {
    if (closed) return
    const delay = Math.min(1000 * 2 ** attempt, 10_000)
    attempt += 1
    reconnectTimer = window.setTimeout(connect, delay)
  }

  connect()

  return {
    close() {
      closed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      socket?.close()
    },
  }
}

function buildWsUrl(path: string): string {
  if (WS_BASE) return `${WS_BASE.replace(/\/$/, '')}${path}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
