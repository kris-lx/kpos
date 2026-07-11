# KPOS Enterprise-Scale Architecture Review

**Date:** 2026-07-06
**Scope:** Assess current architecture against "enterprise multi-org scale" — large multi-branch/multi-tenant customers, hardened RBAC, audit, SSO, horizontal scaling, reliability.
**Relationship to existing docs:** This doc does not replace `rbac-1M-10M-full-isolation-fixed.md`, `compare.md`, or `KPOS-AGENT-TASKS.md` — those already define a target RBAC/isolation architecture and a gap table. This review verifies against **current code** (2026-07-06), confirms which of those gaps are still open, and adds three areas those docs don't cover: **SSO, horizontal scaling of the app/realtime/worker tiers, and infra HA.**

---

## Executive Summary

KPOS is functionally complete (`plan.md` Phases 0–10 ✅) and correctly architected for a **single-tenant-per-instance or small-multi-tenant, single-node deployment**. It is not yet safe to sell into "large enterprise, multi-branch, must-scale-horizontally" accounts, for three independent reasons:

1. **Tenant isolation is enforced only in application code**, not the database. RLS scaffolding exists but is bypassed (`BYPASSRLS` grant) and covers 2 of ~50 tenant tables. A single missed `WHERE tenantId = ...` in any of ~90 routes is a cross-tenant data leak with no second line of defense.
2. **The system cannot run as more than one instance today.** Socket.IO has no cross-instance adapter (real-time breaks), and scheduled jobs (session cleanup, backups) have no distributed lock (duplicate execution). Both must be fixed before horizontal scaling is viable.
3. **No SSO/SAML/OIDC.** Enterprise buyers overwhelmingly require IdP-based login (Okta/Azure AD/Google Workspace). Zero scaffolding exists.

None of this is a surprise to the team — `rbac-1M-10M-full-isolation-fixed.md` already designs the fix for #1, and `compare.md` already flagged it as unimplemented on 2026-06-17. It is still unimplemented today. This review's contribution is confirming that, and covering #2 and #3, which no existing doc addresses.

---

## Findings by Area

### 1. Tenant Isolation — App-layer only, RLS is theater

- Every business table has a `tenant_id` column, but it's **nullable in the Drizzle schema** (`APIS/src/db/schema/tables.ts`) — nullability is patched via a startup script (`APIS/src/db/ensure-tenant.ts`), not a versioned migration.
- Enforcement is via per-route helpers (`tenantScope()`, `buildScopeCondition()`, `buildBranchIdScope()` in `auth.middleware.ts`) — **opt-in per route author**, no middleware guarantees every query is scoped.
- `withTenantTx()` (`tenant-tx.middleware.ts`), which would `SET LOCAL app.current_tenant_id` for defense-in-depth via RLS, is **dead code** — never imported into the route pipeline.
- `docker/postgres/init.sql` only defines RLS policies on 2 of ~50 tenant tables (`transactions`, `activity_logs`), and **grants `BYPASSRLS` to the app's own DB role** with a comment saying to remove it "once SEC-03 is done." It isn't done.
- Confirmed independently by the team's own `compare.md` (2026-06-17): *"setTenantContext() helper created but never called in any route handler."* Unchanged since.

**Risk:** single biggest blocker to enterprise trust. A bug in any one route is a full cross-tenant leak.

### 2. RBAC — Functional but three parallel permission systems

- Bitmask (`maskLow`/`maskHigh`) is primary, string-array permissions is fallback, and a separate menu/CRUD-rule matrix (`rules.md`) governs UI visibility only. All three must be kept in sync by hand.
- ~15 legacy role-name aliases coexist with canonical names indefinitely (`role.md`), doubling the vocabulary any RBAC audit has to reason about.
- `isSuperAdmin` bypass is checked ad hoc in ~8 different functions rather than one centralized gate.
- `user_role_assignments` (multi-role, per-store) exists in schema but is explicitly **not the active runtime model** (`role.md`) — dead code today.
- Branch-scoped access (`branchFilter()`, materialized-path prefix matching for HQ hierarchies) is reasonably sophisticated, but like tenant scoping, is opt-in per route.

