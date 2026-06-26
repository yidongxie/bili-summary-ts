---
version: alpha
name: BiliStudy-mintlify-design-system
description: BiliStudy must follow the Mintlify DESIGN.md visual language strictly: white documentation-grade surfaces, black pill CTAs, sparse Mintlify mint accents, Inter typography for prose, Geist Mono for code, flat hairline-bordered cards, dense 3-column documentation layouts where appropriate, and atmospheric sky/cream hero bands only for top-level marketing moments. This document adapts the Mintlify design system to BiliStudy's AI video/podcast summarization, result workspace, library knowledge base, learning center, and admin dashboard.
source_style: Mintlify DESIGN.md
strictness: high
---

# BiliStudy DESIGN.md

## 1. Design Mandate

BiliStudy UI changes must strictly follow the Mintlify visual system defined in this document.

The goal is to move BiliStudy from the previous light-blue glass style toward a Mintlify-like product and documentation interface:

- **White canvas first**: clean `{colors.canvas}` backgrounds, not heavy gradients or translucent glass by default.
- **Mint accent only when earned**: `{colors.brand-green}` is reserved for primary accent CTAs, active states, success indicators, and featured learning states.
- **Black pill CTAs**: primary actions use `{colors.primary}` with `{rounded.full}`.
- **Documentation density**: result, transcript, note, chat, and admin views should feel like developer documentation surfaces: clear hierarchy, compact sidebars, readable prose, precise borders.
- **Inter + Geist Mono only**: Inter for all product prose; Geist Mono for timestamps, code, API fields, shortcuts, and technical metadata.
- **Flat surfaces**: use hairline borders and disciplined radius; avoid excessive shadows and decorative blur.
- **Responsive docs layout**: desktop can use sidebar / main content / right rail; mobile collapses into single-column surfaces with 44px touch targets.

Do not introduce competing brand colors, random gradients, oversized glass cards, or inconsistent button radii.

---

## 2. Color System

Use exactly this Mintlify-derived color system.

```yaml
colors:
  primary: "#0a0a0a"
  on-primary: "#ffffff"
  brand-green: "#00d4a4"
  brand-green-deep: "#00b48a"
  brand-green-soft: "#7cebcb"
  brand-tag: "#3772cf"
  brand-warn: "#c37d0d"
  brand-annotate: "#1ba673"
  brand-error: "#d45656"
  brand-cursor: "#888888"
  hero-sky-from: "#87a8c8"
  hero-sky-to: "#f5e9d8"
  hero-dark-from: "#1a3d4a"
  hero-dark-to: "#2d5a4f"
  testimonial-orange: "#f55a3c"
  testimonial-orange-deep: "#cc3a1f"
  canvas: "#ffffff"
  canvas-dark: "#0a0a0a"
  surface: "#f7f7f7"
  surface-soft: "#fafafa"
  surface-code: "#1c1c1e"
  hairline: "#e5e5e5"
  hairline-soft: "#ededed"
  hairline-dark: "#1f1f1f"
  ink: "#0a0a0a"
  charcoal: "#1c1c1e"
  slate: "#3a3a3c"
  steel: "#5a5a5c"
  stone: "#888888"
  muted: "#a8a8aa"
  on-dark: "#ffffff"
  on-dark-muted: "#b3b3b3"
```

### 2.1 Color Roles

#### Brand and Accent

- **Mintlify Mint** `{colors.brand-green}`: use only for high-signal accent CTAs, active nav states, selected tabs, success checkmarks, featured cards, and progress completion.
- **Deep Mint** `{colors.brand-green-deep}`: pressed/active variant of mint CTA.
- **Soft Mint** `{colors.brand-green-soft}`: subtle success tints, progress backgrounds, completed review state.
- **Brand Tag** `{colors.brand-tag}`: tags, citations, timestamp references, transcript search chips.
- **Brand Annotate** `{colors.brand-annotate}`: AI citation success markers, validated facts, snippet saved state.
- **Brand Warn** `{colors.brand-warn}`: quota warnings, missing config warnings, retry states.
- **Brand Error** `{colors.brand-error}`: destructive actions, failed tasks, validation errors.
- **Testimonial Orange** `{colors.testimonial-orange}`: rare emotional callouts only; do not use in regular UI.

