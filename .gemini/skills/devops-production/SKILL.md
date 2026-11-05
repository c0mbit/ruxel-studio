---
name: devops-production
description: Production application deployment, Docker Compose orchestration, Nginx reverse proxy, SSL/TLS, environment management, and CI/CD automation.
---
**Infrastructure and Deployment Standards**
1. Containerization and Orchestration:
   - Structure multi-container topologies via `docker-compose` with isolated network bridges separating frontend, backend, and database tiers.
   - Define strict CPU and memory resource limits per container to protect against cascade failures under peak workloads.
   - Restrict persistent volume mounts exclusively to database data directories and durable media stores.
2. Nginx Routing and Security:
   - Configure reverse proxies with correct client IP forwarding headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`), explicit upstream timeouts, and response buffering.
   - Enforce mandatory security headers: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.
   - Enable gzip and brotli text compression for static assets to optimize network throughput.
3. Environment Management and Fault Tolerance:
   - Isolate environment configurations, ports, and credentials via structured `.env` files; never commit secrets to version control.
   - Configure container restart policies (`restart: unless-stopped`) alongside active health check instructions.
