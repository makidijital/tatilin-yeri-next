-- ============================================================================
-- Migration 049 — Public Form Anon-Insert Policy Drop (RLS Hardening)
-- ============================================================================
-- AMAÇ:
--   İletişim ve teklif formlarının ESKİ "client-side anon INSERT" yolunu
--   tamamen kapat. Bu insert'ler artık SUNUCU route'larından service-role
--   ile yapılıyor:
--     • /api/public/contact          → contact_messages
--     • /api/public/offer-requests   → offer_requests
--   Her iki route: applyRateLimit + honeypot/time-trap + server validation +
--   getSupabaseAdmin() (service_role) insert. service_role RLS'i bypass eder,
--   dolayısıyla anon INSERT policy'lerine artık İHTİYAÇ YOK.
--
-- ÖNKOŞUL (PRODUCTION'da canlı + doğrulanmış olmalı — SIRA KRİTİK):
--   1) /api/public/contact + /api/public/offer-requests route'ları deploy.
--   2) ContactForm + OfferRequestForm submit'leri bu route'lara fetch ediyor
--      (artık doğrudan supabase.from(...).insert() YOK).
--   Bu migration ÖNKOŞUL OLMADAN uygulanırsa public form submit'leri kırılır
--   (anon insert reddedilir, henüz server route yok). mig 040 ile aynı disiplin.
--
-- KALDIRILAN POLICY'LER:
--   • contact_messages_public_insert   (migration 015) — FOR INSERT
--     TO anon, authenticated WITH CHECK (true)
--   • offer_requests_anon_insert       (migration 022) — FOR INSERT
--     TO anon WITH CHECK (true)
--
-- ETKİ ANALİZİ:
--   • Anon (tarayıcıda görünen anon key) ham PostgREST üzerinden artık bu
--     tablolara satır YAZAMAZ → spam/flood ham-REST baypası kapanır.
--   • service_role INSERT (server route) ETKİLENMEZ — RLS bypass.
--   • Admin SELECT / UPDATE / DELETE policy'leri AYNEN durur (bu migration
--     onlara DOKUNMAZ); admin Mesajlar/Teklifler ekranları çalışmaya devam.
--   • RLS zaten ENABLE (mig 015/022); bu migration RLS durumunu değiştirmez,
--     yalnız iki INSERT policy'sini düşürür.
--   • Her iki tabloda da admin INSERT akışı YOK → authenticated insert
--     kaybı kimseyi etkilemez.
--
-- ÖZELLİKLER: idempotent (DROP ... IF EXISTS) · transaction-safe.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "contact_messages_public_insert"
  ON public.contact_messages;

DROP POLICY IF EXISTS "offer_requests_anon_insert"
  ON public.offer_requests;

COMMIT;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA (uygulamadan sonra çalıştır)
-- ----------------------------------------------------------------------------
-- 1) Policy'ler gitti mi? (boş dönmeli)
--
--   SELECT polname, tablename
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND polname IN ('contact_messages_public_insert',
--                     'offer_requests_anon_insert');
--
-- 2) RLS hâlâ açık + admin policy'leri yerinde mi?
--
--   SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('contact_messages', 'offer_requests')
--   ORDER BY tablename, policyname;
--   → contact_messages: authenticated select/update/delete kalmalı
--   → offer_requests:   authenticated all (offer_requests_auth_all) kalmalı
--
-- 3) Smoke (anon key ile ham REST insert artık 401/403/RLS-violation vermeli;
--    server route'lar 200 dönmeli).


-- ----------------------------------------------------------------------------
-- ROLLBACK (gerekirse — policy'leri orijinal tanımlarıyla geri ekler)
-- ----------------------------------------------------------------------------
--   BEGIN;
--
--     -- migration 015 orijinali:
--     CREATE POLICY "contact_messages_public_insert"
--       ON public.contact_messages
--       FOR INSERT
--       TO anon, authenticated
--       WITH CHECK (true);
--
--     -- migration 022 orijinali:
--     CREATE POLICY "offer_requests_anon_insert"
--       ON public.offer_requests
--       FOR INSERT
--       TO anon
--       WITH CHECK (true);
--
--   COMMIT;
-- ============================================================================
