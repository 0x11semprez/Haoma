# Haoma — Frontend Design System

> Clinical application predicting vascular collapse, deployed in hospital environments.
> Medical device Class IIa — CE marking in progress.
> **Mandatory compliance: IEC 60601-1-8 (medical alarms), WCAG AAA, color-blind support.**

> ⚠️ **Stack — read this before assuming anything**: this app is **Vite + React 19 + React Router v7 (data router) + Tailwind v4 + framer-motion**. It is **NOT Next.js**. The `src/pages/` folder is a plain organizational directory, **not** file-system routing — routes are declared in `src/App.tsx` via `createBrowserRouter`. There is no App Router, no Server Components, no `proxy.ts`, no `vercel.ts`. If a tool, hook, or plugin suggests Next.js patterns because it saw `pages/**`, it is wrong — ignore it and stay on Vite/React Router. The root `CLAUDE.md` forbids Next.js (❌ section, "useless overhead for a single-page dashboard").

> 🚫 **Never run `npm run dev` (or any form of `vite`, `vite dev`, the dev server) from Claude.** The developer keeps their own dev server running locally and watches live reload — if the assistant launches one, it steals the port, spams their terminal, and breaks their workflow. This applies to foreground commands, background commands, and one-shot probes (e.g. `timeout 8 npm run dev` to "check it boots"). Validate changes with `npm run build` or `npm run lint` instead — those are short-lived and safe. If Claude ever thinks it needs to start the dev server to verify something, stop and report what needs to be checked in the browser so the developer can do it.

This document defines the frontend design system. Any divergence must be justified and documented — clinical rules (alarm colors, dual encoding, motion) are **non-negotiable**.

> Note: the product UI, this document, and all design guidance are in **English**. The project uses English-only for every string — labels, buttons, errors, aria-labels, tooltips. See the root `CLAUDE.md` "Coding conventions" for the strict rule.

---

## 1. Typefaces

**Two families, each with a strict role.**

| Family | Source | Role |
|---|---|---|
| **Instrument Serif** | Google Fonts | Display numerals (score, vital values), patient header, editorial italics, quotes |
| **Lexend** | Google Fonts | Everything else: UI, labels, buttons, tabular numeric data (via `font-variant-numeric: tabular-nums`), captions, body text |

**Import:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Lexend:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

**Rule:** never introduce a third family. For numeric alignment, use Lexend + `font-variant-numeric: tabular-nums` (no monospace).

---

## 2. Type scale

### Display — Instrument Serif

| Usage | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Primary score (central gauge) | 220 px | 400 | 0.88 | -0.04em |
| Ward score (multi-patient overview) | 72 px | 400 | 0.9 | -0.03em |
| Patient name (H1) | 56 px | 400 | 1.1 | -0.02em |
| Vital value | 54 px | 400 | 1 | — |
| Logo `haoma` | 36 px | 400 | 1 | -0.01em |
| Score suffix `/ 100` | 36 px | 400 italic | — | — |
| Time-to-event (ETA) | 28 px | 400 italic | — | — |
| Contributor title (e.g. *Facteurs contributifs*) | 26 px | 400 italic | — | — |
| "Decision support" disclaimer | 19 px | 400 italic | — | — |

### UI & data — Lexend

| Usage | Size | Weight | Letter-spacing |
|---|---|---|---|
| Body text / action items | 17 px | 400 | — |
| Vital unit (bpm, mmHg) | 17 px | 400 | — |
| ETA label (CI 95%) | 17 px | 400 | — |
| SHAP value (+0.34) | 16 px | 500 | — |
| Trend arrow | 16 px | 600 | — |
| Action number (01, 02…) | 16 px | 500 | — |
| Scale legend | 16 px | 400 | — |
| Section label (caps) | 14 px | 500 | 0.2em |
| Button | 15 px | 400 | 0.02em |
| IEC priority tag (caps) | 14 px | 400 | 0.06em |
| Vital state (Critique/Surveillance/Stable, caps) | 13 px | 600 | 0.18em |
| Compliance footer | 15 px | 400 | 0.04em |

