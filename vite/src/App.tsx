import { useEffect, useState } from 'react'
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
  useOutlet,
} from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { LandingPage } from './pages/Landing'
import { LoginPage } from './pages/Login'
import { WardPage } from './pages/Ward'
import { PatientPage } from './pages/Patient'
import { CriticalAlertBar } from './components/CriticalAlertBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getSession } from '@/lib/api'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />
}

/* ── Route transitions + post-auth wipe overlay ────────────────────────
 * Why wrap routes in a layout:
 *   - One unified transition rhythm across Landing → Login → Ward → Patient.
 *     Motion is DIRECTION-AWARE: deeper navigation (Landing → Login,
 *     Ward → Patient) = subtle rise of the incoming page; shallower
 *     (back) = subtle drop. Amplitude is small (8 px) and duration short
 *     (180–240 ms) to stay in the IEC 60601-1-8 "scientific instrument"
 *     register — no decorative swoosh, no horizontal slides.
 *   - `/patient/*` keeps a scale-in drill-down on forward nav because the
 *     card→detail metaphor benefits from the zoom. Back from Patient uses
 *     a scale-past-viewport exit + drop so it reads as "card recedes".
 *   - The post-auth wipe (--bg flash) is a fullscreen overlay that must
 *     PERSIST across the /login → /ward navigation, otherwise Login
 *     unmounts and the scan wipe vanishes one frame before Ward paints —
 *     the fluidity bug. Rendering it here lets it survive the route
 *     change and fade out gracefully once Ward is on screen.
 */

// Depth map drives transition direction. `/` is surface, `/patient/*` is
// deepest. Direction = sign(newDepth − oldDepth): positive = going deeper
// (rise), negative = going shallower (drop), 0 = same depth (plain fade).
function routeDepth(pathname: string): number {
  if (pathname === '/') return 0
  if (pathname === '/login') return 1
  if (pathname === '/ward') return 2
  if (pathname.startsWith('/patient/')) return 3
  return 0
}

function RootLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const prefersReducedMotion = useReducedMotion()
  const [authWipe, setAuthWipe] = useState(false)
  // Previous pathname is tracked in state so direction can be computed
  // during render (React 19 forbids ref reads/writes at render time).
  // The state lags by one effect commit: on the render that handles a
  // nav, `prevPath` still holds the OLD path, which is exactly what we
  // need to compute direction for the incoming page. After commit, the
  // effect advances prevPath so the next nav sees itself as the previous.
  const [prevPath, setPrevPath] = useState(location.pathname)

  useEffect(() => {
    try {
      if (sessionStorage.getItem('haoma.authWipe') === '1') {
        sessionStorage.removeItem('haoma.authWipe')
        // Legit external-state sync: Login writes this flag to sessionStorage
        // *just before* navigating. We flip React state to render the handoff
        // overlay. The experimental `set-state-in-effect` rule misfires here —
        // this is precisely what the rule docs describe as an allowed use
        // ("subscribe for updates from some external system").
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthWipe(true)
      }
    } catch {
      /* sessionStorage disabled — silent fallback, skip the overlay */
    }
    // Advance prevPath for the *next* navigation. Same external-state-sync
    // rationale as the wipe flag above — this is the commit-phase handshake
    // that makes direction-aware transitions possible without refs.
    setPrevPath(location.pathname)
  }, [location.pathname])

  const handleAuthWipeEnd = () => setAuthWipe(false)

  const fromPath = prevPath
  const toPath = location.pathname
  const depthDelta = routeDepth(toPath) - routeDepth(fromPath)
  const direction: 'forward' | 'back' | 'same' =
    depthDelta > 0 ? 'forward' : depthDelta < 0 ? 'back' : 'same'

  const isPatient = toPath.startsWith('/patient/')
  const wasPatient = fromPath.startsWith('/patient/')

  // Motion selection:
  //   · Patient forward → scale-in zoom (drill into card).
  //   · Patient back    → scale-past-viewport + drop (card recedes).
  //   · Everything else → opacity + 8 px y-slide, signed by direction.
  //
  // Tradeoff on Patient scale: the page contains a 220 px Instrument Serif
  // digit (Haoma Index). Large text rendered under CSS scale is rasterised
  // at the animated scale → blurry during motion. Mitigations:
  //   1. Narrow scale delta (0.96 → 1). 4% is enough to read "zoom-in".
  //   2. No persistent `will-change: transform` — framer-motion manages
  //      compositor promotion during motion only, so the digit never
  //      re-rasterises into a permanent fuzz.
  //   3. Short duration (0.26 s): blur is not perceptible.
  const motionProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : isPatient
      ? {
          initial: { opacity: 0, scale: 0.96, y: 8 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 1.03, y: 0 },
          transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
        }
      : wasPatient
        ? {
            initial: { opacity: 0, y: -8 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: 0 },
            transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
          }
        : {
            initial: {
              opacity: 0,
              y: direction === 'back' ? -8 : direction === 'forward' ? 8 : 0,
            },
            animate: { opacity: 1, y: 0 },
            exit: {
              opacity: 0,
              y: direction === 'back' ? 4 : direction === 'forward' ? -4 : 0,
            },
            transition: {
              duration: direction === 'same' ? 0.18 : 0.22,
              ease: [0.22, 1, 0.36, 1] as const,
            },
          }

  // Banner lives OUTSIDE AnimatePresence — if it unmounts during the
  // 260 ms route transition, the red bar blinks away mid-nav and the
  // clinician reads that as "alarm cleared" (safety hazard). It must
  // persist across routes and is only gated by auth + authenticated
  // route type (no banner on Landing / Login — no ward context there).
  const session = getSession()
  const isAuthedRoute =
    location.pathname === '/ward' || location.pathname.startsWith('/patient/')
  const showBanner = session !== null && isAuthedRoute

  return (
    <>
      {showBanner ? <CriticalAlertBar /> : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          {...motionProps}
          style={{
            minHeight: '100svh',
            transformOrigin: '50% 50%',
          }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>

      {authWipe && (
        <div
          className="auth-wipe-hold"
          aria-hidden="true"
          onAnimationEnd={handleAuthWipeEnd}
        />
      )}
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <LoginPage /> },
      {
        path: '/ward',
        element: (
          <RequireAuth>
            <WardPage />
          </RequireAuth>
        ),
      },
      {
        path: '/patient/:patientId',
        element: (
          <RequireAuth>
            <PatientPage />
          </RequireAuth>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  // reducedMotion="user" — framer-motion auto-disables transforms/opacity tweens
  // when prefers-reduced-motion: reduce. Required by IEC 60601-1-8 + WCAG.
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}>
        <RouterProvider router={router} />
      </MotionConfig>
    </ErrorBoundary>
  )
}
