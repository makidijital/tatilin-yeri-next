-- ============================================================================
-- Migration 026 — pages RLS hardening (FAZ 52A Sprint A)
-- ============================================================================
-- AMAÇ:
--   public.pages tablosunda RLS aktif değildi → anon herhangi bir page'i
--   UPDATE/DELETE edebilir, inactive page'leri SELECT edebilir, seo_title
--   bypass ile SEO manipülasyonu yapılabilirdi. Bu migration RLS'yi devreye
--   alır ve minimal policy seti tanımlar.
--
-- POLICIES:
--   anon:
--     SELECT  → yalnız is_active=true (canonical public visibility)
--     INSERT/UPDATE/DELETE → yasak
--   authenticated:
--     SELECT/INSERT/UPDATE/DELETE → tam (admin CRUD; sidebar permission
--     uygulama tarafında zaten yetki kontrolü yapıyor)
--
-- SERVICE/ROUTE AUDIT (production-safe verify):
--   • getPageBySlug (app/services/page.service.ts) — /p/[slug] server
--     component'ten anon ile çağrılıyor; is_active filtresi YOK. RLS
--     `using (is_active = true)` ile bu boşluk artık DB tarafından
--     kapatılıyor → inactive page'ler 404, byte-identical desired behavior.
--     (FAZ 49B audit'inde tespit edilen drift'in bonus fix'i.)
--   • getPages (app/services/page.service.ts) — admin liste sayfasında
--     `"use client"` (auth context) ile çağrılır; service kendisi zaten
--     `.eq("is_active", true)` filtreliyor → davranış değişmiyor.
--   • getMenu (app/services/menu.service.ts) — pages için
--     `.eq("is_active", true)` filtresi var → RLS ile uyumlu.
--   • /maki-admin/pages/page.tsx — "use client", supabase auth JWT
--     attach'lı → authenticated rol policy'si tam CRUD veriyor.
--   • /maki-admin/pages/new/page.tsx — yine "use client", insert
--     authenticated context'te yapılır.
--
-- IDEMPOTENT: ENABLE RLS PostgreSQL'de zaten tekrar çalıştırmaya immune;
--   policy'ler DROP IF EXISTS + CREATE pattern'i ile rerun-safe.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   DROP POLICY IF EXISTS "pages_anon_select_active"   ON public.pages;
--   DROP POLICY IF EXISTS "pages_authenticated_all"    ON public.pages;
--   ALTER TABLE public.pages DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Anon SELECT — yalnız aktif sayfalar (public CMS surface)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pages_anon_select_active" ON public.pages;
CREATE POLICY "pages_anon_select_active"
  ON public.pages
  FOR SELECT
  TO anon
  USING (is_active = true);

-- ----------------------------------------------------------------------------
-- Authenticated full CRUD — admin moderation
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pages_authenticated_all" ON public.pages;
CREATE POLICY "pages_authenticated_all"
  ON public.pages
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.pages IS
  'CMS pages (migration 004/014). RLS (migration 026): anon SELECT '
  'WHERE is_active=true; authenticated full CRUD. Inactive pages are '
  'hidden from public /p/[slug] route by RLS — defense-in-depth in '
  'addition to service-layer filtering.';
