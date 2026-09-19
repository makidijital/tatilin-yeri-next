-- ============================================================================
-- Migration 044 — PROPERTY OWNERS (mülk sahipleri) — MİNİMAL
-- ============================================================================
-- AMAÇ:
--   "Bu villa kimin?" — basit mülk sahibi kaydı + villa bağlantısı.
--   CRM/muhasebe/hakediş/owner-login YOK. Yalnız: ad/soyad/telefon/mail/iban.
--
-- KAPSAM:
--   • property_owners tablosu (PII: phone/email/iban) → ADMIN-ONLY RLS
--     (038 deseni). anon/public ASLA okuyamaz.
--   • villa.owner_id nullable FK → on delete SET NULL (owner silinince villa
--     silinmez, yalnız bağlantı kopar). villa RLS DEĞİŞMEZ (037 public-read;
--     owner_id sadece UUID — PII değil, public select'te zararsız).
--   • sidebar permission backfill ("property_owners") — 013 deseni, idempotent.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- FORCE RLS / restrictive YOK → service_role bypass korunur.
-- DOKUNULMAYAN: villa/reservation/cache/SEO/security; villa RLS policy'leri.
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
create table if not exists public.property_owners (
  id          uuid primary key default gen_random_uuid(),
  first_name  text,
  last_name   text,
  phone       text,
  email       text,
  iban        text,
  created_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2) VILLA BAĞLANTISI — owner_id nullable FK (on delete SET NULL)
-- ----------------------------------------------------------------------------
alter table public.villa
  add column if not exists owner_id uuid;

-- FK constraint idempotent (yoksa ekle)
do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'villa_owner_id_fkey'
  ) then
    alter table public.villa
      add constraint villa_owner_id_fkey
      foreign key (owner_id)
      references public.property_owners (id)
      on delete set null;
  end if;
end
$fk$;

-- "Villa Sayısı" sayımı + join için index
create index if not exists idx_villa_owner_id
  on public.villa (owner_id);


-- ----------------------------------------------------------------------------
-- 3) RLS — property_owners admin-only (038 deseni: keşfet→temizle→verify→canonical→verify)
-- ----------------------------------------------------------------------------
do $rls$
declare
  t         text := 'property_owners';
  pol       record;
  v_canon   text := 'property_owners_admin_only';
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
-- 4) SIDEBAR PERMISSION BACKFILL — "property_owners" (013 deseni, idempotent)
-- ----------------------------------------------------------------------------
update public.admin_users
set sidebar_permissions =
  case
    when sidebar_permissions @> '["property_owners"]'::jsonb
      then sidebar_permissions
    else coalesce(sidebar_permissions, '[]'::jsonb) || '["property_owners"]'::jsonb
  end
where sidebar_permissions is null
   or not (sidebar_permissions @> '["property_owners"]'::jsonb);


-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.villa drop constraint if exists villa_owner_id_fkey;
-- alter table public.villa drop column if exists owner_id;
-- drop policy if exists property_owners_admin_only on public.property_owners;
-- drop table if exists public.property_owners;
-- -- (permission backfill geri alma opsiyonel; zararsız bırakılabilir)
-- ============================================================================