### Base

- `html, body { font-family: var(--sans); font-size: 17px; line-height: 1.55; }`
- Any numeric element that may appear in a column (values, times, secondary scores): `font-variant-numeric: tabular-nums;`

---

## 3. Color palette

### 3.1 Neutrals — day mode

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#FAF8F4` | Unified background (warm off-white). No card surface should stand out from it. |
| `--ink` | `#1C1917` | Primary text, logo, solid buttons, important icons |
| `--ink-soft` | `#3F3B36` | Secondary text, captions, labels, units |
| `--ink-muted` | `#A8A29E` | Decorative separators only — **never for text** |
| `--line` | `#E7E3DB` | Dividers between sections |
| `--line-soft` | `#EFECE5` | Subtle inner list dividers |

### 3.2 Neutrals — night mode

| Token | Hex |
|---|---|
| `--bg` | `#14120F` |
| `--ink` | `#F5F1EA` |
| `--ink-soft` | `#A8A29E` |
| `--ink-muted` | `#57534E` |
| `--line` | `#292524` |
| `--line-soft` | `#1C1917` |

### 3.3 Clinical semantics — IEC 60601-1-8 *(non-negotiable)*

**These colors may only be used to signal a patient's clinical state. Never for branding, buttons, or decorative accents.**

| State | IEC priority | Base (day) | Pale (day) | Base (night) | Pale (night) |
|---|---|---|---|---|---|
| Critical | High | `#B91C1C` | `#F5D8D8` | `#F87171` | `#450A0A` |
| Watch | Medium | `#A16207` | `#F5E7CF` | `#FBBF24` | `#451A03` |
| Info | Low | `#0E7490` | `#D4EBF0` | `#22D3EE` | `#083344` |
| Stable | Normal | `#166534` | `#D8E9DC` | `#4ADE80` | `#052E16` |

### 3.4 Absolute color rules

1. **Never color alone** to communicate state → always pair shape (glyph) + text (label) + color.
2. **Never desaturate alarm colors in night mode** — they must remain as saturated as in day mode (safety rule).
3. **Never use red / amber / green / cyan** for anything other than the patient's clinical state.
4. **Every screen must remain intelligible in grayscale** — ultimate test: applying `filter: grayscale(1)` must not lose any critical information.

### 3.5 Interaction accent — primary CTAs

Non-clinical accent tokens for primary call-to-action buttons (filled idle, hover shift, active depth). Kept strictly off IEC alarm colors so affordance never collides with clinical meaning.

| Token | Hex (day) | Hex (night) | Usage |
|---|---|---|---|
| `--accent` | `#6F4FF2` | `#8B75F6` | Idle fill of primary CTAs |
| `--accent-hover` | `#5B3FD9` | `#9E8BF8` | `:hover` fill |
| `--accent-active` | `#4C34B8` | `#6F4FF2` | `:active` fill |
| `--accent-ink` | `#FFFFFF` | `#0B0A08` | Text / icon on accent fill |

Rules:
1. Used **only** on primary CTA buttons (Enter, Sign out, Confirm…). Never on status indicators, text, non-CTA borders, or decoration.
2. `:hover` adds a ~1 px lift (`translateY(-1px)`) and a subtle violet-tinted shadow.
3. `:active` uses `scale(0.97)` + the deeper shade — press reads as depth, not highlight.
4. `prefers-reduced-motion` MUST disable the lift and the scale. Color shifts may remain.
5. Grayscale test still holds — scale + lift carry the state when hue is stripped.

---

## 4. Severity glyphs — dual encoding

Every clinical state has a **distinct shape** identifiable even in grayscale or by a color-blind user.

| State | Shape | Construction |
|---|---|---|
| Critical | ▲ filled triangle | `border-bottom: Npx solid var(--critical)` |
| Watch | ◆ filled diamond | `background: var(--warning); transform: rotate(45deg)` |
| Stable | ● filled circle | `background: var(--stable); border-radius: 50%` |
| Info | ○ hollow circle | `border: 2px solid var(--info); background: transparent` |

