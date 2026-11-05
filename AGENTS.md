**Protocol 0: Dynamic Skill & Rule Discovery (MANDATORY)**
- CRITICAL RULE: Before executing ANY task or responding to the user, you MUST inspect the contents of `.gemini/skills/` and `.gemini/rules/`.
- Select all relevant skills from `.gemini/skills/` and language/framework standards from `.gemini/rules/` (always include `common` + the project's active language/tech stack).
- If a `CHECKPOINT.md` file exists in the workspace root, you MUST read it to restore context and state.
- MANDATORY OUTPUT REQUIREMENT: At the very beginning of EVERY response, before any other text, you MUST output the line: `Active skills: [list of selected skills and rules]`. No exceptions.

**Protocol 1: Discovery-First (Strict Prohibition on Assumptions)**
- CRITICAL RULE: It is strictly FORBIDDEN to write or modify code immediately if there is ANY ambiguity, missing requirement, or architectural uncertainty in the task.
- First, thoroughly analyze the request and ask the user between 3 and 5 specific, targeted clarifying questions (covering architecture, tech stack, logic, data formats, and edge cases). Do not assume, guess, or extrapolate.
- Only after receiving explicit answers, create a step-by-step implementation plan and wait for the user's explicit confirmation before proceeding with execution.

**Protocol 2: Code Quality Standards**
- Strictly NO comments in code. Code must be completely self-documenting. Variable, function, method, and class names must be clear, descriptive, and unambiguous without explanatory comments.
- Strictly adhere to Single Responsibility Principle (SRP), clean architecture, and data immutability.
- Zero tolerance for unhandled errors, empty catch/exception blocks, dead code, or unused imports/variables.
- Strictly FORBIDDEN to install or import third-party libraries without prior user approval.

**Protocol 3: Security & Operational Integrity**
- All input data MUST undergo rigorous validation and strict type checking.
- NEVER hardcode API keys, passwords, secrets, tokens, or private configurations.
- Every code modification MUST be verified for successful compilation/build, zero syntax errors, and passing tests before completion.
