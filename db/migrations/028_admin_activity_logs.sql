-- ============================================================================
-- Migration 028 — admin_activity_logs (FAZ 55 audit trail infrastructure)
-- ============================================================================
-- AMAÇ:
--   Production-grade admin audit trail. Hangi admin kullanıcının ne zaman,
--   hangi entity'de, ne değişiklik yaptığını tek tabloda toplar. Mevcut
--   reservation/pricing/mail send pipeline'ı dokunulmaz; logging caller-
--   driven (operation başarılı olduktan sonra wrapper çağrı).
--
-- KOLONLAR:
--   id              uuid PK
--   admin_user_id   uuid — admin_users.id snapshot referansı (FK YOK; admin
--                   silinince log korunur)
--   admin_email     text — caller email snapshot (admin row silinse bile
--                   audit trail'de kalır)
--   action          text — "villa.update", "reservation.status_change",
--                   "review.approve", "settings.update", "mail_logs.cleanup",
--                   "exchange_rates.refresh", vs. Service-layer logger
--                   string constant olarak gönderir.
--   entity_type     text — "villa", "reservation", "review", "page",
--                   "settings", "admin_user", "exchange_rates", "mail_logs"
--   entity_id       text — entity uuid string-form (TRUNCATE/cleanup için
--                   nullable; örn. mail_logs.cleanup tek satır değil bulk)
--   entity_title    text — human-readable label (villa.title, review.guest_name,
--                   "30 günden eski mail logları" vs.)
--   before_data     jsonb — pre-mutation snapshot (CREATE için NULL)
--   after_data      jsonb — post-mutation snapshot (DELETE için NULL)
--   diff_summary    text[] — ["price: 12000 → 13500", "is_featured: false → true"]
--                   Caller compute eder; masking uygulanır.
--   route           text — operation triggered olan route path (örn.
--                   "/maki-admin/villas/[id]") — caller header'dan veya
--                   referer'dan capture
--   ip_address      text — x-forwarded-for first hop (server-side endpoint'te
--                   capture)
--   user_agent      text — user-agent header (server-side endpoint'te capture)
--   created_at      timestamptz NOT NULL default now()
--
-- INDEXES:
--   • (created_at DESC)             — listing default
--   • (admin_user_id, created_at)   — admin user filter
--   • (entity_type, entity_id)      — entity history lookup
--   • (action)                      — action filter (LOW cardinality but useful)
--
-- RLS:
--   anon  → tüm operasyonlar yasak
--   authenticated → SELECT açık (admin moderation listesi);
--                   INSERT yasak (yalnız service-role logger insert eder);
--                   UPDATE yasak (immutable audit trail);
--                   DELETE açık (cleanup için authenticated admin gerekli;
--                   /api/admin/activity-logs/cleanup endpoint service-role
--                   kullanır, RLS bypass; ama authenticated DELETE policy
--                   defense-in-depth için tanımlı bırakıldı).
--
-- SIDEBAR PERMISSION:
--   "activity_logs" key admin_users.sidebar_permissions JSONB array'ine
--   idempotent eklenir (mevcut faz 22/25/etc. pattern parity).
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   DROP TABLE IF EXISTS public.admin_activity_logs;
--   UPDATE admin_users SET sidebar_permissions =
--     sidebar_permissions - 'activity_logs' WHERE is_active = true;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   uuid,
  admin_email     text NOT NULL,
  action          text NOT NULL,
  entity_type     text,
  entity_id       text,
  entity_title    text,
  before_data     jsonb,
  after_data      jsonb,
  diff_summary    text[],
  route           text,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_activity_logs_created_at_idx
  ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_logs_admin_user_idx
  ON public.admin_activity_logs (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_logs_entity_idx
  ON public.admin_activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS admin_activity_logs_action_idx
  ON public.admin_activity_logs (action);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated SELECT — admin moderation listesi (RLS bypass için
-- service-role da kullanılabilir; bu policy client browser context'i için).
DROP POLICY IF EXISTS "admin_activity_logs_authenticated_select"
  ON public.admin_activity_logs;
CREATE POLICY "admin_activity_logs_authenticated_select"
  ON public.admin_activity_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated DELETE — cleanup endpoint normalde service-role kullanır,
-- ama defense-in-depth için policy yine de tanımlı (idempotent).
DROP POLICY IF EXISTS "admin_activity_logs_authenticated_delete"
  ON public.admin_activity_logs;
CREATE POLICY "admin_activity_logs_authenticated_delete"
  ON public.admin_activity_logs
  FOR DELETE
  TO authenticated
  USING (true);

-- INSERT/UPDATE policy YOK → yalnız service-role yazabilir. Audit trail
-- immutable (admin'in kendi izini silmesi engellenir; cleanup ayrı endpoint).

-- ----------------------------------------------------------------------------
-- Sidebar permission grant — idempotent
-- ----------------------------------------------------------------------------
UPDATE public.admin_users
SET sidebar_permissions =
  CASE
    WHEN sidebar_permissions IS NULL THEN '["activity_logs"]'::jsonb
    ELSE sidebar_permissions || '["activity_logs"]'::jsonb
  END
WHERE is_active = true
  AND (
    sidebar_permissions IS NULL
    OR NOT (sidebar_permissions ? 'activity_logs')
  );

COMMENT ON TABLE public.admin_activity_logs IS
  'Production audit trail (FAZ 55). Caller-driven service-layer logging — '
  'operation başarılı olduktan sonra logger çağrılır. Masking + diff_summary '
  'caller compute eder; service-role insert only; RLS authenticated SELECT '
  '+ DELETE (cleanup). Immutable: UPDATE/INSERT for non-service-role yasak.';
