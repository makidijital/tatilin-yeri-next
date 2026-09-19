# Supabase → Hetzner Postgres — Migration Inventory (Phase 0)

**Scenario A:** Supabase Auth stays · Database moves to Hetzner Postgres
**Status:** Analysis only — no code changes, no refactor.
**Key facts:** 40 tables · ~95 `from()` calls · 30 `.rpc()` calls · ~22 SQL functions · 37 RLS policies · 11 `auth.uid()` uses · **0 direct `auth.users` foreign keys** (auth coupling is runtime-only via `auth.uid()`).

Row/write estimates assume a small–mid operation (~50–500 villas). Re-confirm against live `pg_stat_user_tables` before cutover.

---

## TASK 1 — Table Inventory

### A. Public content tables (read-heavy, no auth identity stored)

| Table | Purpose | Est. rows | Write freq | Difficulty |
|---|---|---|---|---|
| `villa` | Core property record | 50–5,000 | Low (admin) | **Easy** |
| `villa_images` | Image refs (storage paths) | villa × ~10 | Low | **Easy** |
| `villa_prices` | Seasonal nightly prices | villa × seasons | Low | **Easy** |
| `villa_features` / `villa_feature_relations` | Amenities + M:N | small / villa×N | Low | **Easy** |
| `villa_types` / `villa_type_relations` | Categories + M:N | small / villa×N | Low | **Easy** |
| `villa_locations` | Regions (+ cover paths) | small | Low | **Easy** |
| `villa_distances` | "Nearby" points | villa × N | Low | **Easy** |
| `rule_items` / `villa_rule_relations` | House rules + M:N | small / villa×N | Low | **Easy** |
| `price_include_items` / `villa_price_include_relations` | "Included" + M:N | small / villa×N | Low | **Easy** |
| `menu` | CMS navigation | small | Low | **Easy** |
| `pages` | CMS pages | small | Low | **Easy** |
| `blog_posts` | Blog | small–med | Low | **Easy** |
| `faqs` | Global FAQ | small | Low | **Easy** |
| `homepage_collections` | Curated homepage villas | small | Low | **Easy** |
| `discount_collections` | Curated discount villas | small | Low | **Easy** |
| `payment_methods` | Public payment options | small | Low | **Easy** |
| `exchange_rates` | FX rates | small | Med (cron) | **Easy** |
| `villa_reviews` | Guest reviews (moderated) | grows | Med (public write) | **Easy** |
| `contact_messages` | Contact form inbox | grows | Med (public write) | **Easy** |
| `offer_requests` | Concierge offer requests | grows | Med (public write) | **Easy** |
| `settings` | Singleton site config | 1 | Rare | **Easy** (read via `get_public_settings` RPC) |
| `villa_short_gaps` | Precomputed calendar gaps | derived | Periodic refresh | **Moderate** (refresh fn + schedule) |

### B. Booking / availability tables (correctness-critical)

| Table | Purpose | Est. rows | Write freq | Difficulty |
|---|---|---|---|---|
| `reservations` | Guest reservations | grows steadily | **High** (public create + admin status) | **Moderate** — `btree_gist` `EXCLUDE` constraint, availability RPCs; concurrency-critical |
| `manual_reservations` | Admin manual blocks | med | Med (admin) | **Moderate** — own `EXCLUDE` constraint |
| `external_calendar_sources` | iCal source config | small | Low | **Moderate** — cron + service-role |
| `external_calendar_events` | Synced iCal blocks | high churn | **High** (cron truncate/insert) | **Moderate** — overlap trigger fn + cron |
| `villa_zip_links` | Tokenized share links | med, expiring | Med + cleanup | **Moderate** — `consume_villa_zip_token` DEFINER + cleanup cron |
| `shared_villa_lists` | Shared villa list tokens | med, expiring | Med + cleanup | **Moderate** — cleanup cron |
| `shared_favorite_lists` | Shared favorites tokens | med, expiring | Med + cleanup | **Moderate** — cleanup cron |

### C. Admin / operational tables (RLS admin-gated, no auth id stored)

