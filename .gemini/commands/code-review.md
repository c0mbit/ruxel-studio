---
description: Perform a rigorous code review on modified code (git diff) for concrete bugs, vulnerabilities, and architectural issues.
---
Follow the instructions of the `code-reviewer` agent and standards in `.gemini/rules/`. Inspect current project diffs. Report only high-confidence issues (>80% confidence) with exact file coordinates, line numbers, concrete failure scenarios, and drop-in fixes. Strictly NO comments in code.