#### Surface

- `{colors.canvas}`: main page background, cards, documentation panes.
- `{colors.surface}`: subtle section backgrounds, sidebars, inactive search pills, inline code backgrounds.
- `{colors.surface-soft}`: quieter empty states, detail panels, secondary bands.
- `{colors.surface-code}`: dark code blocks, transcript export previews, API snippets.
- `{colors.hairline}`: default 1px borders.
- `{colors.hairline-soft}`: secondary dividers and low-priority row separators.

#### Text

- `{colors.ink}`: page titles, card titles, primary labels.
- `{colors.charcoal}`: primary body copy.
- `{colors.slate}`: secondary explanatory text.
- `{colors.steel}`: tertiary labels, inactive nav, metadata.
- `{colors.stone}`: captions, timestamps, muted helper text.
- `{colors.muted}`: disabled state.
- `{colors.on-dark}`: text on black/dark hero/code surfaces.
- `{colors.on-dark-muted}`: muted text on dark surfaces.

### 2.2 Forbidden Color Practices

Do not use the previous BiliStudy sky-blue glass palette for newly redesigned components unless explicitly maintaining legacy compatibility.

Avoid:

- Large blue translucent glass panels.
- Multiple saturated accents in the same component.
- Mint green body text.
- Heavy shadow with colored glow except featured pricing/learning cards.
- Background gradients outside top-level hero bands.

---

## 3. Typography

Use Inter for all UI prose and Geist Mono for code/technical values.

```yaml
typography:
  hero-display:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -2px
  display-lg:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -1.5px
  heading-1:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -1px
  heading-2:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.5px
  heading-3:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.25
  heading-4:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.30
  heading-5:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.40
  subtitle:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
  body-md-medium:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.50
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
  body-sm-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.50
  caption:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.40
  caption-bold:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.40
  micro:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.40
  micro-uppercase:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0.5px
  button-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
  code-md:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
  code-sm:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.40
  code-inline:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.30
```

### 3.1 Font Rules

```css
--font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", "SF Mono", Menlo, Consolas, monospace;
```

Rules:

- Page titles use `heading-2` or `heading-3` inside the app. Reserve `hero-display` and `display-lg` for public landing/marketing screens.
- Documentation prose, summaries, notes, and AI answers use `body-md` with 1.50 line-height.
- Metadata, timestamps, subtitle rows, and toolbar hints use `body-sm` or `caption`.
- Timestamps, task IDs, commit hashes, model names, API endpoints, and keyboard shortcuts use Geist Mono.
- Do not use italic styles as a primary emphasis mechanism. Use weight, color, badges, or callout surfaces.

---

## 4. Radius and Spacing

```yaml
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px
  section-sm: 48px
  section: 64px
  section-lg: 96px
  hero: 120px
```

### 4.1 Radius Rules

- Buttons and pill tabs: `{rounded.full}` only.
- Inputs, search fields, code blocks: `{rounded.md}`.
- Standard cards: `{rounded.lg}`.
- Larger feature panels: `{rounded.xl}` or `{rounded.xxl}` only if visually important.
- Do not use arbitrary `rounded-2xl` unless it maps intentionally to `{rounded.xl}` or `{rounded.xxl}`.

### 4.2 Spacing Rules

- Use 4px / 8px increments.
- Standard card padding: `{spacing.xl}` (24px).
- Dense toolbars and nav rows: `{spacing.xs}` to `{spacing.sm}`.
- Page sections: `{spacing.section}` (64px) on content-heavy surfaces.
- Hero bands: `{spacing.hero}` (120px).

---

## 5. Component System

All components should map to these Mintlify components.

### 5.1 Buttons

#### `button-primary`

Dominant CTA.

```yaml
backgroundColor: "{colors.primary}"
textColor: "{colors.on-primary}"
typography: "{typography.button-md}"
rounded: "{rounded.full}"
padding: "10px 20px"
```

Use for:

- Start summarizing
- Save to library
- Generate quiz
- Create learning path
- Confirm admin action

Pressed:

```yaml
backgroundColor: "{colors.charcoal}"
```

Disabled:

```yaml
backgroundColor: "{colors.hairline}"
textColor: "{colors.muted}"
```

