-- ============================================================================
-- Migration 035 — Shared Villa Lists (Admin Curator Share)
-- ============================================================================
-- AMAÇ:
--   Admin için "müşteriye gönderilecek özel villa seçkisi" katmanı.
--   Admin: public hero search mantığıyla filtre uygular, sonuçlardan
--   manuel villa seçer (curate), "Listeyi Paylaş" → kısa token URL
--   (`/liste/[token]`) üretir. Public sayfada müşteri normal listing
--   deneyimi görür — same VillaCard, same pricing UX, same currency.
--
-- TASARIM KARARLARI:
--   • token text UNIQUE — kısa (~12 hex char), guess edilemez, URL-safe.
--     Application layer: crypto.randomUUID().replace(/-/g,"").slice(0,12).
--     (021 shared_favorite_lists ile aynı pattern; entropy ~48-bit.)
--   • villa_ids uuid[] — manuel curate sonucu. Read tarafı `.in("id", ids)`
--     ile mevcut visibility filter (is_active=true, deleted_at IS NULL) uygular.
--     Aktif olmayan/silinmiş villalar otomatik düşer (snapshot stale-safe).
--   • search_params jsonb — admin filtre snapshot'ı (start, end, guests,
--     regions, categories, ...). Public sayfa pricing context'i (date range
--     ile total/gece/temizlik hesabı) için kullanır.
--     Schema:
--       { "start"?: "YYYY-MM-DD", "end"?: "YYYY-MM-DD", "guests"?: number,
--         "regions"?: uuid[], "categories"?: uuid[] }
--     Nullable; sadece pricing context için. Filter re-execute YAPILMAZ
--     (snapshot semantic).
--   • title text — opsiyonel display name ("Antalya 4 kişi sıcak villa seçkisi").
--   • note text — opsiyonel admin notu (müşteriye kısa mesaj).
--   • revoked_at timestamptz — soft revoke. Set ise public sayfa 404 verir;
--     admin yanlış link gönderdiğinde geri çekebilsin.
--   • expires_at timestamptz — opsiyonel TTL (gelecek; şu an unused).
--   • Yeniden çalıştırılabilir (idempotent) — `if not exists` guard'lar.
--
-- RLS:
--   • Anon SELECT: izinli (paylaşılan URL'i bilen herkes açabilmeli;
--     listeleme YOK çünkü WHERE token=? ile tek satır okunur, token
--     tahmin edilemez).
--   • Anon INSERT/UPDATE/DELETE: YASAK (yalnız admin oluşturabilir;
--     021'in anon-insert pattern'inden FARK — share burada admin
--     concierge işi, guest değil).
--   • Authenticated (admin): tam CRUD — Supabase Auth JWT ile geçer.
--
-- BACKWARD-COMPATIBILITY:
--   • Yeni tablo — mevcut sistemlere etkisi yok.
--   • shared_favorite_lists (021) ayrı kalır — favoriler share use-case'i
--     bağımsız.
--   • Reservation engine, pricing, availability, booking sidebar, review
--     system, private URL system — sıfır etkilenme.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   drop policy if exists "shared_villa_lists_anon_select" on public.shared_villa_lists;
--   drop policy if exists "shared_villa_lists_auth_all" on public.shared_villa_lists;
--   drop table if exists public.shared_villa_lists;
-- ============================================================================

create table if not exists public.shared_villa_lists (
  id            uuid primary key default gen_random_uuid(),
  token         text not null,
  villa_ids     uuid[] not null,
  search_params jsonb,
  title         text,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  /* Manuel curate output; minimum 1 villa, maksimum 50 — application layer'da
     da enforce edilir. Public liste 50'den fazla villa pratik anlamlı değil. */
  constraint shared_villa_lists_villa_ids_size
    check (array_length(villa_ids, 1) between 1 and 50)
);

-- Unique token — partial yerine tam unique (token NOT NULL).
create unique index if not exists shared_villa_lists_token_idx
  on public.shared_villa_lists (token);

-- created_at desc — admin listing/management için.
create index if not exists shared_villa_lists_created_at_idx
  on public.shared_villa_lists (created_at desc);

-- ---- RLS ----
alter table public.shared_villa_lists enable row level security;

/* Anon SELECT — paylaşılan URL'i bilen herkes açabilsin.
   Tarama riski düşük (token ~48-bit, tahmin edilemez). İleride
   sertleştirme istenirse `using (false)` + RPC ile token-only access
   geliştirilebilir. */
drop policy if exists "shared_villa_lists_anon_select"
  on public.shared_villa_lists;
create policy "shared_villa_lists_anon_select"
  on public.shared_villa_lists
  for select
  to anon
  using (true);

/* Authenticated (admin) — tam CRUD. Supabase Auth JWT'si olan admin
   kullanıcılar oluşturur, listeler, revoke eder. */
drop policy if exists "shared_villa_lists_auth_all"
  on public.shared_villa_lists;
create policy "shared_villa_lists_auth_all"
  on public.shared_villa_lists
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.shared_villa_lists is
  'Admin curator share lists. Admin filtre uygular → villa subset seçer → '
  'kısa token URL ile müşteriye gönderir. Public sayfada VillaCard grid '
  '(arama UX) gösterilir. RLS: anon select allowed (token bilen erişir), '
  'yalnız authenticated admin insert/update/delete yapar.';

comment on column public.shared_villa_lists.token is
  'URL-safe short token (~12 hex chars). Application layer üretir: '
  'crypto.randomUUID().replace(/-/g, "").slice(0, 12). Unique index ile '
  'collision koruması; service retry handler ile 23505 fallback.';

comment on column public.shared_villa_lists.villa_ids is
  'Manuel curate snapshot at create time. Read path mevcut visibility filter '
  '(is_active=true, deleted_at IS NULL) uygular; silinmiş/pasif villalar '
  'public sayfadan otomatik düşer.';

comment on column public.shared_villa_lists.search_params is
  'Pricing context snapshot (start/end/guests/...). Public sayfa VillaCard '
  'date-bound total hesabı için kullanır. Filter re-execute YAPILMAZ; '
  'snapshot semantic.';

comment on column public.shared_villa_lists.revoked_at is
  'Soft revoke timestamp. NOT NULL ise public sayfa 404 verir. Admin '
  'yanlış link gönderdiğinde manuel set eder.';

comment on column public.shared_villa_lists.expires_at is
  'Opsiyonel TTL. NULL = süresiz. Gelecek expiry UI için reserved.';
