# Supabase Exit — Migration Master Plan (Roadmap Only, No Code)

**Project:** yaz-villam (Next.js App Router villa-rental SaaS)
**Author:** Lead Architect (read-only planning pass)
**Target stack:** Next.js 16 → Route Handlers/Services → PostgreSQL (Hetzner) → Cloudflare R2 → Better Auth, all in Docker on Coolify.
**Prime directive:** No big-bang. One architecture layer per sprint. Every sprint ends green (lint + build + typecheck + deployable) and is independently reversible.

---

## 0. Executive summary + plan challenge (read this first)

The proposed order is **80% correct and low-risk** because the codebase already has provider seams (`DbProvider`, `StorageProvider`, `AuthProvider`), an S3/R2 storage provider, CDN config, and no Realtime/Edge usage. I endorse it with **three architectural corrections**:

**Correction 1 — Authorization must move BEFORE/WITH the repository swap, not after (Phase 8 → merge into Phases 4–5).**
Today, access control is enforced *inside the database* by RLS policies that read the Supabase JWT (`auth.uid()`, `is_active_admin()`). The moment repositories talk to native PostgreSQL via a pooled driver (Drizzle/pg), there is **no per-request JWT and no RLS** — the app connects as one DB role. If we follow the literal order (DB provider → repos → remove clients in Phases 4–6, then authorization in Phase 8), there is a **window where every write is either wide-open or broken**. **Server-side authorization must be designed and shipped as the *precondition* of the native-PG cutover**, not a later cleanup. Treat "RLS re-homing" as a cross-cutting workstream that lands with Phase 5.

**Correction 2 — The physical data cutover (Supabase PG → Hetzner PG) is its own risk and deserves an explicit, reversible strategy (expand/contract + logical replication or a maintenance-window dump/restore).** The literal phases treat DB as code changes; the *data move* is a separate operational event with downtime/consistency implications. I add it as Phase 5.5.

**Correction 3 — Next.js 15 → 16 is a separate architecture axis; do NOT combine it with Supabase removal in any sprint.** Per your own rules ("never modify multiple architecture layers in one sprint"), the framework upgrade must be its own bookend phase (recommended: **last**, after the stack is Supabase-free and stable — fewer moving parts to debug).

**Lower-risk strategy I recommend overall:** run an **expand/contract (parallel-run) migration behind the existing provider interfaces**, feature-flagged by environment. Each provider (storage, db, auth) gets a second implementation that can be toggled per-environment, validated on staging, dual-run where possible, then the old path is deleted. This keeps `main` deployable at every commit and makes every phase reversible by flipping a flag.

**Sequencing at a glance (recommended):**
`P0 audit → P1 storage cutover → P2 storage cleanup → P3 DB plan → P4 native DbProvider (staging) + P8 server-side authz (designed together) → P5 repo migration → P5.5 data cutover → P6 remove Supabase DB clients → P7 Better Auth → P9 package/env purge → P10 Next 16`.

---

## Global guardrails (Definition of Done for EVERY sprint)

- `npm run lint` passes, `tsc --noEmit` clean, `npm run build` passes.
- App boots in Docker locally and deploys on Coolify.
- No behavioural regression on the smoke path (below).
- Change sits behind a flag or a provider seam so it can be reverted by config, not by revert-commit, wherever feasible.
- **Smoke path (must pass after each phase):** homepage renders + villa cards show starting price → search with filters → villa detail + availability calendar → create a reservation (public) → reservation email/voucher → admin login → admin villa CRUD + gallery upload → admin reservation view → one cron endpoint returns 200.

---

## Phase 0 — Architecture audit & dependency baseline