#### `button-accent-green`

High-signal brand CTA.

```yaml
backgroundColor: "{colors.brand-green}"
textColor: "{colors.primary}"
typography: "{typography.button-md}"
rounded: "{rounded.full}"
padding: "10px 20px"
```

Use sparingly for:

- Generate AI result
- Complete review
- Featured learning action
- Successful connection state

#### `button-secondary`

```yaml
backgroundColor: "transparent"
textColor: "{colors.ink}"
border: "1px solid {colors.hairline}"
typography: "{typography.button-md}"
rounded: "{rounded.full}"
padding: "10px 20px"
```

Use for:

- Export
- Reset filter
- Open source link
- Secondary navigation

#### `button-ghost`

```yaml
backgroundColor: "transparent"
textColor: "{colors.ink}"
typography: "{typography.button-md}"
rounded: "{rounded.md}"
padding: "8px 12px"
```

Use for toolbar actions and non-primary operations.

#### `button-icon-circular`

```yaml
backgroundColor: "{colors.canvas}"
textColor: "{colors.ink}"
rounded: "{rounded.full}"
size: 32px
border: "1px solid {colors.hairline}"
```

Use for close, copy, retry, refresh, collapse, and more-menu actions.

### 5.2 Cards and Containers

#### `card-base`

```yaml
backgroundColor: "{colors.canvas}"
rounded: "{rounded.lg}"
padding: "{spacing.xl}"
border: "1px solid {colors.hairline}"
```

Use for:

- Library cards
- Learning path cards
- Admin metric panels
- Settings sections
- Result workspace panels

#### `card-feature`

```yaml
backgroundColor: "{colors.surface}"
rounded: "{rounded.lg}"
padding: "{spacing.xxl}"
```

Use for:

- 30-second overview
- Empty states
- AI suggested actions
- Featured learning modules

#### `pricing-card-featured` adapted for learning highlight

```yaml
backgroundColor: "{colors.canvas}"
rounded: "{rounded.lg}"
padding: "{spacing.xxl}"
border: "2px solid {colors.brand-green}"
shadow: "rgba(0, 212, 164, 0.08) 0px 8px 24px"
```

Use only for:

- Today's key review card
- Featured learning path
- Current plan/quota card

### 5.3 Inputs and Search

#### `text-input`

```yaml
backgroundColor: "{colors.canvas}"
textColor: "{colors.ink}"
typography: "{typography.body-md}"
rounded: "{rounded.md}"
padding: "{spacing.sm} {spacing.md}"
border: "1px solid {colors.hairline}"
height: 40px
```

Focused:

```yaml
border: "2px solid {colors.brand-green}"
```

Use for:

- URL input
- Search fields
- Settings fields
- Category/tag input
- Prompt fields

#### `search-pill`

```yaml
backgroundColor: "{colors.surface}"
textColor: "{colors.steel}"
typography: "{typography.body-sm}"
rounded: "{rounded.md}"
padding: "{spacing.xs} {spacing.md}"
height: 36px
border: "1px solid {colors.hairline}"
```

Use for:

- Global search
- Library search
- Subtitle search
- Admin table filtering

### 5.4 Tabs

#### `segmented-tab`

```yaml
backgroundColor: "transparent"
textColor: "{colors.steel}"
typography: "{typography.body-sm-medium}"
padding: "{spacing.sm} {spacing.md}"
border: "0 0 2px transparent solid"
```

Active:

```yaml
textColor: "{colors.ink}"
border: "0 0 2px {colors.ink} solid"
```

Use for ResultPage tabs:

- 总结
- 字幕
- 思维导图
- 对话

Use for LearningPage tabs:

- 学习路径
- 今日复习
- 测验

#### `pill-tab`

```yaml
backgroundColor: "{colors.canvas}"
textColor: "{colors.steel}"
typography: "{typography.body-sm-medium}"
rounded: "{rounded.full}"
padding: "8px 16px"
border: "1px solid {colors.hairline}"
```

Active:

```yaml
backgroundColor: "{colors.primary}"
textColor: "{colors.on-primary}"
border: "1px solid {colors.primary}"
```

Use for compact filters and mode toggles.

### 5.5 Badges and Tags

#### `badge-tag`

