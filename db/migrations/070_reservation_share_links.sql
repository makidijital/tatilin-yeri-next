-- ============================================================================
-- Migration 070 — RESERVATION SHARE LINKS (admin-only RLS + resolve RPC)
-- ============================================================================
-- AMAÇ:
--   Admin panelden bir rezervasyon için süreli/iptal-edilebilir "güvenli
--   paylaşım linki" üretimi. Müşteri linke tıklayınca (/rezervasyon-kontrol
--   ?token=...) rezervasyonunun ONAY + ödeme özetini görür — kod+e-posta
--   girmeden. Mevcut `reservation_no + e-posta` sorgulama akışı AYNEN kalır;
--   bu tamamen ADDITIVE ikinci erişim kanalıdır.
--
--   Tablo `villa_zip_links` (043) / `shared_villa_lists` (035) desenini izler:
--   token + expires_at + revoked_at + lazy 404 + admin-only RLS + SECURITY
--   DEFINER resolve RPC. FARK: raw token DEĞİL, `token_hash` (sha256)
--   saklanır (refresh-token deseni; DB sızması linkleri açığa çıkarmaz).
--
--   EXPIRATION: caller `expires_at`'i rezervasyonun `end_date + 3 gün`
--   olarak set eder (uydurma sabit süre yok; rezervasyon semantiğinden
--   türer). Mekanizma villa_zip_links ile aynı (`expires_at > now()` filtre).
--
--   MULTI-USE: villa_zip'in tek-kullanım consume/counter'ından FARKLI —
--   müşteri linki defalarca açabilmeli → RPC sadece OKUR (counter yok).
--
-- ERİŞİM MODELİ:
--   • Tablo admin-only RLS (043 deseni): yalnız aktif admin + service_role.
--   • Public resolve route/action (server, service_role) `resolve_reservation
--     _share_token` RPC'sini çağırır: token_hash doğrula (revoked/expired
--     hariç) → reservation_id döndür; aksi → null. SECURITY DEFINER → RLS
--     bypass, yalnız bu kontrollü yüzeyden. `reservations` tablosuna DOKUNMAZ.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- FORCE RLS / restrictive YOK → service_role bypass korunur.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) GUARD garanti (idempotent) — is_active_admin() (043'te tanımlı; tekrar).
-- ----------------------------------------------------------------------------
create index if not exists idx_admin_users_auth_user_id
  on public.admin_users (auth_user_id);

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.auth_user_id = auth.uid() and au.is_active = true
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 1) TABLO (idempotent)
-- ----------------------------------------------------------------------------
create table if not exists public.reservation_share_links (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  token_hash     text not null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid       -- admin_users.id (nullable; FK YOK — soft ref)
);

-- token_hash unique + O(1) lookup (raw token DB'de tutulmaz)
create unique index if not exists reservation_share_links_token_hash_idx
  on public.reservation_share_links (token_hash);
-- Admin listeleme / aktif link bulma: rezervasyon bazlı, yeni→eski
create index if not exists reservation_share_links_res_created_idx
  on public.reservation_share_links (reservation_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 2) RLS — admin-only (043 deseni: keşfet → temizle → verify → canonical → verify)
-- ----------------------------------------------------------------------------
do $rls$
declare
  t         text := 'reservation_share_links';
  pol       record;
  v_canon   text := 'reservation_share_links_admin_only';
  v_stray   int;
  v_final   int;
  v_dropped int := 0;
begin
  execute format('alter table public.%I enable row level security;', t);

  for pol in
    select policyname from pg_policies
    where schemaname='public' and tablename=t and policyname <> v_canon
  loop
    execute format('drop policy %I on public.%I;', pol.policyname, t);
    v_dropped := v_dropped + 1;
    raise notice 'CLEANUP [%]: legacy policy "%" DROP edildi', t, pol.policyname;
  end loop;

  execute format('drop policy if exists %I on public.%I;', v_canon, t);

  select count(*) into v_stray from pg_policies
  where schemaname='public' and tablename=t;
  if v_stray <> 0 then
    raise exception 'RLS DRIFT [%]: cleanup sonrası % policy (beklenen 0). Abort.', t, v_stray;
  end if;

  execute format($f$
    create policy %I on public.%I
      as permissive for all to authenticated
      using (public.is_active_admin())
      with check (public.is_active_admin());
  $f$, v_canon, t);

  select count(*) into v_final from pg_policies
  where schemaname='public' and tablename=t;
  if v_final <> 1 then
    raise exception 'RLS VERIFY [%]: beklenen 1 policy, bulunan %. Abort.', t, v_final;
  end if;

  raise notice 'OK [%]: RLS açık, % legacy temizlendi, canonical "%" kuruldu',
    t, v_dropped, v_canon;
end
$rls$;


-- ----------------------------------------------------------------------------
-- 3) RESOLVE RPC — token_hash doğrula → reservation_id döndür (MULTI-USE, OKUR)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER: tablo admin-only RLS olsa da bu RPC tek satırı token_hash
-- ile OKUR. Yalnız geçerli (revoked değil + süresi dolmamış) token için
-- reservation_id döner; aksi → null. Counter YOK (link çok-kullanımlık →
-- müşteri defalarca açabilir). Public resolve route (service_role) çağırır.
-- Listeleme/enumerate YOK.
create or replace function public.resolve_reservation_share_token(p_token_hash text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select reservation_id
    from public.reservation_share_links
   where token_hash = p_token_hash
     and revoked_at is null
     and expires_at > now()
   limit 1;
$$;

revoke all on function public.resolve_reservation_share_token(text) from public;
-- Yalnız server-side service_role tetikler (token-resolve public yüzeyden değil).
grant execute on function public.resolve_reservation_share_token(text) to service_role;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA / ROLLBACK
-- ----------------------------------------------------------------------------
-- select public.resolve_reservation_share_token('<sha256_hash>');  -- reservation_id | null
-- ROLLBACK:
--   drop function if exists public.resolve_reservation_share_token(text);
--   drop policy if exists reservation_share_links_admin_only on public.reservation_share_links;
--   drop table if exists public.reservation_share_links;
-- ============================================================================