**Risk:** moderate. Functionally correct today, but each new route is a chance to miss a check, and the legacy alias list will never shrink on its own.

### 3. Auth — No SSO, one live bug

- JWT is identity-only (`{sub, tid, bid, jti}`), refresh tokens are HttpOnly+`sameSite:strict` cookies tracked in Redis for real revocation, argon2 password hashing. This part is solid.
- **`docker-compose.yml`'s default `JWT_EXPIRES_IN=24h`** overrides the hardened 15m in-code default unless an operator sets `.env` explicitly — an easy misconfiguration trap for anyone deploying via compose as-is.
- **No SSO/SAML/OIDC anywhere** — confirmed via grep, no `passport`/`openid-client`/SAML library in `package.json`, no IdP-metadata config surface.
- `users.twoFAEnabled`/`twoFASecret` columns exist but no TOTP verification found wired into `login()`.
- **Live bug:** `socket/index.ts` destructures `decoded.userId`/`decoded.branchId` from the JWT, but the current payload shape is `{sub, tid, bid}`. Every socket connection joins `user:undefined` / branch rooms with `undefined` — real-time notifications are silently not delivered today, independent of any scaling work.

**Risk:** SSO absence is a hard sales blocker for enterprise. The socket bug is a live functional defect, cheap to fix.

### 4. Horizontal Scaling — Not possible today

- Socket.IO has **no Redis adapter** — rooms only work within one process. Scale the API to N replicas and a client on replica A never sees an event emitted from replica B.
- Scheduled jobs (`cleanupExpiredSessions`, `backup.worker.ts`) run via `setInterval` **in every API instance** with no leader election. N replicas ⇒ N concurrent executions — wasteful for cleanup, potentially **duplicate/overlapping backups**.
- RabbitMQ-backed job consumers (stock movement, activity log, notification) are fine with N competing consumers — this part was clearly built with multi-instance intent.
- `docker-compose.yml` defines exactly one `api` container; no `deploy.replicas`, no cluster mode.

**Risk:** the app cannot currently be scaled past one instance without breaking real-time features and risking duplicate backups.

### 5. Infra Reliability — Everything is a single point of failure

- Postgres, Redis, RabbitMQ: each one instance, no HA (no replicas, no Sentinel/Cluster, no quorum queues).
- No Kubernetes/Helm/Terraform — Docker Compose only, no orchestration layer.
- Health checks (`/health`, Docker healthchecks) are solid and LB/k8s-readiness-probe-compatible if orchestration is added later.
- No CI config found in the areas inspected (worth confirming directly — not exhaustively searched).
- `plan.md` Phase 13 (Express→Fastify strangler-fig migration, not started) signals the team already sees a throughput ceiling — this is a large, separate initiative that should be sequenced *after or independent of* isolation/scaling fixes, not entangled with them.

**Risk:** acceptable for current single-tenant/small-scale deployments; blocks any SLA-backed enterprise contract.

### 6. Database Schema — Gaps that surface at scale, not before

- Several high-write child tables have no index on `tenant_id` or `branch_id` (transaction items/payments, cash movements, order items, stock counts/transfers, point history) — fine at low volume, will cause sequential scans as tenants approach the "1M–10M rows" scale the team's own design doc targets.
- No soft-delete pattern anywhere except `tenants.deleteAfter` — everything else is `isActive: boolean`, conflating "deactivated" with "deleted" and losing point-in-time recovery ability.
- Sparse actor-attribution (`createdBy`/`updatedBy`) — most core catalog tables (products, categories, customers, promotions, pricing) have none; you'd have to reconstruct "who changed this" from `activityLogs` rather than the row itself.
- `activityLogs` is a genuinely good primitive (before/after diff, HMAC checksum chain, immutability trigger) but **is not partitioned**, and its **HMAC key is the JWT signing secret** — reusing a signing secret as an audit-integrity key is a key-separation smell worth a one-line fix (`AUDIT_HMAC_SECRET`).
- No table partitioning strategy for the two tables that will grow largest (`transactions`, `activity_logs`).

