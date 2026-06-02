-- ============================================================================
-- Migration 040 — RLS PHASE 3: reservations + manual_reservations (ADMIN-ONLY)
-- ============================================================================
-- ⚠️⚠️ DEPLOY SIRASI — BU MIGRATION EN SON UYGULANIR ⚠️⚠️
--   ÖNKOŞUL (hepsi PRODUCTION'da canlı + doğrulanmış olmalı):
--     1) Migration 039 (availability RPC'leri) deploy edildi.
--     2) APP refactor deploy edildi:
--        • Availability OKUMA → RPC (getBlockedVillaIds, useBookingEngine,
--          fetchVillaAvailability) — artık anon SELECT YOK.
--        • Public rezervasyon CREATE → server (service_role) route/action —
--          artık client-side anon INSERT YOK.
--        • Server-side ANON okumalar → service_role (mail route'ları, voucher,
--          dashboard/analytics/operations/finance) — Group B.
--   Bu migration BU ÖNKOŞULLAR OLMADAN uygulanırsa: availability boşalır,
--   public booking ve mail/voucher akışları kırılır. SIRA KRİTİK.
--
-- HEDEF (önkoşullar sağlandıktan sonra):
--   reservations + manual_reservations → anon ERİŞEMEZ (SELECT/INSERT/UPDATE/
--   DELETE yok), normal authenticated ERİŞEMEZ, yalnız AKTİF ADMIN erişir.
--   service_role RLS bypass (server create + mail + voucher + dashboard).
--   → PII (name/phone/email/price/commission) anon'a SIFIR.
--
-- DOUBLE-BOOKING: reservations_no_overlap / manual_reservations_no_overlap
--   EXCLUDE constraint'leri (migration 001/030/031) RLS'ten BAĞIMSIZ; bu
--   migration onlara DOKUNMAZ. Atomik garanti aynen sürer.
--
-- AKIŞ (her tablo): RLS enable → pg_policies keşfet → canonical-dışı sil →
--   cleanup verify (stray=0 değilse EXCEPTION) → canonical create → final
--   verify (tam 1 canonical değilse EXCEPTION) → NOTICE log.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- FORCE ROW LEVEL SECURITY YOK · restrictive policy YOK → service_role bypass korunur.
-- public.is_active_admin() (migration 037/038, SECURITY DEFINER + pinned
--   search_path) guard olarak kullanılır → recursion/lockout yok.
--
-- CANONICAL İSİMLER (her tabloda TEK policy):
--   reservations_admin_only · manual_reservations_admin_only
-- POLICY: FOR ALL TO authenticated USING/ WITH CHECK (public.is_active_admin())
--
-- ⚠️ TEK transaction içinde çalıştır (Supabase CLI runner otomatik yapar).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) GUARD FONKSİYONU garanti (idempotent — 037/038 zaten kurmuş olabilir)
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
-- 1) PHASE 3 — KEŞFET → TEMİZLE → DOĞRULA → CANONICAL → DOĞRULA
-- ----------------------------------------------------------------------------
do $rls$
declare
  t          text;
  pol        record;
  v_canon    text;
  v_stray    int;
  v_final    int;
  v_dropped  int;
  pii_tables text[] := array[
    'reservations',
    'manual_reservations'
  ];
begin
  foreach t in array pii_tables loop

    if to_regclass('public.' || t) is null then
      raise exception 'FATAL: public.% tablosu yok — beklenmiyor. Abort.', t;
    end if;

    v_canon   := t || '_admin_only';
    v_dropped := 0;

    -- RLS enable (idempotent)
    execute format('alter table public.%I enable row level security;', t);

    -- KEŞFET + TEMİZLE: canonical DIŞINDAKİ TÜM policy'leri sil (dashboard /
    -- eski migration / permissive / restrictive — hepsi). Tek bir legacy
    -- "allow all" bile OR ile PII'yi açar → kritik.
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
  end loop;

  raise notice '──────────────────────────────────────────────';
  raise notice 'PHASE 3 RLS (reservations PII) — tamamlandı.';
  raise notice '──────────────────────────────────────────────';
end
$rls$;


-- ----------------------------------------------------------------------------
-- 2) FINAL STATE LOG
-- ----------------------------------------------------------------------------
do $log$
declare
  t     text;
  pol   record;
  v_rls boolean;
  pii_tables text[] := array['reservations','manual_reservations'];
begin
  raise notice '════════ FINAL POLICY STATE (PHASE 3) ════════';
  foreach t in array pii_tables loop
    select c.relrowsecurity into v_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;

    raise notice '── %  (RLS enabled=%) ──', t, v_rls;

    for pol in
      select policyname, cmd, permissive, roles
      from pg_policies
      where schemaname = 'public' and tablename = t
      order by policyname
    loop
      raise notice '    • % | cmd=% | % | roles=%',
        pol.policyname, pol.cmd, pol.permissive, pol.roles;
    end loop;
  end loop;
  raise notice '══════════════════════════════════════════════';
end
$log$;


-- ----------------------------------------------------------------------------
-- 3) MANUEL DOĞRULAMA (deploy sonrası)
-- ----------------------------------------------------------------------------
-- -- anon SELECT reddediliyor mu? (boş dönmeli — ÖNCEDEN PII dönüyordu)
-- --   curl '<URL>/rest/v1/reservations?select=name,phone&limit=1' \
-- --     -H "apikey:<ANON>" -H "Authorization: Bearer <ANON>"   → []
-- -- availability hâlâ çalışıyor mu? (RPC, anon)
-- --   curl -X POST '<URL>/rest/v1/rpc/get_blocked_villa_ids' \
-- --     -H "apikey:<ANON>" -H "Authorization: Bearer <ANON>" \
-- --     -H "Content-Type: application/json" \
-- --     -d '{"p_start":"2026-07-01","p_end":"2026-07-05","p_villa_ids":null}'  → uuid[]
--
-- ROLLBACK:
-- do $rollback$
-- declare t text; declare tabs text[] := array['reservations','manual_reservations'];
-- begin
--   foreach t in array tabs loop
--     execute format('drop policy if exists %I on public.%I;', t||'_admin_only', t);
--     execute format('alter table public.%I disable row level security;', t);
--   end loop;
-- end $rollback$;
-- ============================================================================