**Standard sizes:**
- Inline text: triangle 9×15px, diamond/circle 13–14px
- Medium (vital cards): triangle 14×22px, diamond/circle 18–20px
- Ward display: triangle 22×36px, diamond/circle 30–32px

---

## 5. Motion & animation

Per IEC 60601-1-8:

| Level | Frequency | Keyframe duration | Usage |
|---|---|---|---|
| High priority alarm | ~2 Hz | `0.5s ease-in-out infinite` | Critical score, alarm banner, active critical triangles |
| Medium priority alarm | ~0.7 Hz | `1.4s ease-in-out infinite` | Vitals in watch state |
| Stable / info | none | — | No animation |

**Keyframes:**

```css
@keyframes alarm-pulse-high {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
@keyframes alarm-pulse-med {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.75; }
}
@media (prefers-reduced-motion: reduce) {
  .pulse-high, .pulse-med, .score-num,
  .vital.critical::before, .vital.warning::before,
  .level-tag .glyph, .alarm-banner .glyph-critical {
    animation: none !important;
  }
}
```

---

## 6. Radii, dividers, shadows

- **Surfaces** (cards, sections, containers): `border-radius` 3–4 px max, zero `box-shadow`, zero gradient. "Scientific instrument" register preserved here — non-negotiable.
- **Primary CTAs** (Enter, Sign out, Confirm…): rounded rectangle (`border-radius: 8 px`), filled accent color (§3.5), 2 px ink-colored outline, hard offset shadow (`4px 4px 0 0 var(--ink)`) for tactile depth. `:hover` lifts the button (`translate(-2px, -2px)` + shadow grows to `6px 6px`); `:active` pushes it into the page (`translate(4px, 4px)` + shadow collapses to 0). This is the **only** place deep shadow and ink outlines are allowed.
- **Icon / toggle buttons** (NightToggle, MuteToggle): 3 px radius, outlined, no fill — stays in instrument register.
- Dividers: 1 px for internal separations, 2 px for alarm banners.
- **Exception preserved**: diagonal hatching for "watch" state.
- Diagonal hatching for "watch" state:
  ```css
  background: repeating-linear-gradient(
    -45deg,
    var(--warning) 0 4px,
    var(--warning-pale) 4px 8px
  );
  ```

---

## 7. Multi-view architecture

One design system, three display densities based on reading distance:

| View | Distance | Usage | Min. size |
|---|---|---|---|
| **Workstation** | 40–60 cm | Physician at desk, detailed review | 17 px body |
| **Bedside** *(planned)* | 1–2 m | Nurse at patient side, wall tablet | 22 px body |
| **Ward / nurse station** | 3–5 m | Nurse station, hallway, wall display | 22–28 px body, score 72 px |

All views share the same colors, typefaces, glyphs, and alarm timings.

---

## 8. Ready-to-paste CSS variables

```css
:root {
  /* ─── Neutrals — day mode ─────────────────── */
  --bg:            #FAF8F4;
  --ink:           #1C1917;
  --ink-soft:      #3F3B36;
  --ink-muted:     #A8A29E;
  --line:          #E7E3DB;
  --line-soft:     #EFECE5;

  /* ─── Clinical semantics — IEC 60601-1-8 ──── */
  --critical:      #B91C1C;
  --critical-pale: #F5D8D8;
  --warning:       #A16207;
  --warning-pale:  #F5E7CF;
  --info:          #0E7490;
  --info-pale:     #D4EBF0;
  --stable:        #166534;
  --stable-pale:   #D8E9DC;

  /* ─── Interaction accent — primary CTAs (§3.5) ─────── */
  --accent:        #6F4FF2;
  --accent-hover:  #5B3FD9;
  --accent-active: #4C34B8;
  --accent-ink:    #FFFFFF;

  /* ─── Typography ──────────────────────────── */
  --serif: "Instrument Serif", "Iowan Old Style", Georgia, serif;
  --sans:  "Lexend", -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
}

body.night {
  --bg:            #14120F;
  --ink:           #F5F1EA;
  --ink-soft:      #A8A29E;
  --ink-muted:     #57534E;
  --line:          #292524;
  --line-soft:     #1C1917;

  --critical:      #F87171;
  --critical-pale: #450A0A;
  --warning:       #FBBF24;
  --warning-pale:  #451A03;
  --info:          #22D3EE;
  --info-pale:     #083344;
  --stable:        #4ADE80;
  --stable-pale:   #052E16;

  --accent:        #8B75F6;
  --accent-hover:  #9E8BF8;
  --accent-active: #6F4FF2;
  --accent-ink:    #0B0A08;
}

html, body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
```

