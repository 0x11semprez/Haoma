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
import { ErrorBoundary } from './components/ErrorBoundary'
import { getSession } from '@/lib/api'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />
}

/* ── Route crossfade + post-auth wipe overlay ──────────────────────────
 * Why wrap routes in a layout:
 *   - Route-level 200 ms opacity crossfade gives a single unified rhythm
 *     between Landing → Login → Ward → Patient. Opacity-only keeps us in the
 *     IEC 60601-1-8 "scientific instrument" register (no translate/scale).
 *   - The post-auth wipe (green-pale) is a fullscreen overlay that must
 *     PERSIST across the /login → /ward navigation, otherwise Login unmounts
 *     and the scan wipe vanishes one frame before Ward paints — which is
 *     the fluidity bug. Rendering it in this layout lets it survive the
 *     route change and fade out gracefully once Ward is on screen.
 */
function RootLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const prefersReducedMotion = useReducedMotion()
  const [authWipe, setAuthWipe] = useState(false)

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
  }, [location.pathname])

  const handleAuthWipeEnd = () => setAuthWipe(false)

  const isPatient = location.pathname.startsWith('/patient/')

  // /patient/* gets a subtle scale-up entrance — "stepping into the card".
  // Tradeoff: the page contains a 220 px Instrument Serif digit (Haoma Index).
  // Large text rendered under CSS scale is rasterised at the animated scale
  // → visibly blurry during motion. Mitigations applied below:
  //   1. Narrow scale delta (0.96 → 1). 4% is enough to read "zoom-in",
  //      keeps text-blur small and short-lived.
  //   2. No persistent `will-change: transform`. Declaring it on the layer
  //      keeps the element on a GPU layer AFTER the animation, so the digit
  //      never re-rasterises → permanently fuzzy. Let framer-motion manage
  //      compositor promotion during motion only.
  //   3. Short duration (0.26 s): less time for blur to be perceptible.
  // Symmetric scale-past-viewport on exit → going back pushes page away.
  // Everything else: plain opacity crossfade (clinical register, no
  // decorative motion per vite/CLAUDE.md §5).
  const motionProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : isPatient
      ? {
          initial: { opacity: 0, scale: 0.96 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.03 },
          transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
        }
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] as const },
        }

  return (
    <>
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
