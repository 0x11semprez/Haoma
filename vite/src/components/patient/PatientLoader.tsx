import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export type LoaderStage = 'patient' | 'stream'

const LOADER_COPY: Record<LoaderStage, { titles: string[]; caption: string }> = {
  patient: {
    titles: [
      'Preparing patient',
      'Loading vitals history',
      'Reviewing recent trends',
      'Thank you for waiting',
    ],
    caption: 'Fetching clinical record and recent vitals',
  },
  stream: {
    titles: [
      'Establishing live connection',
      'Syncing bedside monitor',
      'Stabilizing feed',
      'Thank you for waiting',
    ],
    caption: 'Listening to the bedside monitor',
  },
}

const ROTATION_MS = 2000

export function PatientLoader({ stage }: { stage: LoaderStage }) {
  const { titles, caption } = LOADER_COPY[stage]
  const [titleIndex, setTitleIndex] = useState(0)

  // Reset to first title whenever the stage changes.
  useEffect(() => {
    setTitleIndex(0)
  }, [stage])

  // Schedule the next step only while we haven't reached the last title.
  // The final title ("Thank you for waiting") is sticky — it's the last
  // thing the jury reads before the dashboard paints, so it must not
  // loop back to "Preparing patient" mid-demo.
  useEffect(() => {
    if (titleIndex >= titles.length - 1) return
    const id = window.setTimeout(() => {
      setTitleIndex((i) => i + 1)
    }, ROTATION_MS)
    return () => window.clearTimeout(id)
  }, [titleIndex, titles.length])

  const title = titles[titleIndex]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.015, filter: 'blur(6px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center"
      style={{
        minHeight: 'calc(100svh - 100px)',
        padding: '48px',
        gap: 56,
        textAlign: 'center',
      }}
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <PulseTrace />
      <div className="flex flex-col items-center" style={{ gap: 22 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            style={{
              margin: 0,
              fontFamily: 'var(--serif)',
              fontSize: 54,
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              lineHeight: 1.05,
            }}
          >
            {title}
          </motion.h2>
        </AnimatePresence>
        <p
          style={{
            margin: 0,
            fontSize: 20,
            color: 'var(--ink-soft)',
            maxWidth: 540,
            lineHeight: 1.5,
          }}
        >
          {caption}
        </p>
      </div>
    </motion.div>
  )
}

function PulseTrace() {
  return (
    <svg
      width="320"
      height="80"
      viewBox="0 0 320 80"
      fill="none"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="40"
        x2="320"
        y2="40"
        stroke="var(--line)"
        strokeWidth="1"
      />
      <path
        d="M0 40 H68 L80 40 L88 16 L100 64 L112 24 L124 52 L136 40 H208 L220 40 L228 22 L240 58 L250 40 H320"
        stroke="var(--ink-soft)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="loader-trace"
      />
    </svg>
  )
}