| Table | Purpose | Est. rows | Write freq | Difficulty |
|---|---|---|---|---|
| `mail_logs` | Outbound email audit | **grows fast** | High (append) | **Moderate** — service-role only |
| `admin_activity_logs` | Admin audit trail | grows | High (append) | **Moderate** — actor id re-point |
| `admin_audit_logs` | Legacy/duplicate audit (verify) | ? | ? | **Moderate** — confirm if live |
| `app_meta` | Internal key/value meta | tiny | Rare | **Easy** |
| `payment_accounts` | Bank/payment account details (sensitive) | small | Low | **Hard** — RLS hardened to `is_active_admin()` |
| `western_union_accounts` | WU payout accounts (sensitive) | small | Low | **Hard** — RLS + `auth.uid()` |
| `property_owners` | Owner records | small | Low | **Hard** — RLS admin-gated |

### D. Auth-coupled table

| Table | Purpose | Est. rows | Write freq | Difficulty |
|---|---|---|---|---|
| `admin_users` | Admin accounts + `sidebar_permissions`; `auth_user_id` = Supabase `auth.uid()` | small | Low | **Hard** — the single auth seam |

> Note: only `admin_users` *stores* a Supabase auth identifier (`auth_user_id`). It is a **plain UUID column, not a FK to `auth.users`** (0 `auth.users` references in schema) — so it travels to Hetzner as-is; only the JWT→uid resolution stays on Supabase Auth.

---

## TASK 2 — Function / RPC Inventory

All functions are **standard PL/pgSQL / SQL** — portable to Hetzner. Coupling is the **call mechanism** (supabase-js `.rpc()`) and, for `is_active_admin`, the `auth.uid()` dependency.

| Function | Purpose | Called from | Criticality |
|---|---|---|---|
| `check_villa_availability_conflict` | Booking overlap check (DEFINER, RLS-bypass) | `reservation/_helpers/conflict.ts` | **Business critical** |
| `get_villa_blocked_ranges` | Villa detail blocked dates | public villa detail / API | **Business critical** |
| `get_blocked_villa_ids` | Search availability filter | `/arama` search | **Business critical** |
| `replace_villa_prices` | Atomic price set on villa save | villa admin service | **Business critical** |
| `replace_villa_type_relations` | Atomic category set | villa admin service | **Business critical** |
| `replace_villa_feature_relations` | Atomic amenity set | villa admin service | **Business critical** |
| `replace_villa_rule_relations` | Atomic rule set | villa admin service | **Business critical** |
| `replace_villa_price_include_relations` | Atomic includes set | villa admin service | **Business critical** |
| `replace_villa_distances` | Atomic distances set | villa admin service | **Business critical** |
| `get_public_settings` | Public-safe settings projection (DEFINER) | `getPublicSettings` → homepage/layout | **Business critical** |
| `is_active_admin` | Admin check for RLS (DEFINER, `auth.uid()`) | every `*_admin_write` RLS policy | **Critical (auth-coupled)** |
| `consume_villa_zip_token` | Token redeem (DEFINER) | villa-zip API | Business critical (feature) |
| `set_villa_sort_orders` | Bulk villa ordering | villa sort admin | Business critical (admin) |
| `refresh_villa_short_gaps` | Recompute short-gap cache | cron | Optional (feature) |
| `get_short_gap_counts` | Short-gap counts | homepage section | Optional (feature) |
| `check_external_calendar_no_overlap` | iCal overlap constraint trigger | DB trigger | Business critical (data integrity) |
| `cleanup_past_manual_reservations` | Purge old manual blocks | cron | Optional (housekeeping) |
| `cleanup_expired_shared_villa_lists` | Purge expired share tokens | cron | Optional (housekeeping) |
| `cleanup_expired_shared_favorite_lists` | Purge expired favorites | cron | Optional (housekeeping) |
| `trg_settings_touch_updated_at` | `updated_at` auto-touch trigger | DB trigger | Optional |
| `trg_western_union_accounts_touch_updated_at` | `updated_at` trigger | DB trigger | Optional |

**Extensions required on Hetzner:** `btree_gist` (overlap EXCLUDE), `pgcrypto`/`gen_random_uuid` (PKs). Both standard contrib.

---

## TASK 3 — Supabase Dependency Inventory