**Risk:** low urgency today, but exactly the kind of thing that's cheap to fix now and expensive to fix under a live enterprise tenant's data volume.

---

## Prioritized Roadmap

Ordered by (blocker-to-enterprise-sale × current-risk-of-silent-failure), not by effort. Independent workstreams — can parallelize across people.

**P0 — Do before any enterprise pilot**
1. Fix the socket auth payload bug (`socket/index.ts`) — cheap, currently-live defect.
2. Wire `withTenantTx()` into the route pipeline and drop `BYPASSRLS` from the app DB role; extend RLS policies from 2 tables to all tenant tables. (This is exactly what `rbac-1M-10M-full-isolation-fixed.md` G1/G3 already specifies — the design exists, it needs implementing.)
3. Fix the `docker-compose.yml` JWT TTL default so it can't silently regress to 24h.
4. Separate the audit-checksum HMAC key from `JWT_SECRET`.

**P1 — Do before horizontal scaling / SLA commitments**
5. Add a Redis adapter to Socket.IO (`@socket.io/redis-adapter`) so real-time works across replicas.
6. Add distributed-lock/leader-election around scheduled jobs (session cleanup, backup scheduler) — e.g. a Redis-based lock, or move them to RabbitMQ-scheduled jobs like the rest of the worker system.
7. Add Postgres read replica(s) and/or connection-level HA; add Redis Sentinel or accept single-node with documented RPO/RTO.

**P2 — Enterprise sales requirement, independent timeline**
8. Build SSO: SAML or OIDC via an IdP-agnostic library (e.g. `openid-client` for OIDC covers Okta/Azure AD/Google Workspace; add SAML only if a specific prospect requires it).
9. Wire TOTP/MFA verification into `login()` — schema already supports it.

**P3 — Schema hardening (cheap now, expensive later)**
10. Add missing indexes on `tenant_id`/`branch_id` for the high-volume child tables listed above.
11. Add `createdBy`/`updatedBy` to core catalog tables.
12. Decide a partitioning strategy for `transactions` and `activity_logs` (by month, likely) before any tenant approaches the 1M-row range.

**Sequencing note:** P0/P1 are the actual "enterprise ecosystem" blockers — do these before Phase 13 (Fastify migration). A framework rewrite while tenant isolation is still app-layer-only just moves the same bug surface to new code.

---

## What already exists and doesn't need rework

- Password hashing (argon2), refresh-token revocation via Redis jti tracking, session table with device/IP tracking — solid.
- RabbitMQ-backed async jobs with sync fallback — correctly designed for multi-consumer scaling already.
- `activityLogs` before/after diff + immutability trigger — good audit primitive, just needs partitioning and a distinct HMAC key.
- Branch-scoped RBAC with materialized-path prefix matching for HQ hierarchies — sophisticated, just needs to be made mandatory rather than opt-in.
- Health-check endpoints already suitable for a load balancer or k8s readiness probe.

---

## Cross-references

- Target isolation architecture: `rbac-1M-10M-full-isolation-fixed.md` (composite PKs, full RLS, shard routing — still the right long-term design, most of it unimplemented)
- Existing gap audit: `compare.md` (G1–G10 table — G1/G5/G6 still open per this review)
- Fine-grained task IDs for remediation: `KPOS-AGENT-TASKS.md` (BE-xx/DB-xx/FE-xx — has task IDs for most gaps above, e.g. DB-30/31/32 for RLS policies)
- Role/permission source of truth: `role.md`, `rules.md`, `skill.md`
