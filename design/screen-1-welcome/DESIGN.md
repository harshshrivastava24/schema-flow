---
name: Concrete & Acid
colors:
  surface: '#faf9f5'
  surface-dim: '#dadad6'
  surface-bright: '#faf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f0'
  surface-container: '#eeeeea'
  surface-container-high: '#e8e8e4'
  surface-container-highest: '#e3e3df'
  on-surface: '#1a1c1a'
  on-surface-variant: '#444934'
  inverse-surface: '#2f312e'
  inverse-on-surface: '#f1f1ed'
  outline: '#747962'
  outline-variant: '#c4c9ae'
  surface-tint: '#506600'
  primary: '#506600'
  on-primary: '#ffffff'
  primary-container: '#c6f432'
  on-primary-container: '#566d00'
  inverse-primary: '#aad600'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e5e2e1'
  on-secondary-container: '#656464'
  tertiary: '#3e6376'
  on-tertiary: '#ffffff'
  tertiary-container: '#c2e9ff'
  on-tertiary-container: '#446a7c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c5f331'
  primary-fixed-dim: '#aad600'
  on-primary-fixed: '#161f00'
  on-primary-fixed-variant: '#3b4d00'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#c1e8fe'
  tertiary-fixed-dim: '#a5cce1'
  on-tertiary-fixed: '#001e2b'
  on-tertiary-fixed-variant: '#244b5d'
  background: '#faf9f5'
  on-background: '#1a1c1a'
  surface-variant: '#e3e3df'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
    letterSpacing: 0em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.02em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system expresses pure utilitarian efficiency through the lens of technical Neo-Brutalism. It strips away digital ornamentation, gradient illusions, and decorative atmosphere in favor of structural clarity, mechanical predictability, and brutal contrast. Designed for technical professionals, systems engineers, and infrastructure architects, the interface functions like precision industrial equipment: unapologetic, dense, and instantly readable under heavy cognitive load.

Visual principles:
- **Structural Rawness:** Interfaces are constructed like blueprints or terminal outputs, utilizing physical visual anchors, hard structural gridlines, and tangible offsets.
- **Highlighter Focus:** Vivid acid lime operates purely as an attentional beacon—simulating a physical fluorescent marker drawn across raw architectural specs to signify focus, active state, and critical paths.
- **Physical Machine Tactility:** Interactions do not fade or float; they click, snap, invert, and depress along a fixed 45-degree isometric offset vector.

## Colors

The palette is strictly constrained to prevent cognitive noise and reinforce high-contrast technical utility.

### Palette Architecture
- **Primary (`#C6F432` - Acid Lime):** Reserved exclusively for active selection states, key status highlights, interactive primary buttons, and critical telemetry badges. Always paired with `#111111` typography or stroke; never overlaid with white.
- **Secondary (`#111111` - Ink Black):** The definitive structural color. Used for all primary typography, 2px borders, dense structural dividers, and hard drop shadows.
- **Neutral Surface (`#E4E4E0` - Concrete Grey):** The foundational substrate. Replaces clinical white with a physical, desaturated industrial grey to reduce eye strain in data-dense tooling.
- **Surface Elevation Layers:**
  - Base canvas: `#E4E4E0`
  - Container / Card fill: `#FFFFFF` or `#EAEAE7` for nested sections
  - Inverse container: `#111111` (with `#E4E4E0` or `#C6F432` text)
- **Status Accents:**
  - Error: `#FF3333` (paired with solid 2px `#111111` stroke)
  - Warning: `#FFAA00`
  - Info / Secondary Highlight: `#00E5FF`

### Rules of Engagement
- Zero semi-transparent fills for structure; opacity is never used to convey hierarchy.
- Zero gradients, blurs, or color blending. Colors meet at sharp 1-pixel boundaries.

## Typography

The typographic hierarchy enforces a tri-part role assignment:
1. **Headlines (`Space Grotesk`):** Dense, bold, mechanical grotesque. Primary section titles, panel headers, and modal banners are styled strictly uppercase (`text-transform: uppercase`) to function like etched industrial nameplates.
2. **Body (`Geist`):** Engineered for legibility across intense information densities. Provides neutral, unobtrusive rendering for descriptions, instructions, and standard logs.
3. **Labels & Schema (`JetBrains Mono`):** Applied to metadata, tag names, telemetry metrics, keyboard shortcut legends, and code tokens. Capitalized labels preserve consistent character widths across tabular layouts.

## Layout & Spacing

The layout philosophy follows a rigid, modular fluid grid based on multiples of 4px and 8px.

