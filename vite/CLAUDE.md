# Haoma — Frontend Design System

> Clinical application predicting vascular collapse, deployed in hospital environments.
> Medical device Class IIa — CE marking in progress.
> **Mandatory compliance: IEC 60601-1-8 (medical alarms), WCAG AAA, color-blind support.**

This document defines the frontend design system. Any divergence must be justified and documented — clinical rules (alarm colors, dual encoding, motion) are **non-negotiable**.

> Note: the product UI is in French. Interface labels quoted in this document remain in French. All design guidance and rationale is in English.

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

- `border-radius`: 3–4 px maximum. Never more — "scientific instrument" register.
- Dividers: 1 px for internal separations, 2 px for alarm banners.
- **Zero box-shadow, zero gradient** (with the exception of diagonal hatching used for watch-state safety encoding).
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
- [ ] No `box-shadow`, no `border-radius` > 4 px
- [ ] `tabular-nums` active on every aligned numeric column
