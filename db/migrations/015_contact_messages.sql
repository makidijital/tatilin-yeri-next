-- ===============================================================
-- 🛡️ Migration 015 — contact_messages (iletişim form inbox)
-- ===============================================================
-- AMAÇ:
--   /iletisim public formundan gelen mesajları saklayan inbox.
--   Admin /maki-admin/messages üzerinden mesajları görür/yönetir.
--   Yeni reservation/availability/pricing'e DOKUNULMUYOR — bu
--   tablo izole bir CRM-lite katmanı.
--
-- RLS POLİTİKASI:
--   anon                → SADECE INSERT (form submit)
--   authenticated       → SELECT / UPDATE / DELETE tam erişim
--                         (admin Supabase Auth ile authenticate'lı;
--                          lib/admin-auth.ts > lookupCurrentAdmin
--                          auth.getUser() kullanıyor → JWT
--                          'authenticated' role'üyle gelir)
--
-- IDEMPOTENT: tablo / index / policy hepsi IF NOT EXISTS veya
--   DROP IF EXISTS + CREATE; N kere koşulabilir.
-- ===============================================================

-- 1) TABLO
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  full_name   TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  message     TEXT NOT NULL,

  is_read     BOOLEAN NOT NULL DEFAULT FALSE,

  replied_at  TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  /* "iletisim" / "kiralik-villa/<slug>" gibi referrer ipucu */
  source_page TEXT
);

-- 2) INDEX'LER
CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON contact_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_unread_idx
  ON contact_messages (is_read);

-- 3) ROW LEVEL SECURITY
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- 3a) anon + authenticated INSERT — public form submit
DROP POLICY IF EXISTS "contact_messages_public_insert" ON contact_messages;
CREATE POLICY "contact_messages_public_insert"
  ON contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3b) authenticated SELECT — admin inbox listele
DROP POLICY IF EXISTS "contact_messages_authenticated_select" ON contact_messages;
CREATE POLICY "contact_messages_authenticated_select"
  ON contact_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- 3c) authenticated UPDATE — read toggle / archive
DROP POLICY IF EXISTS "contact_messages_authenticated_update" ON contact_messages;
CREATE POLICY "contact_messages_authenticated_update"
  ON contact_messages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3d) authenticated DELETE — kalıcı silme (admin action)
DROP POLICY IF EXISTS "contact_messages_authenticated_delete" ON contact_messages;
CREATE POLICY "contact_messages_authenticated_delete"
  ON contact_messages
  FOR DELETE
  TO authenticated
  USING (true);
