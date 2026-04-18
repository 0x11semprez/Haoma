import { ContributingFactors } from '@/components/patient/ContributingFactors'
import { PhysicsPanel } from '@/components/patient/PhysicsPanel'
import type { WebSocketFrame } from '@/types/api'

/**
 * Band 3 — "Why the score says what it says". Two panels side by side:
 *   - Contributing factors: SHAP top-3 (what the AI is reacting to)
 *   - Physical quantities: R̂ and Q̂ (the PINN's physics interpretation)
 *
 * Same band because both answer the same clinical question. Stacks
 * vertically below 1100px via the .why-band class in index.css.
 */
export function WhyBand({ frame }: { frame: WebSocketFrame | null }) {
  return (
    <div className="why-band">
      <ContributingFactors contributions={frame?.shap_contributions} />
      <PhysicsPanel frame={frame} />
    </div>
  )
}