```yaml
backgroundColor: "rgba(55, 114, 207, 0.15)"
textColor: "{colors.brand-tag}"
typography: "{typography.caption-bold}"
rounded: "{rounded.sm}"
padding: "2px 8px"
```

Use for:

- Library tags
- AI citations
- Subtitle hit count
- Source type chips

#### `badge-required`

```yaml
backgroundColor: "{colors.brand-error}"
textColor: "{colors.on-dark}"
typography: "{typography.micro-uppercase}"
rounded: "{rounded.sm}"
padding: "2px 6px"
```

Use for settings validation and missing config states.

#### `badge-discount` adapted for success

```yaml
backgroundColor: "{colors.brand-green}"
textColor: "{colors.primary}"
typography: "{typography.caption-bold}"
rounded: "{rounded.full}"
padding: "2px 8px"
```

Use for completed review, saved status, connected status.

### 5.6 Code and Technical Text

#### `code-block`

```yaml
backgroundColor: "{colors.surface-code}"
textColor: "{colors.on-dark}"
typography: "{typography.code-md}"
rounded: "{rounded.md}"
padding: "{spacing.md}"
```

Use for:

- Export previews
- Mermaid output
- API examples
- Deployment logs
- Admin diagnostics

#### `code-inline`

```yaml
backgroundColor: "{colors.surface}"
textColor: "{colors.charcoal}"
typography: "{typography.code-inline}"
rounded: "{rounded.xs}"
padding: "2px 6px"
border: "1px solid {colors.hairline}"
```

Use for:

- Timestamps
- API paths
- task IDs
- commit hashes
- model names
- keyboard shortcuts

---

## 6. BiliStudy Page Patterns

### 6.1 App Shell

Desktop app shell should follow Mintlify documentation layout:

```text
left sidebar / main content / optional right rail
```

- Left sidebar width: 220–240px where possible.
- Sidebar background: `{colors.canvas}` or `{colors.surface}`.
- Sidebar border: `1px solid {colors.hairline-soft}` on the right.
- Main content background: `{colors.canvas}`.
- Avoid translucent glass effects.
- Active nav item uses `{colors.surface}` background and `{colors.ink}` text; optional `{colors.brand-green}` dot or left border.

Sidebar item:

```yaml
backgroundColor: "transparent"
textColor: "{colors.steel}"
typography: "{typography.body-sm}"
rounded: "{rounded.sm}"
padding: "{spacing.xs} {spacing.md}"
```

Active:

```yaml
backgroundColor: "{colors.surface}"
textColor: "{colors.ink}"
typography: "{typography.body-sm-medium}"
```

### 6.2 HomePage

HomePage can use the Mintlify sky hero.

Use:

```yaml
hero-band-sky:
  background: "linear-gradient(180deg, {colors.hero-sky-from} 0%, {colors.hero-sky-to} 100%)"
  padding: "{spacing.hero}"
```

Structure:

1. Centered `hero-display` headline.
2. `subtitle` explanatory text.
3. CTA row:
   - primary: `button-accent-green` for “开始总结”
   - secondary: `button-secondary` for “查看收藏” or “学习中心”
4. URL input uses `text-input` inside `card-base`.
5. Recent items use `card-base`, not glass cards.

### 6.3 ResultPage Workspace

ResultPage should feel like a documentation reader plus AI workspace.

Desktop layout:

```text
left media/context rail / center content / optional right citation rail
```

- Left rail: 280–360px, `card-base`, sticky when possible.
- Center content: max 760–840px for readability.
- Right rail: citations, outline, chapter list, TOC.
- Tabs use `segmented-tab`.
- Summary prose uses `body-md`, 1.50 line-height.
- Transcript timestamps use `code-inline` or `code-sm`.

ResultPage tab styling:

- Active tab border: `{colors.ink}`.
- Citation chips: `badge-tag`.
- Active citation / selected subtitle: soft mint tint with left border `{colors.brand-green}`.
- AI answer cards: `card-base`; AI system hints: `card-feature`.
- Rewrite / export / ask AI buttons: `button-secondary` unless primary action.

### 6.4 Library / FavoritesPage

The library is a Mintlify documentation index, not a photo gallery.

Use:

- Search: `search-pill`.
- Filter tabs: `pill-tab`.
- Cards: `card-base`.
- Tag chips: `badge-tag`.
- Bulk toolbar: `card-feature` or flat toolbar with `{colors.surface}` background.
- Destructive delete: `{colors.brand-error}` text, no large red filled surfaces unless confirming.

Library card structure:

1. Cover block at top, 16:9 or fixed height.
2. If image unavailable, generate title cover using `{colors.surface}` + title initial + title text.
3. Title: `heading-5` or `body-md-medium`.
4. Metadata: `caption` / `{colors.steel}`.
5. Snippet: `body-sm` / `{colors.slate}`.
6. Actions: secondary/ghost buttons.

### 6.5 LearningPage

Learning center should resemble Mintlify pricing/docs surfaces.

- Learning paths: `pricing-card`-like cards, with progress badges.
- Featured due review: `pricing-card-featured` adapted for learning.
- Review buttons: four `pill-tab` or `button-secondary` actions; “熟练” can use `button-accent-green`.
- Quiz generation CTA: `button-primary` or `button-accent-green` depending on prominence.
- Quiz questions: `property-row` pattern.

### 6.6 AdminPage

Admin should use dense documentation/admin layout.

- Metric cards: `card-base`, 4-column desktop, 1-column mobile.
- Tables: `feature-comparison-table` and `feature-comparison-row`.
- Error rows: small `{colors.brand-error}` badges, not full red backgrounds.
- Cost and usage: Geist Mono for numbers and endpoint names.
- Admin filters: `search-pill` and `pill-tab`.

### 6.7 SettingsPage

Settings should look like a documentation form.

- Each section: `card-base`.
- Inputs: `text-input`.
- Required/missing labels: `badge-required`.
- Connected state: success badge using `{colors.brand-green}`.
- API URL/model values: `code-inline`.
- Test connection: `button-secondary`; save settings: `button-primary`.

---

## 7. Layout and Grid

### 7.1 Desktop

Use a 1280px max content width for wide pages.

- App shell: sidebar + content.
- Documentation workspace: left rail / main / right rail.
- Library: 3-column card grid only if cards remain readable; otherwise 2-column.
- Admin: 4 metric cards per row, then 2-column panels.

### 7.2 Mobile

At `< 768px`:

- Single-column layout.
- Bottom navigation is allowed, but style it as a flat white bar with `{colors.hairline}` border.
- Touch targets must be at least 44px high.
- Cards stack vertically.
- Tables become horizontal-scroll or row cards.
- ResultPage side rails collapse into accordions or drawers.

### 7.3 Breakpoints

| Name | Width | Behavior |
|---|---:|---|
| Mobile small | < 480px | Single column; hero 36px; nav bottom; cards stacked |
| Mobile large | 480–767px | Single column; hero 44px; compact filters wrap |
| Tablet | 768–1023px | 2-column grids; sidebars collapse |
| Desktop | 1024–1279px | Full app shell; 2–3 column cards |
| Wide desktop | >= 1280px | 1280px max container; optional right rail |

---

## 8. Elevation and Depth

Mintlify is mostly flat. Use hairline borders before shadows.

| Level | Treatment | Use |
|---|---|---|
| 0 | No shadow, `{colors.hairline}` border | Default cards, tables, inputs |
| 1 | `rgba(0,0,0,0.04) 0px 1px 2px` | Subtle hover/selected tiles |
| 2 | `rgba(0,0,0,0.08) 0px 4px 12px` | Important feature cards only |
| 3 | `rgba(0,0,0,0.12) 0px 24px 48px -8px` | Hero mockup only |
| 4 | `rgba(0,212,164,0.08) 0px 8px 24px` | Featured learning/pricing card only |

Avoid:

- Colored blue shadows.
- Heavy glass blur.
- Multiple nested shadows.
- Deep shadow on every card.

---

## 9. Content and Interaction Rules

### 9.1 Copy Tone

BiliStudy copy should be:

- concise
- instructional
- calm
- documentation-like
- action-oriented

Examples:

- “生成总结” instead of “马上开始神奇总结”
- “今日复习” instead of “冲刺学习”
- “重建索引” instead of “修复搜索魔法”

### 9.2 Empty States

Use `card-feature` with:

- short title
- one-sentence explanation
- one primary/secondary action
- no cartoon-heavy illustration

### 9.3 Loading States

- Use small spinner or skeleton rows.
- Use `{colors.surface}` skeleton blocks.
- Avoid large animated gradients.

### 9.4 Error States

- Inline error text uses `{colors.brand-error}`.
- Destructive confirmation uses clear text and `button-primary`/danger variant only in confirm dialogs.
- Do not flood the page with red backgrounds.

---

## 10. Do's and Don'ts

### Do

- Use `{colors.canvas}` and `{colors.surface}` as the main visual foundation.
- Use `{colors.primary}` black pill buttons for primary actions.
- Use `{colors.brand-green}` sparingly for active/success/high-value AI actions.
- Use Inter for all UI text and Geist Mono for technical values.
- Use `{rounded.full}` for all buttons and pill filters.
- Use `{rounded.lg}` for cards.
- Use 1px `{colors.hairline}` borders for structure.
- Keep long-form summaries at 16px / 1.50 line-height.
- Prefer documentation-like layout for dense content.
- Use concise labels and high information clarity.

### Don't

- Do not add new accent colors beyond Mintlify green, tag blue, error red, warning amber, and rare testimonial orange.
- Do not use heavy glassmorphism for new screens.
- Do not use Mint green for paragraphs or large surfaces.
- Do not use blue gradients as generic backgrounds.
- Do not use rounded values inconsistently.
- Do not compress summary/transcript line-height below 1.50.
- Do not use Geist Mono for normal Chinese prose.
- Do not place too many primary buttons in one viewport.

---

## 11. Agent Prompt Guide

When asking an AI coding agent to modify BiliStudy UI, use prompts like:

```text
Strictly follow DESIGN.md. Use the Mintlify color system, Inter typography, Geist Mono for technical values, black pill primary buttons, sparse brand-green accents, flat white cards with hairline borders, and documentation-grade layouts. Do not use the old blue glass style for new components.
```

For ResultPage:

```text
Refactor ResultPage according to DESIGN.md: documentation workspace layout, segmented tabs, flat card-base panels, readable 16px summaries, code-inline timestamps, badge-tag citations, and sparse brand-green active states.
```

For FavoritesPage:

```text
Refactor FavoritesPage according to DESIGN.md: search-pill search bar, pill-tab filters, card-base library cards, badge-tag tags, title-cover fallback, flat bulk toolbar, and no glassmorphism.
```

For LearningPage:

```text
Refactor LearningPage according to DESIGN.md: pricing-card-like learning paths, featured review card with brand-green border, property-row quiz questions, and documentation-grade spacing.
```

For AdminPage:

```text
Refactor AdminPage according to DESIGN.md: metric card-base panels, feature-comparison-table rows, Geist Mono endpoint/cost values, compact filters, and minimal shadows.
```

---

## 12. Implementation Notes for This Project

Current BiliStudy UI still contains legacy light-blue glass tokens. Future UI work should gradually migrate pages toward this DESIGN.md.

Recommended migration order:

1. FavoritesPage library cards and filters.
2. AdminPage metric cards and tables.
3. LearningPage cards and quiz rows.
4. ResultPage tabs, prose, transcript, and citations.
5. HomePage hero and submit form.
6. Sidebar and mobile bottom navigation.
7. Shared UI components.

Do not attempt a full visual rewrite without testing key user flows.

Required verification after any UI migration:

```bash
npm run build:web
```

Recommended manual checks:

- Home summary submission.
- ResultPage tabs.
- Favorites search and card rendering.
- Learning center paths/review/quiz.
- Admin dashboard visibility for `444925817@qq.com`.
- Mobile bottom navigation.

---

## 13. Known Gaps

- This DESIGN.md defines the target Mintlify-style visual system, but current code still has legacy blue glass styling.
- Full dark mode is not specified; use `{colors.canvas-dark}` only for code blocks, dark hero bands, and deliberate inversion surfaces.
- Animation timings are not formalized; use 150–200ms ease for simple transitions.
- Accessibility contrast should be checked when using mint green on light surfaces.
- Chinese typography should use Inter fallback stack; if CJK rendering appears weak, prefer system CJK fallback after Inter.
