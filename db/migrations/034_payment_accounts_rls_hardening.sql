-- ============================================================================
-- Migration 034 — payment_accounts RLS HARDENING
-- ============================================================================
-- AMAÇ:
--   Mevcut overly-permissive `USING (true)` policy'lerini kaldırıp gerçek
--   role-based access control uygulamak. Önceki migration
--   (migrations/2026_05_payment_accounts_rls.sql) 4 policy'i
--   `USING (true)` ile oluşturmuştu → ANON kullanıcı SELECT/INSERT/UPDATE/
--   DELETE yapabilir durumdaydı (banka hesap bilgileri public web'den
--   modifiye edilebilir). Bu KRİTİK güvenlik açığını kapatır.
--
-- ROL-BASED ACCESS MATRIX (post-migration):
--
--   role            | SELECT | INSERT | UPDATE | DELETE
--   ────────────────┼────────┼────────┼────────┼────────
--   anon            |   ❌   |   ❌   |   ❌   |   ❌
--   authenticated   |   ✅¹  |   ✅¹  |   ✅¹  |   ✅¹
--   service_role    |   ✅²  |   ✅²  |   ✅²  |   ✅²
--
--   ¹  Yalnız active admin_users üyesi (admin_users guard policy)
--   ²  Service role RLS bypass eder (Supabase default davranış)
--
-- BACKWARD-COMPAT:
--   • Admin paneli payment-account.service.ts üzerinden CRUD yapar.
--     Service anon `supabase` client'ını kullanır AMA admin login
--     sonrası bu client'a Supabase Auth session set edilir →
--     istek `authenticated` role + admin user JWT ile gider →
--     yeni policy match olur → erişim verilir. ZERO CALLER DEĞİŞİMİ.
--
--   • Server-side `getActivePaymentAccount` helper'ı bank-transfer mail
--     akışında çağrılıyordu (lib/payment-account.helper.ts via anon
--     client). Anon role artık SELECT yapamayacak → helper migration
--     SONRASI SIFIR satır döndürür → mail "Aktif hesap bulunamadı"
--     hatasıyla bozulur. ÇÖZÜM: helper'ın bu fonksiyonu yeni
--     server-only dosyaya (lib/payment-account.server.ts) taşındı,
--     service role client kullanıyor → RLS bypass.
--
--   • Pure utility'ler (formatIban, paymentAccountDisplay) + tip'ler
--     helper'da kaldı, hiç DB query etmiyor → client bundle güvenli.
--
-- IDEMPOTENT:
--   • Tüm DROP POLICY IF EXISTS guard'lı.
--   • CREATE POLICY önce DROP edilen aynı isimde oluşturulur.
--   • Yeniden çalıştırılabilir (örn. test/staging/prod aynı script).
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   alter table public.payment_accounts disable row level security;
--   drop policy if exists payment_accounts_authenticated_admin_all on public.payment_accounts;
--   -- (geri açmak isterseniz eski overly-permissive policy'leri restore edebilirsiniz
--   --  ama production'da TAVSİYE EDİLMEZ — güvenlik geriye atılmış olur.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Eski overly-permissive policy'leri tamamen kaldır
-- ---------------------------------------------------------------------------
drop policy if exists payment_accounts_select_all on public.payment_accounts;
drop policy if exists payment_accounts_insert_all on public.payment_accounts;
drop policy if exists payment_accounts_update_all on public.payment_accounts;
drop policy if exists payment_accounts_delete_all on public.payment_accounts;

-- ---------------------------------------------------------------------------
-- 2) RLS açık olduğundan emin ol (idempotent — zaten açıksa noop)
-- ---------------------------------------------------------------------------
alter table public.payment_accounts enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Anon erişim için POLICY YOK
-- ---------------------------------------------------------------------------
-- Postgres RLS davranışı: tablo RLS açık + role için policy YOK →
-- istek REDDEDILIR (zero rows return for SELECT, error for write).
-- Anon kullanıcı `payment_accounts` üzerinde HİÇBİR operasyon yapamaz.
-- "no policy = deny by default" en güvenli pattern.

-- ---------------------------------------------------------------------------
-- 4) Authenticated rol için admin_users guard'lı ALL policy
-- ---------------------------------------------------------------------------
-- Sadece active admin_users (auth_user_id = auth.uid()) erişebilir.
-- Bu kombo:
--   • Public site kullanıcısı (eğer Supabase Auth login olursa) → admin
--     değilse policy match etmez → erişim YOK.
--   • Admin user login (Supabase Auth + admin_users.is_active=true) →
--     policy match → tam CRUD erişim.
--   • `FOR ALL` tek policy ile SELECT/INSERT/UPDATE/DELETE kapsar.
--   • `WITH CHECK` koşulu INSERT/UPDATE'te de aynı guard'ı uygular —
--     normal user insert deneyemesin.
create policy payment_accounts_authenticated_admin_all
  on public.payment_accounts
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.auth_user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.auth_user_id = auth.uid()
        and au.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Service role policy GEREKMEZ
-- ---------------------------------------------------------------------------
-- Supabase service_role JWT'si RLS'i otomatik BYPASS eder (Postgres
-- BYPASSRLS attribute'una sahip). Server-side helper'lar
-- (lib/payment-account.server.ts > getActivePaymentAccount) bu role'ü
-- kullanır → policy'lerden bağımsız tam erişim.
--
-- Bu nedenle service_role için explicit policy yazılmasına gerek yok.
-- Açık explicit policy SECURITY KEY rotation/audit'i kolaylaştırır ama
-- standart Supabase setup'ında ekstra koruma sağlamaz.

-- ---------------------------------------------------------------------------
-- KONTROL SQL'LERİ (manuel doğrulama için, çalıştırma)
-- ---------------------------------------------------------------------------
-- -- RLS açık mı?
-- SELECT relname, relrowsecurity, relforcerowsecurity
-- FROM pg_class
-- WHERE relname = 'payment_accounts';
--
-- -- Aktif policy'ler:
-- SELECT polname, polcmd, polroles, polqual, polwithcheck
-- FROM pg_policy
-- WHERE polrelid = 'public.payment_accounts'::regclass;
--
-- -- Beklenen sonuç: sadece "payment_accounts_authenticated_admin_all"
-- -- policy'sini görürüz; eski *_all policy'leri silinmiş olmalı.
--
-- -- Anon erişim testi (Supabase REST anon key ile):
-- -- curl -X GET '<SUPABASE_URL>/rest/v1/payment_accounts' \
-- --   -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
-- -- → boş array [] dönmeli (RLS satırları reddediyor).
-- ---------------------------------------------------------------------------
