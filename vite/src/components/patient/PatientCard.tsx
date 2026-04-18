import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

/**
 * Shared card shell for every hoverable panel in the patient view
 * (SHAP group, Physics cells, Recommendation, Derived indicators).
 * Hover is 100 % CSS-driven (.patient-card:hover in index.css): static
 * border on idle, lift + scale on hover, no outline, no color change.
 * Plain div — keeps parity with VitalCard, avoids CSS/inline-style
 * races between framer and the stylesheet.
 */
interface Props {
  children: ReactNode
  style?: CSSProperties
  className?: string
  onClick?: () => void
  role?: string
  tabIndex?: number
  'aria-label'?: string
  'data-loinc'?: string
}

export function PatientCard({
  children,
  style,
  className = '',
  onClick,
  role,
  tabIndex,
  ...rest
}: Props) {
  const clickable = typeof onClick === 'function'

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <div
      className={`patient-card ${className}`.trim()}
      style={style}
      role={role ?? (clickable ? 'button' : undefined)}
      tabIndex={tabIndex ?? (clickable ? 0 : undefined)}
      aria-label={rest['aria-label']}
      data-loinc={rest['data-loinc']}
      onClick={onClick}
      onKeyDown={clickable ? onKey : undefined}
    >
      {children}
    </div>
  )
}