| Dependency | Count / location | Migration impact |
|---|---|---|
| `supabase.from()` / `db.from()` data calls | **~95** across services/repositories | **High** — the data-access surface. Either self-host PostgREST (keep semantics) or reimplement `DbProvider` over node-postgres. |
| `.rpc()` calls | **30** (→ ~14 distinct functions) | **High** — functions port; call mechanism must change with the DB client. |
| Service-role (`getSupabaseAdmin` / `dbAdmin`) | **~270 refs** | **Medium** — admin/cron writes bypass RLS today; on Hetzner these become "trusted server connection" (no RLS). Conceptually simpler, but the volume shows how much depends on a privileged path. |
| RLS policies | **37** `create policy` (canonical `public_read` + `admin_write`) | **High (conceptually)** — `public_read using(true)` is trivial to drop; `admin_write` depends on `is_active_admin()`/`auth.uid()` → not portable. Replace with app-layer authz. |
| `auth.uid()` | **11** (in `034,037,038,040,042,043,044,060`) | **Critical** — the only thing tying RLS to Supabase Auth. |
| `auth.users` (FK) | **0** | **None** — no hard schema dependency on the auth schema. |
| `supabase.auth` (client) | ~38 refs, behind `AuthProvider` | **None for Scenario A** — auth stays on Supabase. |
| `supabase.storage` | Behind `storageProvider` (R2 active) | **None** — already migrated. |
| Cache layer (`unstable_cache`/`revalidateTag`) | App-side | **None** — DB-host-agnostic. |
| Scheduled jobs (`/api/cron/*`, pg_cron) | external-calendar-sync, cleanups, short-gap refresh, mail-log cleanup | **Medium** — re-home scheduler. |
| Connection pooling (PgBouncer) | Provided by Supabase | **Medium** — must self-provision on Hetzner. |

---

## TASK 4 — Migration Blockers (ranked)

### Critical
1. **RLS authorization is bound to `auth.uid()` via `is_active_admin()`.** On plain Hetzner Postgres there is no `auth.uid()`; every `admin_write` policy becomes inoperative. Any table exposed without RLS *and* without an enforced app-layer guard is open. **Must establish enforced app-layer authorization before dropping RLS.** Highest consequence: `payment_accounts`, `western_union_accounts`, `reservations` (PII).
2. **Data-access layer is Supabase-client-shaped (`.from()/.rpc()`, ~125 call sites).** No DB host swap is possible until this is solved — either self-hosted PostgREST (keeps supabase-js semantics) or a new `DbProvider`.

### High
3. **Connection pooling.** Serverless Next.js against unpooled Postgres exhausts connections. PgBouncer (transaction mode) is mandatory before any production traffic.
4. **Auth identity bridging.** Verify Supabase GoTrue JWTs in-app and map `sub` → `admin_users.auth_user_id` (now a plain UUID on Hetzner). Low schema impact, but must be correct or admins lock out.
5. **Booking-engine fidelity.** `EXCLUDE`/`btree_gist` + availability RPCs must behave byte-identically (half-open `[)` ranges, status allow-list). Concurrency must be re-tested on Hetzner.

### Medium
6. **Scheduled jobs re-homing** (iCal sync, short-gap refresh, expiry cleanups, mail-log cleanup) — currently Supabase-hosted cron / `/api/cron/*`.
7. **Service-role volume (~270).** All privileged writes assume a trusted bypass path; ensure the Hetzner "trusted server" connection is locked down (network, least-privilege DB role).
8. **Schema completeness.** Core tables (`villa`, `reservations`, `settings`, `admin_users`, …) were created **outside** `db/migrations/`. Any dashboard-created policy/function/trigger won't be in the repo. **Must dump live schema (`pg_dump --schema-only`, `pg_policies`, `information_schema.routines`) as the source of truth.**
9. **`admin_audit_logs` vs `admin_activity_logs`** — confirm which is live; avoid migrating a dead table.

### Low (not blockers — flagged to prevent wasted effort)
- Storage (R2, done), Cache layer (app-side), `supabase.auth` (stays). No action for Scenario A.

---

## One-line readiness verdict
**Migratable, low data-loss risk.** The blockers are concentrated in two places — *replace RLS authz with app-layer authz* and *replace/relayer the Supabase data client + pooling*. Schema and functions are standard Postgres and port cleanly. Confirm the live schema dump before sizing the work.
