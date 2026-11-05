---
name: security-hardening
description: Application security auditing, OWASP Top 10 defense, access control enforcement, cryptographic hardening, and data leak prevention.
---
**Application Security (AppSec) Standards**
1. Injection & XSS Prevention:
   - Zero tolerance for string interpolation or concatenation in SQL, NoSQL, operating system shells, or directory queries.
   - Sanitize and encode all untrusted inputs prior to rendering into HTML, DOM, or template contexts.
2. Authentication and Access Control:
   - Passwords must be hashed using robust cryptographic algorithms (Argon2id, bcrypt, PBKDF2) with cryptographic salts.
   - Enforce authorization checks not only at the routing boundary but also on object-level resource ownership (prevention of IDOR).
   - Require `HttpOnly`, `Secure`, and `SameSite` flags on all session identifiers and auth cookies.
3. Secrets Management and Information Disclosure:
   - Strictly prohibit hardcoding tokens, credentials, API keys, private keys, or PII into codebases, configs, or commit logs.
   - Mask internal stack traces, framework internals, and database driver error messages from client responses; emit sanitized error payloads.
4. Transport and Network Defense:
   - Restrict CORS origins explicitly (prohibit wildcard `*` on authenticated endpoints).
   - Enforce body/payload upload size limits, validate MIME types against magic bytes, and apply rate limiting to authentication endpoints.