- **Goal:** Freeze a precise, current inventory of every Supabase touchpoint so later phases have an exit checklist (grep must reach zero).
- **Files affected:** none (read-only). Produce `docs/SUPABASE_DEPENDENCY_REPORT.md`.
- **What to inventory (with file · symbol · category):**
  - Clients: `lib/supabase.ts`, `lib/supabase/{client,server,admin}.ts`, `lib/supabase-admin.ts`.
  - Providers: `lib/db/db.provider.ts` + `supabase-db.provider.ts` + `index.ts`/`server.ts`; `lib/storage/*`; `lib/auth/*`.
  - Auth call-sites (~74): `signInWithPassword`, `signOut`, `getUser`, `getSession`, `onAuthStateChange`, `auth.admin.*`; `middleware.ts`; `AdminSessionGuard`; login page; `admin-user.repository*`; create-user route.
  - Storage: `supabase.storage` usages, buckets `villa-images`/`site-assets`, `getPublicUrl`, `createSignedUrl`.
  - DB: 59 repositories via `db`/`dbAdmin`; 15 RPCs; RLS policies (20 files), 38 functions, 6 triggers, `pg_trgm`/`btree_gist`.
  - Service-role: `getSupabaseAdmin()` consumers (cron, public writes, admin, mail-logs).
  - Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Risks:** underestimating "hidden" coupling (RLS-as-API, middleware token refresh). Mitigation: explicitly enumerate RLS predicates that reference `auth.uid()`/`is_active_admin()`.
- **Effort:** 0.5–1 day.
- **Rollback:** N/A (no changes).
- **Validation checklist:** report lists every category with file+line; a reproducible `grep` command set that currently returns N hits per category (the "burndown" baseline).

---

## Phase 1 — Remove Supabase Storage (cut over to R2)

- **Goal:** Zero live references to `supabase.storage`; all reads/writes/deletes go through the S3/R2 provider. **Behaviour identical.**
- **Reality check first (important):** the storage layer is *already abstracted* (`StorageProvider` + `s3-storage.provider.ts` + `cdn.config`/`write.config`), **but** the default driver is `supabase` and `s3-storage.provider.createSignedUrl` is `NOT_IMPLEMENTED`. So "R2 already used" is only partially true — verify the **production** value of `NEXT_PUBLIC_STORAGE_DRIVER`/`STORAGE_WRITE_DRIVER` and finish any gaps before flipping.
- **Files affected:** `lib/storage/s3-storage.provider.ts` (complete `createSignedUrl` **only if any flow needs it** — audit shows signed URLs are effectively unused; villa-zip sharing is DB-token based, so this may be a no-op), `lib/storage/cdn.config.ts`/`write.config.ts` (env defaults), env config on Coolify. No service/UI files.
- **Cutover method (expand/contract):** enable **dual-write** (`NEXT_PUBLIC_STORAGE_DUAL_WRITE`), backfill/copy existing `villa-images` + `site-assets` objects to R2 (one-time sync), flip **read** driver to r2, observe, then flip **write** driver to r2 and disable dual-write.
- **Risks:** stale image URLs (bucket path vs CDN base), cache-busting (`?v=` params), CORS on R2, missing objects after copy. Mitigation: verify `resolveVillaImageUrl`/`resolveAssetUrl` produce correct R2/CDN URLs; run the copy twice; keep Supabase bucket read-only as fallback until Phase 2.
- **Effort:** 2–4 days (mostly the object copy + verification).
- **Rollback:** flip `STORAGE_DRIVER`/`WRITE_DRIVER` back to `supabase` (env only) — instant, no redeploy of code.
- **Validation checklist:** upload a villa image in admin → appears on card/detail from R2/CDN; delete works; logo/favicon/hero/page-hero render from R2; `grep -r "supabase.storage"` in app/lib returns **0 live call-sites** (only provider internals remain, removed in P2); smoke path green.

---

## Phase 2 — Storage cleanup (delete dead Supabase-storage code)

- **Goal:** Remove `supabase-storage.provider.ts`, obsolete helpers, unused bucket config, and unused storage env vars. Simplify the storage surface to R2-only.
- **Files affected:** delete/trim `lib/storage/supabase-storage.provider.ts`; simplify `lib/storage/index.ts` (drop the driver switch to a single R2 provider), `cdn.config.ts`/`write.config.ts` (remove supabase branch), `storage.constants.ts`; remove dual-write scaffolding.
- **Risks:** removing a branch still referenced by a lazy path. Mitigation: do this only after Phase 1 has been in production ≥1 week with zero supabase-storage hits in logs.
- **Effort:** 1 day.
- **Rollback:** revert the deletion PR (small, isolated). This is the one phase where rollback is a git revert rather than a flag — acceptable because it only deletes now-unused code.
- **Validation checklist:** build/lint/typecheck green; storage smoke path green; storage env vars for Supabase removed from `.env.example` and Coolify; no import of `supabase-storage.provider`.

---

## Phase 3 — Database migration planning (no changes)

