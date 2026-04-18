/**
 * Haoma wordmark — Instrument Serif, 36px per §2 display scale.
 * Pass `size` to scale for landing page hero vs header usage.
 */

interface Props {
  size?: number
  as?: 'h1' | 'h2' | 'span'
}

export function Logo({ size = 36, as: As = 'span' }: Props) {
  return (
    <As
      className="font-serif"
      style={{
        fontSize: `${size}px`,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        color: 'var(--ink)',
        fontWeight: 400,
        margin: 0,
      }}
    >
      haoma
    </As>
  )
}