---

## 9. Pre-merge checklist

Every frontend PR must pass these checks before review:

- [ ] No clinical color (red/amber/green/cyan) used outside IEC context
- [ ] Every patient state communicated with **shape + text + color** (triple encoding)
- [ ] Color-blindness simulation (deuteranopia/protanopia/tritanopia) remains legible
- [ ] `filter: grayscale(1)` test: information still intelligible
- [ ] WCAG AAA contrast verified on all text
- [ ] `prefers-reduced-motion` respected
- [ ] Night mode: alarms keep their original saturation
- [ ] Typefaces limited to Instrument Serif + Lexend (no other family)
- [ ] No `box-shadow` / gradient on surfaces (cards, sections). Primary CTA pill + subtle shadow is the only allowed exception (§3.5, §6)
- [ ] `border-radius` ≤ 4 px on surfaces; 999 px (pill) allowed only on primary CTAs (§6)
- [ ] `tabular-nums` active on every aligned numeric column
- [ ] **No `HAOMA_MOCK` tag left in the tree** — mocks fully removed (§10)

---

## 10. Mocks — TEMPORARY scaffolding, MUST be removed before merge

> ⚠️ **This whole section is about throwaway code.** It exists so Dev 3 can iterate on the UI before the FastAPI + WebSocket layer is wired. Any PR that ships `HAOMA_MOCK` to `main` is blocked.

### How it works

- All fake data and fake transports live in a **single file**: `src/lib/mocks.ts`.
- The switch is an env flag: `VITE_USE_MOCKS=1` in `vite/.env.development.local` (never committed — `.env*` is gitignored at repo root).
- `src/lib/api.ts` is the **only** consumer of `mocks.ts`. Every call site is annotated with the literal tag `HAOMA_MOCK` for grep-based cleanup.
- UI components import from `@/lib/api` exactly as in production mode — no component should ever import from `@/lib/mocks` directly.

### Enable locally

```bash
# vite/.env.development.local
VITE_USE_MOCKS=1
```

Then `npm run dev`. Hit `/login`, scan the card (any tap succeeds), land on `/ward`. The featured patient `p-001` cycles green → orange → red in ~2.5 min via a sigmoid curve (CLAUDE.md pillar #3); the other 5 patients oscillate around their baseline so the ward keeps a visual mix of severities.

### Removal checklist (RUN ALL BEFORE MERGE TO MAIN)

- [ ] Delete `vite/src/lib/mocks.ts`
- [ ] In `vite/src/lib/api.ts`, strip **every** line tagged `HAOMA_MOCK`, the `import { … USE_MOCKS } from './mocks'` block, and the banner comment at the top of the file
- [ ] `cd vite && grep -r HAOMA_MOCK src` returns **nothing**
- [ ] `cd vite && grep -r VITE_USE_MOCKS src .env*` returns **nothing**
- [ ] `npm run build` passes with no unused-import errors
- [ ] Delete this §10 from `vite/CLAUDE.md` and the `HAOMA_MOCK` bullet above in §9
- [ ] Remove `vite/.env.development.local` if it only existed for the flag

### Do NOT

- Import `mocks.ts` from components, hooks, or pages — only `api.ts` may.
- Add new mock fixtures outside `mocks.ts`. One file to delete.
- Let mock strings diverge from the §1 English-only rule — the jury will see mocks during rehearsal.
- Ship a mock on `main`, even behind a flag. The flag is a developer convenience, not a runtime feature.