- **Goal:** Full portability plan for schema → self-hosted PostgreSQL on Hetzner.
- **Deliverable:** `docs/DB_MIGRATION_PLAN.md`. No code.
- **Analyze & classify:** tables (~40) + FKs + `EXCLUDE USING gist` no-overlap constraints; 38 functions + 6 triggers (portable PL/pgSQL); 15 RPCs (portable); indexes incl. `pg_trgm` GIN; extensions (`pg_trgm`, `btree_gist`, `pgcrypto`/`gen_random_uuid`); **RLS policies (20)** — flag every predicate using `auth.uid()`/`is_active_admin()` (these do NOT survive a native-pg/Drizzle connection).
- **Decide two strategic questions here:**
  1. **Query access:** keep PostgREST-style embeds (via a compat gateway) **or** rewrite embeds as Drizzle relational queries. *Recommendation: Drizzle* (SQL-first codebase, RPC-heavy) — accept the repo rewrite in Phase 5.
  2. **Authorization model:** since RLS won't run per-request on a pooled native connection, **authorization moves to the service/route layer** (Phase 8 designed here, shipped with Phase 5). Extensions/functions/triggers still migrate as-is (they enforce data integrity, not per-user auth).
- **Risks:** missing a `SECURITY DEFINER` semantic, `EXCLUDE` constraint quirks, TZ/`current_date` behaviour, extension availability on Hetzner PG image. Mitigation: test a `pg_dump --schema-only` restore on a throwaway Coolify PG now.
- **Effort:** 2–3 days.
- **Rollback:** N/A.
- **Validation checklist:** schema restores cleanly on a fresh PostgreSQL 16 container; every RPC/function/trigger created without error; a written list of RLS predicates and their app-layer replacement.

---

## Phase 4 — Native `DbProvider` (build alongside, don't cut over)

- **Goal:** A second `DbProvider` implementation backed by native PostgreSQL (Drizzle/pg), selectable by env, **business logic unchanged**.
- **Files affected:** new `lib/db/native-db.provider.ts` (or `drizzle-db.provider.ts`), `lib/db/index.ts`/`server.ts` (switch point — already documented for exactly this), connection/pool config, Drizzle schema definitions. Repositories NOT yet touched.
- **Key design constraint:** the current `DbProvider` interface is PostgREST-shaped (`from`, `rpc`). Native PG doesn't match that 1:1. Two viable shapes: (a) a thin adapter that emulates the `.from().select()` chain (high effort, brittle), or (b) **change the provider contract to typed query methods and migrate repos in Phase 5** (recommended). Choose (b): the interface evolves, repos follow.
- **Risks:** connection pooling under serverless/Coolify (use a pooler), transaction semantics, prepared-statement caching. Mitigation: pool sizing tests; run both providers in staging.
- **Effort:** 4–6 days.
- **Rollback:** env flag selects Supabase provider (default) — native provider is dormant until Phase 5.
- **Validation checklist:** a handful of read-only repos wired to the native provider on **staging** return identical shapes; prod still on Supabase provider; build green.

---

## Phase 5 — Repository migration (swap query implementation, keep services/UI)

- **Goal:** Move all 59 repositories from PostgREST embeds to the native provider **without changing service signatures or UI**. Ship **server-side authorization** in lockstep (the RLS replacement — see Correction 1).
- **Files affected:** `lib/db/*.repository*.ts` (59, per-domain, one PR each), plus a new authorization layer (route/service guards replacing RLS predicates) — services/UI **unchanged**.
- **Method:** migrate **one repository domain per sprint**, behind the env flag, verified on staging, then enabled in prod. Because services consume typed repo methods, the blast radius stops at the repo. Port RPCs (`replace_villa_*`, availability, short-gaps) as SQL functions kept in the DB and called via the native provider's `rpc`/raw-SQL.
- **Risks (highest of the whole migration):** embed→join correctness (reservation availability, `EXCLUDE` overlap, price ranges), N+1 regressions, and the **authorization gap** if RLS is dropped before guards exist. Mitigation: (1) golden-master tests on availability/pricing; (2) **every write path gets an explicit server-side admin/ownership check before native-PG is enabled**; (3) keep RLS active on the Supabase copy until the native path is proven.
- **Effort:** 15–25 days (the bulk of the project).
- **Rollback:** per-domain env flag back to Supabase provider; each PR is small and independently revertible.
- **Validation checklist:** per domain — repo unit/contract tests pass; smoke path green; availability + pricing golden-master identical; admin writes rejected without a valid admin session (authz works at app layer, not DB).

