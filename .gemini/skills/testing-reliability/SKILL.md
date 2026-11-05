---
name: testing-reliability
description: Automated test engineering, unit/integration/E2E test suites, bug detection, and continuous build verification.
---
**Testing and Software Reliability Standards**
1. Test Suite Architecture:
   - Structure every test around the canonical Arrange-Act-Assert (AAA) pattern.
   - Strictly NO comments in code. Provide descriptive, self-documenting test names that articulate the scenario, state, and expected assertion.
2. Mandatory Coverage Profiles:
   - Happy Path: baseline operational flow with standard valid payloads.
   - Boundary & Edge Cases: empty strings, zero values, negative numbers, empty arrays, upper numeric limits, special characters, and multi-byte Unicode.
   - Failure & Resilience Paths: malformed inputs, missing records, network timeouts, upstream service degradations, and unauthorized access.
3. Isolation and Determinism:
   - Mock all external network I/O, storage calls, hardware clocks/timers, and email providers in unit test suites.
   - Every test MUST be hermetic and execute deterministically regardless of execution sequence or parallel worker distribution.
4. Build and Runtime Verification:
   - Following code changes, actively verify zero syntax errors, valid module imports, zero type discrepancies, and clean build/test exit codes.
