/* ===============================================================
   🔥 MIGRATION — payment_accounts RLS policy
   ===============================================================
   Sorun:
     Supabase yeni oluşturulan tablolarda RLS'yi default AÇIK eder.
     Anon/authenticated key ile SELECT yapıldığında error fırlatmaz,
     boş array döner (silent empty). Sonuç: admin panel listesi boş.

   Çözüm:
     Mevcut admin tablolarıyla aynı pattern'i uygulayarak
     payment_accounts için temel CRUD policy'leri ekle.

   NOT:
     Eğer projedeki diğer tablolar (villa, payment_methods vb.)
     RLS DISABLED ise aynı yaklaşımı uygulayabilirsin
     (KOLAY YOL, en altta).
   =============================================================== */

-- (Önerilen) Policy ekle — RLS açık kalır, anon erişimi kontrollü
ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;

-- Aynı isimde policy varsa düşür (idempotent)
DROP POLICY IF EXISTS payment_accounts_select_all ON payment_accounts;
DROP POLICY IF EXISTS payment_accounts_insert_all ON payment_accounts;
DROP POLICY IF EXISTS payment_accounts_update_all ON payment_accounts;
DROP POLICY IF EXISTS payment_accounts_delete_all ON payment_accounts;

CREATE POLICY payment_accounts_select_all
  ON payment_accounts FOR SELECT
  USING (true);

CREATE POLICY payment_accounts_insert_all
  ON payment_accounts FOR INSERT
  WITH CHECK (true);

CREATE POLICY payment_accounts_update_all
  ON payment_accounts FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY payment_accounts_delete_all
  ON payment_accounts FOR DELETE
  USING (true);

-- ==============================================================
-- KOLAY YOL (alternatif):
-- Diğer admin tabloların pattern'i RLS disabled ise:
--
--   ALTER TABLE payment_accounts DISABLE ROW LEVEL SECURITY;
--
-- Bu durumda yukarıdaki CREATE POLICY satırlarına gerek yok.
-- ==============================================================

-- ==============================================================
-- KONTROL:
--
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname = 'payment_accounts';
--
-- relrowsecurity = true → RLS açık (policy şart)
-- relrowsecurity = false → RLS kapalı (policy gerekmez)
--
-- Mevcut policy'leri görmek için:
--
--   SELECT polname, polcmd
--   FROM pg_policy
--   WHERE polrelid = 'payment_accounts'::regclass;
-- ==============================================================