---

## Phase 5.5 — Physical data cutover (Supabase PG → Hetzner PG)

- **Goal:** Move the *data* to Hetzner PostgreSQL with minimal downtime and a clean rollback.
- **Method options (pick per risk tolerance):** (a) **logical replication** Supabase→Hetzner, cut over at a low-traffic window; or (b) **maintenance-window dump/restore** (`pg_dump`/`pg_restore`) with a brief read-only freeze. Freeze writes → final sync → flip the native provider's connection string to Hetzner → verify → open writes.
- **Files affected:** none (env/connection only) if Phase 4/5 provider is connection-string driven.
- **Risks:** replication lag, sequence/identity drift, `EXCLUDE`/extension parity, cutover window length. Mitigation: rehearse on staging twice; checksum row counts per table; keep Supabase DB as warm rollback for ≥1 week.
- **Effort:** 2–4 days incl. rehearsals.
- **Rollback:** point connection string back to Supabase PG (writes were frozen during cutover, so no divergence) — env-only.
- **Validation checklist:** row-count/checksum parity per table; smoke path against Hetzner; reservations create/read correctly; cron RPCs run on Hetzner.

---

## Phase 6 — Remove Supabase Database clients

- **Goal:** Delete the Supabase DB provider, anon client, and service-role client; drop DB env vars.
- **Files affected:** delete `lib/db/supabase-db.provider.ts`, `lib/supabase.ts` (DB parts), `lib/supabase/{client,server}.ts` DB usage, `lib/supabase-admin.ts` **iff** no auth still needs it (careful: Auth still uses Supabase until Phase 7 — sequence-sensitive). Trim `lib/db/index.ts`/`server.ts` to native-only.
- **Risks:** removing a client still referenced by the not-yet-migrated Auth (Phase 7). Mitigation: **do Phase 6 for DB-only clients; keep the Auth client until Phase 7** — this is why DB and Auth clients must be separable (they are: `supabase-admin` vs `supabase/*` auth).
- **Effort:** 1–2 days.
- **Rollback:** revert PR (isolated); but by now prod runs on Hetzner, so this is just dead-code removal.
- **Validation checklist:** `grep` for supabase DB clients → 0; build green; smoke path green on Hetzner.

---

## Phase 7 — Authentication → Better Auth

- **Goal:** Replace Supabase Auth (login/logout/session/cookies/middleware/admin provisioning) with Better Auth, storing sessions in Hetzner PostgreSQL.
- **Files affected:** `lib/auth/*` (new `better-auth` provider behind the existing `AuthProvider` interface), `middleware.ts` (session refresh/guard rewrite), `app/(admin)/maki-admin/login/page.tsx`, `AdminSessionGuard.tsx`, `app/api/admin/create-user/route.ts`, `app/api/admin-users/[id]/route.ts`, `admin-user.repository*`. New Better Auth tables (user/session/account) in PG.
- **Method:** implement `AuthProvider` for Better Auth; migrate admin users (email + password hash strategy or forced reset); switch middleware to Better Auth sessions; keep the `is_active_admin` **concept** but now as an app-layer check against `admin_users` (already done in Phase 5/8).
- **Risks:** password/credential migration (Supabase stores hashes you may not export → likely **forced password reset** for admins), session cookie parity, middleware redirect correctness, CSRF. Mitigation: small admin user count → forced reset is acceptable; test session lifecycle thoroughly; keep the old login reachable on staging during parallel-run.
- **Effort:** 5–8 days.
- **Rollback:** env flag `AUTH_PROVIDER=supabase|betterauth` selecting the `AuthProvider` impl — until Supabase Auth is deleted in Phase 9.
- **Validation checklist:** admin login/logout/session-refresh work; protected routes enforce; new admin creation works; permissions/sidebar intact; smoke path green.

---

## Phase 8 — Authorization (server-side) — *designed in P3, shipped with P5, finalized here*

