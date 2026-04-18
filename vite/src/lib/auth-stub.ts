/**
 * Temporary badge-login stub.
 *
 * Stands in for real SSO until the backend auth endpoint is wired.
 * Identical in shape to what `POST /api/auth/badge` will return so the
 * rest of the app (session persistence, protected routes, bearer token
 * injection) runs untouched. REMOVE this file when backend auth lands.
 */

import type { AuthSession } from '@/types/ui'

const AUTH_KEY = 'haoma.auth'
const CLINICIAN_NAME = 'Dr. Elena Reyes'

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function stubAuthenticateBadge(
  badgeId: string,
): Promise<AuthSession> {
  await delay(220)
  const session: AuthSession = {
    token: `stub-token-${badgeId || 'anon'}`,
    clinician_name: CLINICIAN_NAME,
    role: 'attending',
    expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  return session
}
