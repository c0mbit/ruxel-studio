---
name: frontend-web-apps
description: Modern web development, reactive UI architecture, SPA/SSR frameworks, and client-side applications built with clean architecture.
---
**Frontend Architecture and UI Engineering Standards**
1. Component Architecture:
   - Enforce strict separation between presentational components (pure UI) and container/logic components (hooks, state stores, side effects).
   - Eliminate duplicated markup and styling by abstracting shared primitives into reusable design system components.
2. State and Async Data Handling:
   - Every network operation MUST explicitly handle all 4 states: loading, populated data, empty collection, and error state.
   - Disable submission triggers during active network mutations to prevent duplicated submissions.
3. Markup and UX Standards:
   - Author semantic, accessible HTML using responsive layouts (Flexbox, CSS Grid) validated across mobile and desktop breakpoints.
   - Implement real-time client-side validation on all form inputs with accessible, descriptive error messaging.
4. Lifecycle and Performance:
   - Explicitly tear down timers, event listeners, WebSocket channels, and reactive subscriptions on component unmount to prevent memory leaks.
   - Optimize large collections with virtualization and memoize computationally intensive derivations.