### Grid & Density
- **Desktop (>= 1024px):** 12-column layout with fixed 1rem (`16px`) gutters and 1.5rem (`24px`) screen margins. Sidebars and tool palettes lock to absolute widths (e.g., 280px or 320px) bordered by 2px solid dividers, while central viewports flex fluidly.
- **Tablet (768px - 1023px):** 8-column layout; secondary inspect panels collapse into full-width bottom drawered tabs.
- **Mobile (< 768px):** 4-column layout with 0.75rem (`12px`) gutters and 1rem (`16px`) margins. Multi-column workspace panels stack sequentially with visible 2px black horizontal dividers.

### Layout Rules
- Spacing is tight and functional; empty space serves only to separate processing modules, never for purely aesthetic drift.
- Containers abut with solid shared 2px boundaries or offset by explicit `space-*` tokens.

## Elevation & Depth

Depth is established strictly through physical, high-contrast hard offsets and solid outlines. Ambient blurs, diffusion, soft shadows, and z-plane feathering are forbidden.

### Depth Mechanics
- **Structural Outlines:** Every container, card, modal, and button possesses an explicit `2px solid #111111` border.
- **Static Hard Shadow (Resting):** `4px 4px 0px 0px #111111`. Applied to interactive cards, elevated panels, and primary CTA components.
- **Active / Pressed Shift:** On click (`:active`), interactive items shift dynamically down and right (`transform: translate(4px, 4px)`) while shadow reduces to `0px 0px 0px 0px #111111`. This provides an immediate, mechanical tactile switch sensation.
- **Secondary Hover Shift:** On hover, elements shift to `translate(-2px, -2px)` with an expanded shadow of `6px 6px 0px 0px #111111`.
- **Modals & Overlays:** Framed with `4px solid #111111` and an exaggerated offset shadow of `8px 8px 0px 0px #111111`. Backdrop is a solid `#111111` scrim at 60% opacity with no background blur.

## Shapes

The design system uses a strict **sharp** geometric geometry (`0px` border-radius across all primitives).

- **Corners:** Exact 90-degree right angles (`border-radius: 0px`). Buttons, input fields, cards, tooltips, and badges must never have rounded corners.
- **Lines:** Borders are uniformly `2px solid #111111`. Dividers inside tables and toolbars use `1px` or `2px solid #111111`.
- **Highlighter Underlays:** Text highlights and chip accents are sharp rectangles positioned directly beneath or behind content, mimicking mechanical tape or marker swatches.

## Components

### Buttons
- **Primary:** Background `#C6F432`, color `#111111`, border `2px solid #111111`, shadow `4px 4px 0px #111111`. Font: `JetBrains Mono`, bold, uppercase. Hover translates `-2px, -2px` with shadow `6px 6px 0px #111111`. Active translates `4px, 4px` with zero shadow.
- **Secondary / Neutral:** Background `#FFFFFF` (or `#E4E4E0`), color `#111111`, border `2px solid #111111`, shadow `4px 4px 0px #111111`. Hover background changes to `#EAEAE7`.
- **Destructive:** Background `#FF3333`, color `#111111`, border `2px solid #111111`, shadow `4px 4px 0px #111111`.

### Chips & Badges
- Background `#FFFFFF` or `#E4E4E0`, border `1px solid #111111`, padding `2px 6px`, font `JetBrains Mono` (`label-sm`).
- **Active / Highlighted:** Background `#C6F432`, border `1px solid #111111`, text `#111111`.

### Input Fields & Controls
- **Inputs & Textareas:** Background `#FFFFFF`, border `2px solid #111111`, text `#111111`, font `JetBrains Mono` (`code-md`). Focus state: solid `#C6F432` outline or `3px 3px 0px #111111` hard offset, no soft glow.
- **Checkboxes & Radios:** Sharp square boxes (`border-radius: 0px`), `18px x 18px`, `2px solid #111111`. Checked state: filled completely with `#C6F432` containing a solid `#111111` geometric tick or inner square.

### Cards & Panels
- Background `#FFFFFF`, border `2px solid #111111`, hard shadow `4px 4px 0px #111111`. Headers feature an explicit bottom border `2px solid #111111` separating the title area from the body.

### Lists & Data Tables
- Row borders `1px solid #111111`. Alternating rows can use `#FFFFFF` and `#F2F2EE`. Hover state replaces row background with `#C6F432` across all cells for immediate track-line focus.

### Code & Terminal Blocks
- Background `#111111`, text `#E4E4E0`, border `2px solid #111111`, hard shadow `4px 4px 0px #111111`. Syntax highlights utilize `#C6F432` for variables and keys.