- **Goal:** All access control lives in route handlers/services (admin checks, ownership, public-write guards). RLS is no longer the security boundary.
- **Files affected:** a shared authorization module + guards applied in admin API routes / server actions / cron auth (already `authorizeCronRequest`). This is mostly *already in place by Phase 5*; Phase 8 is the audit that **every** previously-RLS-protected table now has an explicit app-layer guard.
- **Risks:** a table that was only protected by RLS and has no app guard → silent open access. Mitigation: derive the guard checklist directly from the Phase 3 RLS-predicate inventory; deny-by-default.
- **Effort:** 2–4 days (net, if P5 did it incrementally).
- **Rollback:** guards are additive; reverting a guard is low-risk but would re-open access — instead fix forward.
- **Validation checklist:** every admin write requires an admin session; public writes (contact/reservation) rate-limited + validated server-side; a negative test per table (unauthenticated write rejected).

---

## Phase 9 — Cleanup / package & env purge

- **Goal:** Zero Supabase footprint.
- **Files affected:** `package.json` (remove `@supabase/supabase-js`, `@supabase/ssr`), delete `lib/supabase*.ts`, `lib/supabase/*`, `lib/auth/supabase-auth*`, any Supabase-only SQL/docs, `.env.example` + Coolify env (remove `SUPABASE_*`).
- **Risks:** a stray import breaking build; a runtime env still read. Mitigation: the Phase 0 burndown greps must all reach 0 before this PR.
- **Effort:** 1 day.
- **Rollback:** revert PR (safe — everything it removes is already unused).
- **Validation checklist:** `grep -ri "supabase"` in `app|lib|package.json|.env*` → **0**; build/lint/typecheck green; full smoke path green; app deploys on Coolify with only Hetzner/R2/Better Auth env.

---

## Phase 10 — Next.js 15 → 16 (isolated bookend, do LAST)

- **Goal:** Framework upgrade, on a now-stable Supabase-free stack.
- **Rationale:** never combine framework + backend migration in one sprint. Doing it last means any Next 16 breakage (middleware/proxy convention changes — the codebase already flags a `middleware.ts → Proxy` TODO) is debugged against a stable backend.
- **Risks:** middleware/proxy API changes, caching semantics, `unstable_cache` evolution. Mitigation: upgrade on a branch, run the full smoke path, watch the `middleware`/`revalidateTag` behaviours specifically.
- **Effort:** 3–6 days.
- **Rollback:** revert the upgrade branch.
- **Validation checklist:** build/lint/typecheck green on Next 16; middleware auth + caching behave; smoke path green.

---

## Cross-cutting risk register

| Risk | Severity | Where | Mitigation |
|---|---|---|---|
| RLS dropped before app-layer authz exists | **Critical** | P5/P6 | Authz ships **with** repo migration; deny-by-default; keep Supabase RLS copy warm |
| Availability/pricing regression on embed→join | High | P5 | Golden-master tests; per-domain flag rollback |
| Data cutover divergence | High | P5.5 | Write-freeze window; checksums; warm rollback DB |
| Password/credential migration | Medium | P7 | Forced admin reset; small admin set |
| Image URL / CDN breakage | Medium | P1 | Verify resolvers; dual-write; read-only Supabase fallback |
| Connection pooling on Coolify | Medium | P4 | Use a pooler; load test |
| Next 16 middleware/proxy change | Medium | P10 | Isolated last phase |
| Cron scheduler (already Coolify, not Supabase) | Low | — | Unaffected; ensure tasks configured |

## Reusability & confidence
- Reusable code: **~85–90%** (services, UI, price engine, schema, functions, provider interfaces).
- Estimated total effort: **~7–11 weeks** for one senior engineer (P0–P10), front-loaded on Phase 5.
- Estimated migration success probability: **~90%**, contingent on Correction 1 (authz-before-cutover) being respected.

## One-paragraph recommendation
Follow the proposed order with three amendments: **(1)** design and ship **server-side authorization together with the repository migration** (never let native PG run without app-layer guards); **(2)** treat the **physical data cutover as its own reversible phase (5.5)** with a write-freeze window and warm rollback; **(3)** do the **Next.js 16 upgrade last, isolated**. Execute every phase behind the existing provider seams with per-environment flags so `main` stays deployable and each step is revertible by config rather than by code revert. Storage first (lowest risk, mostly done), database in the middle (highest effort, do it domain-by-domain), auth last-but-one (highest coupling), then purge and upgrade.
