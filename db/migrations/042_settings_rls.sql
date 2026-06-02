-- ============================================================================
-- Migration 042 — RLS PHASE 4: settings (ADMIN-ONLY) + SECRET LOCKDOWN
-- ============================================================================
-- ⚠️⚠️ DEPLOY SIRASI — BU MIGRATION EN SON UYGULANIR ⚠️⚠️
--   ÖNKOŞUL (hepsi PRODUCTION'da canlı + doğrulanmış olmalı):
--     1) Migration 041 (get_public_settings RPC) deploy edildi.
--     2) Mail env-first + RESEND_API_KEY env set (getMailConfig env'den çalışır).
--     3) APP refactor deploy edildi:
--        • Public CLIENT (TopBar/ReservationForm/useBookingEngine) →
--          getPublicSettings → get_public_settings RPC.
--        • Public SERVER (getCachedSettings + Footer/HeaderWrapper/
--          kiralik-villa[slug]/v[token]) → getPublicSettings (RPC).
--        • getSettings (FULL, select *) yalnız: mail getMailConfig (env-first,
--          RLS sonrası null döner → env) + authenticated admin settings edit.
--   Bu önkoşullar OLMADAN uygulanırsa: public site settings okuyamaz (boşalır),
--   mail config DB okuması null döner (env yoksa mail durur). SIRA KRİTİK.
--
-- HEDEF:
--   settings tablosu → anon ERİŞEMEZ (SELECT/INSERT/UPDATE/DELETE yok),
--   normal authenticated ERİŞEMEZ, yalnız AKTİF ADMIN erişir. service_role
--   bypass (mail/server). Public güvenli kolonları YALNIZ get_public_settings
--   RPC'sinden (SECURITY DEFINER) okur → resend_api_key anon'a ASLA gitmez,
--   ne REST ne uygulama üzerinden.
--
-- AKIŞ (038/040 ile birebir): RLS enable → pg_policies keşfet → canonical-dışı
--   sil → cleanup verify (stray=0 değilse EXCEPTION) → canonical create →
--   final verify (tam 1 canonical) → NOTICE log.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- FORCE ROW LEVEL SECURITY YOK · restrictive policy YOK → service_role bypass korunur.
-- is_active_admin() (SECURITY DEFINER + pinned search_path) guard → recursion yok.
--
-- CANONICAL: settings_admin_only
--   FOR ALL TO authenticated USING/ WITH CHECK (public.is_active_admin())
--
-- ⚠️ TEK transaction içinde çalıştır.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) GUARD FONKSİYONU garanti (idempotent — 037/038/040 zaten kurmuş olabilir)
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
    select 1
    from public.admin_users au
    where au.auth_user_id = auth.uid()
      and au.is_active = true
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 1) KEŞFET → TEMİZLE → DOĞRULA → CANONICAL → DOĞRULA
-- ----------------------------------------------------------------------------
do $rls$
declare
  t          text := 'settings';
  pol        record;
  v_canon    text := 'settings_admin_only';
  v_stray    int;
  v_final    int;
  v_dropped  int := 0;
begin
  if to_regclass('public.' || t) is null then
    raise exception 'FATAL: public.% tablosu yok — beklenmiyor. Abort.', t;
  end if;

  -- RLS enable (idempotent)
  execute format('alter table public.%I enable row level security;', t);

  -- KEŞFET + TEMİZLE: canonical DIŞINDAKİ TÜM policy'leri sil (dashboard /
  -- eski migration / permissive / restrictive — hepsi). Tek bir legacy
  -- "allow all" bile OR ile secret'i açar → kritik.
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = t
      and policyname <> v_canon
  loop
    execute format('drop policy %I on public.%I;', pol.policyname, t);
    v_dropped := v_dropped + 1;
    raise notice 'CLEANUP [%]: legacy policy "%" DROP edildi', t, pol.policyname;
  end loop;

  if v_dropped = 0 then
    raise notice 'CLEANUP [%]: temizlenecek legacy policy yok', t;
  end if;

  -- Canonical'i de drop et (eski aynı-isimli farklı tanım riskini ele)
  execute format('drop policy if exists %I on public.%I;', v_canon, t);

  -- CLEANUP DOĞRULAMASI: stray = 0
  select count(*) into v_stray
  from pg_policies
  where schemaname = 'public' and tablename = t;

  if v_stray <> 0 then
    raise exception
      'RLS DRIFT [%]: cleanup sonrası % policy hâlâ duruyor (beklenen 0). Abort.',
      t, v_stray;
  end if;

  -- CANONICAL: yalnız aktif admin (FOR ALL). anon için POLICY YOK → deny.
  execute format($f$
    create policy %I on public.%I
      as permissive
      for all
      to authenticated
      using (public.is_active_admin())
      with check (public.is_active_admin());
  $f$, v_canon, t);

  -- FINAL DOĞRULAMA: tam 1 policy, o da canonical
  select count(*) into v_final
  from pg_policies
  where schemaname = 'public' and tablename = t;

  if v_final <> 1 then
    raise exception
      'RLS VERIFY [%]: beklenen 1 policy, bulunan %. Abort.', t, v_final;
  end if;

  perform 1
  from pg_policies
  where schemaname = 'public' and tablename = t
    and policyname <> v_canon;
  if found then
    raise exception
      'RLS VERIFY [%]: canonical-dışı policy tespit edildi. Abort.', t;
  end if;

  raise notice 'OK [%]: RLS açık, % legacy temizlendi, canonical "%" kuruldu',
    t, v_dropped, v_canon;
end
$rls$;


-- ----------------------------------------------------------------------------
-- 2) FINAL STATE LOG
-- ----------------------------------------------------------------------------
do $log$
declare
  pol   record;
  v_rls boolean;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'settings';

  raise notice '════════ FINAL POLICY STATE — settings (RLS enabled=%) ════════', v_rls;
  for pol in
    select policyname, cmd, permissive, roles
    from pg_policies
    where schemaname = 'public' and tablename = 'settings'
    order by policyname
  loop
    raise notice '    • % | cmd=% | % | roles=%',
      pol.policyname, pol.cmd, pol.permissive, pol.roles;
  end loop;
  raise notice '═══════════════════════════════════════════════════════════════';
end
$log$;


-- ----------------------------------------------------------------------------
-- 3) MANUEL DOĞRULAMA (deploy sonrası)
-- ----------------------------------------------------------------------------
-- -- anon SELECT reddediliyor mu? (boş/err — ÖNCEDEN resend_api_key dönüyordu)
-- --   curl '<URL>/rest/v1/settings?select=resend_api_key' \
-- --     -H "apikey:<ANON>" -H "Authorization: Bearer <ANON>"   → []/error
-- -- public settings RPC çalışıyor mu? (anon)
-- --   curl -X POST '<URL>/rest/v1/rpc/get_public_settings' \
-- --     -H "apikey:<ANON>" -H "Authorization: Bearer <ANON>"   → jsonb (secret YOK)
--
-- ROLLBACK:
-- do $rollback$
-- begin
--   drop policy if exists settings_admin_only on public.settings;
--   alter table public.settings disable row level security;
-- end $rollback$;
-- ============================================================================
