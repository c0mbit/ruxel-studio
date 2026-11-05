---
name: performance-profiling
description: Performance profiling and latency optimization across backend services, frontend applications, worker queues, and database engines.
---
**Performance Engineering and Profiling Standards**
1. Database Query Optimization:
   - Inspect execution plans (`EXPLAIN ANALYZE`) for high-latency queries; eliminate sequential scans on large tables with targeted composite or covering indexes.
   - Replace redundant query calls with batch fetching; avoid `SELECT *` by projecting only the necessary columns.
   - Configure connection pooling parameters with explicit pool size caps, idle connection pruning, and statement timeouts.
2. Backend and Compute Optimization:
   - Cache results of computationally intensive operations and read-only lookups in memory or Redis with explicit TTL policies.
   - Delegate heavy I/O operations (file transformations, bulk reporting, notifications) to asynchronous background job workers.
3. Frontend and Client Runtime Optimization:
   - Implement route-based code splitting and dynamic lazy imports to reduce initial bundle parse and execution overhead.
   - Virtualize long lists and tabular grids, rendering exclusively the DOM nodes visible in the active viewport.
