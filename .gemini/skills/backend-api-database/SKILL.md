---
name: backend-api-database
description: Backend engineering, REST/WebSocket API design, relational and NoSQL databases, domain business logic, and Docker runtime environments.
---
**Backend Engineering and Database Standards**
1. Layered Architecture:
   - Enforce strict separation of concerns: routing/controllers (HTTP transport), domain services (business logic), and repositories/DAOs (database persistence).
   - Never place raw SQL queries or direct database driver calls inside controllers or view layers.
2. Database Operations:
   - Exclusively use parameterized queries or prepared statements. Prevent any form of string concatenation.
   - Wrap related mutations in atomic database transactions with automatic rollback on error.
   - Eliminate N+1 query patterns; design indexes for foreign keys, filter predicates, and sorting columns.
3. API Design:
   - Adhere strictly to canonical HTTP methods and status codes (200, 201, 204, 400, 401, 403, 404, 409, 422, 500).
   - Validate request bodies, query parameters, and headers using strict schemas or DTOs at the transport boundary.
   - Enforce pagination on all endpoints returning collections.
4. Reliability and Configuration:
   - Externalize all ports, hosts, thresholds, and secrets into environment variables (`.env`).
   - Implement graceful shutdown handling to cleanly close database pools and active network connections upon termination signals.
