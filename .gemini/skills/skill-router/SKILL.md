---
name: skill-router
description: Dynamic discovery, analysis, and activation of local and imported skills located in the .gemini/skills directory.
---
**Dynamic Skill Discovery and Routing Workflow**
1. MANDATORY PROTOCOL: Scan the `.gemini/skills/` directory on every user interaction.
2. Read the YAML metadata frontmatter (`name`, `description`) of all discovered `SKILL.md` files.
3. Evaluate skill relevance relative to task intent:
   - Combine full-stack competencies (frontend and backend skills) when tasks span presentation layers and API/database operations.
   - Give precedence to domain-specific skills (framework-, database-, engine-, or cloud-specific) over generalized guidance.
4. Inspect supporting assets within the selected skill folder (reference guides, scripts, checklists) and load them into context.
5. Conflict Resolution: Domain-specific skill rules override general skill guidelines; foundational protocols in `GEMINI.md` remain sovereign and non-negotiable.
