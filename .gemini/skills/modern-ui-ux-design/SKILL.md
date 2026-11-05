---
name: modern-ui-ux-design
description: Premium modern web UI design, design systems, micro-interactions, Tailwind CSS, shadcn/ui, and refined dark-mode aesthetics.
---
**Modern Product UI/UX Standards**
1. Aesthetic & Visual Language:
   - Avoid generic, dated aesthetics. Adopt modern engineering UI patterns (Linear, Vercel, Raycast, Supabase).
   - Utilize deep dark themes with subtle semi-transparent borders and backdrop blurs (`backdrop-filter: blur()`) instead of heavy dropped shadows.
   - Base color palettes on muted monochromes accented by a single high-contrast primary color for call-to-action triggers.
2. Typography and Spatial Rhythm:
   - Enforce rigorous typographic hierarchy: tight tracking for display headers, balanced line-heights for body prose, and consistent 4px/8px spatial rhythm.
   - Employ clean sans-serif typefaces alongside monospace fonts for tabular data, metrics, code, badges, and statuses.
3. Micro-Interactions and State Transitions:
   - All interactive controls MUST feature smooth state transitions (hover, active, focus-visible) with calibrated timings (150-200ms easing curves).
   - Replace generic spinners with animated skeleton loaders mirroring the layout of incoming content.
   - Provide immediate visual confirmation on clipboard copies, submissions, and mutations via transient toast notifications or inline micro-indicators.
4. Accessibility and Layout Adaptability:
   - Ensure strict WCAG AA accessibility: high contrast ratios, visible keyboard focus rings (`focus-visible`), and correct ARIA states for screen readers.
   - Architect adaptive grid and flex layouts verified across both mobile viewports and ultra-wide displays.
