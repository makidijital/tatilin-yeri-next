-- ============================================================================
-- Migration 043 — VILLA ZIP DOWNLOAD LINKS (admin-only RLS + consume RPC)
-- ============================================================================
-- AMAÇ:
--   Admin panelden bir villa için süreli/iptal-edilebilir "ZIP indirme
--   linki" üretimi. Link sahibi villanın TÜM görsellerini tek ZIP olarak
--   (runtime stream; FİZİKSEL ZIP YOK) indirir.
--
--   Tablo `shared_villa_lists` (035) desenini izler: token + expires_at +
--   revoked_at + lazy 404. Görseller zaten public bucket'ta; token gizli
--   veriyi değil KONTROLLÜ/SAYILAN/İPTAL-EDİLEBİLİR bulk indirme kanalını
--   korur.
--
-- ERİŞİM MODELİ:
--   • Tablo admin-only RLS (038 deseni): anon/normal-authenticated ERİŞEMEZ;
--     yalnız aktif admin (create/revoke/list) + service_role.
--   • Public download route (server, service_role) `consume_villa_zip_token`
--     RPC'sini çağırır: token doğrula (revoked/expired hariç) + atomik
--     download_count++ + villa_id döndür. SECURITY DEFINER → tablo RLS'i
--     bypass, yalnız bu kontrollü yüzeyden okunur.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- FORCE RLS / restrictive YOK → service_role bypass korunur.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) GUARD garanti (idempotent)
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
create table if not exists public.villa_zip_links (
  id             uuid primary key default gen_random_uuid(),
  villa_id       uuid not null references public.villa (id) on delete cascade,
  token          text not null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  download_count integer not null default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid       -- admin_users.id (nullable; FK YOK — soft ref)
);

-- Token unique + O(1) lookup
create unique index if not exists villa_zip_links_token_idx
  on public.villa_zip_links (token);
-- Admin listeleme: villa bazlı, yeni→eski
create index if not exists villa_zip_links_villa_created_idx
  on public.villa_zip_links (villa_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 2) RLS — admin-only (038 deseni: keşfet → temizle → verify → canonical → verify)
-- ----------------------------------------------------------------------------
do $rls$
declare
  t         text := 'villa_zip_links';
  pol       record;
  v_canon   text := 'villa_zip_links_admin_only';
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
-- 3) CONSUME RPC — token doğrula + atomik download_count++ + villa_id döndür
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER: tablo admin-only RLS olsa da bu RPC tek satırı
-- token ile okur/günceller. Yalnız geçerli (revoked değil + süresi dolmamış)
-- token için download_count'u atomik artırır ve villa_id döner; aksi → null.
-- Download route (service_role) bunu çağırır. Listeleme/enumerate YOK.
create or replace function public.consume_villa_zip_token(p_token text)
returns uuid
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  update public.villa_zip_links
     set download_count = download_count + 1
   where token = p_token
     and revoked_at is null
     and expires_at > now()
  returning villa_id;
$$;

revoke all on function public.consume_villa_zip_token(text) from public;
-- Download route service_role kullanır; anon/authenticated'a execute VERİLMEZ
-- (token-consume yalnız server-side service_role yüzeyinden tetiklenir).
grant execute on function public.consume_villa_zip_token(text) to service_role;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA / ROLLBACK
-- ----------------------------------------------------------------------------
-- select public.consume_villa_zip_token('<token>');  -- villa_id veya null
-- ROLLBACK:
--   drop function if exists public.consume_villa_zip_token(text);
--   drop policy if exists villa_zip_links_admin_only on public.villa_zip_links;
--   drop table if exists public.villa_zip_links;
-- ============================================================================
