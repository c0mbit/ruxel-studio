---
name: backend-engineering
description: Server application architecture, domain logic, concurrency, caching, message queues, third-party integrations, and containerized Docker environments.
---
**Backend Engineering Standards**
1. Architecture and Modularity:
   - Design loosely coupled modules with clear boundaries of responsibility: controllers must not contain domain logic, and domain logic must remain independent of framework and database details.
   - Leverage Dependency Injection (DI) and interface-based design to allow straightforward substitution and mocking during testing.
2. Reliability and Fault Tolerance:
   - Enforce explicit connection and read timeouts on all external network/API calls, alongside structured error handling and exponential backoff retry mechanisms.
   - Ensure idempotency for critical mutations (payments, order processing, account balance updates) to prevent unintended duplicate side effects.
3. Performance and Asynchrony:
   - Never block the event loop or primary thread pool with heavy computations, PDF/report generation, or email dispatch — offload them to background worker processes or message queues.
   - Implement caching for read-heavy, low-churn datasets with deterministic cache invalidation strategies.
4. Logging and Observability:
   - Utilize structured logging with explicit severity levels (INFO, WARN, ERROR). Never leak passwords, tokens, API keys, or personally identifiable information (PII) into logs.
   - Expose explicit healthcheck and readiness endpoints (`/healthz`, `/readyz`), alongside graceful shutdown handlers.
5. Infrastructure and Containerization:
   - In `Dockerfile` configurations, utilize multi-stage builds, minimal base images (e.g. Alpine/Distroless), and enforce execution under an unprivileged non-root user.
