---
name: requirements-discovery
description: Requirements gathering, interactive technical discovery, edge-case identification, and technical specification authoring prior to implementation.
---
**Requirements Discovery and Clarification Protocols**
1. Identify all ambiguities and missing details in the user request:
   - Target deployment platform and core tech stack.
   - User personas, authorization roles, and access boundaries.
   - Ingress/egress data schemas, database schema definitions, and state models.
   - Edge-case behaviors: failure modes, malformed inputs, network timeouts, and empty states.
2. Question authoring guidelines:
   - Formulate between 3 and 5 concise, numbered questions.
   - For every question, present 2-3 concrete architectural options, prefixing the preferred choice with `(Recommended)`.
   - Never assume, guess, or extrapolate unstated requirements.
3. Post-interview specification structure:
   - System architecture and affected file breakdown.
   - Data models and API contract schemas.
   - Step-by-step implementation checklist.
   - Concrete test and verification scenarios.
4. CRITICAL RULE: Advance to code generation ONLY after obtaining the user's explicit approval of the plan.
