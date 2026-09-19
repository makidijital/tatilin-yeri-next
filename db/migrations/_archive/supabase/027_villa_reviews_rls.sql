-- ============================================================================
-- Migration 027 — villa_reviews RLS hardening (FAZ 52A Sprint A)
-- ============================================================================
-- AMAÇ:
--   public.villa_reviews tablosunda RLS aktif değildi → anon herhangi bir
--   review'i UPDATE/DELETE edebilir, `is_approved=true` set ederek admin
--   onayını bypass edebilir, `is_featured=true` set edebilirdi. Bu
--   migration RLS'yi devreye alır ve incremental policy seti tanımlar.
--
-- POLICIES:
--   anon:
--     SELECT  → yalnız is_approved=true (public villa detail + homepage
--               + aggregate rating sayfalarının okuduğu surface)
--     INSERT  → WITH CHECK (is_approved=false, is_featured=false,
--               approved_at IS NULL, plus column-bound integrity
--               constraints). Guest hiçbir zaman direkt onay/featured
--               yazamaz; service-side validation'ın defense-in-depth
--               kopyası.
--     UPDATE/DELETE → yasak
--   authenticated:
--     SELECT/INSERT/UPDATE/DELETE → tam (admin moderation; sidebar
--     permission "reviews" uygulama tarafında yetki kontrolü yapar)
--
-- SERVICE/ROUTE AUDIT (production-safe verify):
--   • getApprovedVillaReviews (villa detail)        — eq("is_approved",true) ✓
--   • getGlobalReviewStats (homepage hero card)     — eq("is_approved",true) ✓
--   • getVillaReviewStatsBatch (villa cards)        — eq("is_approved",true) ✓
--   • getFeaturedHomepageReviews (homepage)         — eq("is_approved",true) ✓
--   • getVillaReviewStats (villa detail aggregate)  — eq("is_approved",true) ✓
--   Tüm public read'ler zaten is_approved=true filter ediyor → RLS davranış
--   değişikliği yaratmaz; sadece DB-level enforce ekler.
--
--   • createVillaReview (public form) — INSERT payload:
--       is_approved: false, is_featured: false
--     ✓ Yeni WITH CHECK ile birebir uyumlu; rating 1..5, name 2..80,
--     comment 10..1500 zaten service-side validate ediliyor → RLS
--     redundancy + defense-in-depth.
--
--   • getVillaReviewsForAdmin, approveVillaReview, deleteVillaReview,
--     toggleFeaturedReview — admin /maki-admin/reviews `"use client"`
--     ReviewAdminList'ten çağrılır; Supabase Auth JWT attach edilir →
--     authenticated role context → policy "authenticated_all" ile tam
--     CRUD erişimi. Davranış değişmiyor.
--
-- BREAK RISK:
--   • SSR public render: anon context — RLS sadece zaten filtrelenen
--     satırları döndürür → davranış byte-identical.
--   • Admin moderation: authenticated context — RLS tam erişim verir.
--   • Cache: `villa-reviews` tag aynı; revalidateVillaReviews akışı
--     etkilenmiyor.
--
-- IDEMPOTENT: ENABLE RLS idempotent; policy'ler DROP IF EXISTS + CREATE.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   DROP POLICY IF EXISTS "villa_reviews_anon_select_approved" ON public.villa_reviews;
--   DROP POLICY IF EXISTS "villa_reviews_anon_insert_pending"  ON public.villa_reviews;
--   DROP POLICY IF EXISTS "villa_reviews_authenticated_all"    ON public.villa_reviews;
--   ALTER TABLE public.villa_reviews DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE public.villa_reviews ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Anon SELECT — yalnız onaylı review'ler
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "villa_reviews_anon_select_approved" ON public.villa_reviews;
CREATE POLICY "villa_reviews_anon_select_approved"
  ON public.villa_reviews
  FOR SELECT
  TO anon
  USING (is_approved = true);

-- ----------------------------------------------------------------------------
-- Anon INSERT — guest yorum gönderir, mutlaka pending
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "villa_reviews_anon_insert_pending" ON public.villa_reviews;
CREATE POLICY "villa_reviews_anon_insert_pending"
  ON public.villa_reviews
  FOR INSERT
  TO anon
  WITH CHECK (
    is_approved = false
    AND is_featured = false
    AND approved_at IS NULL
    AND rating BETWEEN 1 AND 5
    AND length(btrim(coalesce(guest_name, ''))) BETWEEN 2 AND 80
    AND length(btrim(coalesce(comment, '')))    BETWEEN 10 AND 1500
  );

-- ----------------------------------------------------------------------------
-- Authenticated full CRUD — admin moderation
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "villa_reviews_authenticated_all" ON public.villa_reviews;
CREATE POLICY "villa_reviews_authenticated_all"
  ON public.villa_reviews
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.villa_reviews IS
  'Guest reviews (FAZ 33). RLS (migration 027): anon SELECT is_approved=true; '
  'anon INSERT only with is_approved=false/is_featured=false + column-bound '
  'integrity checks; authenticated full CRUD for admin moderation.';
