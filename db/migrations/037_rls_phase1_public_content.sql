-- ============================================================================
-- Migration 037 — RLS PHASE 1: PUBLIC CONTENT & TAXONOMY HARDENING (v2)
-- ============================================================================
-- v2 FARKI (production-grade legacy cleanup):
--   v1 yalnız BİLİNEN policy isimlerini drop ediyordu. Ama dashboard'dan
--   elle oluşturulmuş veya eski migration'lardan kalmış FARKLI İSİMLİ
--   permissive policy'ler kalabilir. PostgreSQL permissive policy'leri
--   OR ile birleştirir → tek bir eski "allow all" policy, admin_write
--   guard'ını TAMAMEN BYPASS eder. v2 bunu kapatır:
--
--     1) Her tablo için pg_policies'ten MEVCUT TÜM policy'leri keşfet.
--     2) Canonical whitelist DIŞINDAKİ her policy'i otomatik DROP et
--        (isim ne olursa olsun; permissive de restrictive de).
--     3) Cleanup sonrası state'i DOĞRULA (stray policy kalmamalı) —
--        kalırsa RAISE EXCEPTION → transaction rollback (fail-safe).
--     4) Canonical policy'leri DROP+CREATE ile tam tanımla.
--     5) Final state'i DOĞRULA (tam 2 canonical policy) + her tablonun
--        kalan policy listesini NOTICE ile logla.
--
-- AMAÇ (v1 ile aynı):
--   Public okunması GEREKEN ama RLS-SIZ olan içerik/taksonomi tablolarını
--   güvene al. ANON YAZMAYI kapat, ANON OKUMAYI koru, ADMIN tam CRUD'u
--   koru, SERVICE_ROLE bypass'ını koru.
--
-- ROL MODELİ:
--   anon          → public ziyaretçi (login yok)
--   authenticated → admin paneli (login sonrası Supabase Auth session'lı
--                   anon client = authenticated role + admin JWT)
--   service_role  → API route'ları (getSupabaseAdmin). RLS'i OTOMATİK
--                   BYPASS eder; bu migration ona DOKUNMAZ (restrictive
--                   policy ve FORCE RLS KULLANILMAZ → bypass korunur).
--
-- KAPSAM DIŞI (bilinçli — ayrı fazlar):
--   reservations / manual_reservations (Faz 3: önce availability RPC),
--   settings (Faz 4: önce resend_api_key env'e taşı),
--   admin_users / mail_logs / admin_audit_logs (Faz 2: private).
--
-- IDEMPOTENT: tekrar çalıştırılabilir (keşfet-temizle-recreate-doğrula).
-- ROLLBACK : sondaki ROLLBACK BLOĞU'na bakın.
-- PERFORMANS: public_read `using(true)` ≈ 0 maliyet; admin_write guard
--   yalnız yazmada + indexli admin_users(auth_user_id) lookup.
--
-- ⚠️ TRANSACTION: Bu migration'ı TEK TRANSACTION içinde çalıştırın
--   (Supabase CLI migration runner bunu otomatik yapar). Bir tabloda
--   doğrulama EXCEPTION verirse TÜM migration rollback olur → kısmi /
--   tutarsız RLS state oluşmaz.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) ÖN KOŞUL — admin guard lookup index'i (idempotent)
-- ----------------------------------------------------------------------------
create index if not exists idx_admin_users_auth_user_id
  on public.admin_users (auth_user_id);


-- ----------------------------------------------------------------------------
-- 1) GUARD FONKSİYONU — public.is_active_admin()
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + pinned search_path: admin_users'a (ileride) RLS
-- açılsa bile recursion / lock-out olmadan admin kontrolü.
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
-- 2) PHASE 1 — KEŞFET → TEMİZLE → DOĞRULA → RECREATE → LOGLA
-- ----------------------------------------------------------------------------
-- Tablo adları GERÇEK şema adlarıdır (villas DEĞİL → villa; locations
-- DEĞİL → villa_locations; villa_rules DEĞİL → rule_items +
-- villa_rule_relations). Tablo yoksa sessiz atlanır (to_regclass guard).
--
-- Canonical whitelist (her tablo için):
--   <t>_public_read   : FOR SELECT TO anon, authenticated USING (true)
--   <t>_admin_write   : FOR ALL    TO authenticated USING/CHECK is_active_admin()

do $rls$
declare
  t                 text;
  pol               record;
  v_canon_read      text;
  v_canon_write     text;
  v_stray           int;
  v_final           int;
  v_dropped         int;
  public_tables text[] := array[
    'villa',
    'villa_images',
    'villa_prices',
    'villa_features',
    'villa_feature_relations',
    'rule_items',
    'villa_rule_relations',
    'price_include_items',
    'villa_price_include_relations',
    'villa_locations',
    'villa_types',
    'villa_type_relations',
    'villa_distances',
    'menu',
    'homepage_collections',
    'faqs',
    'payment_methods',
    'exchange_rates'
  ];
begin
  foreach t in array public_tables loop

    -- ---- 2.0 Tablo var mı? ----
    if to_regclass('public.' || t) is null then
      raise notice 'SKIP: public.% tablosu yok, atlandı', t;
      continue;
    end if;

    v_canon_read  := t || '_public_read';
    v_canon_write := t || '_admin_write';
    v_dropped     := 0;

    -- ---- 2.1 RLS aç (idempotent) ----
    execute format('alter table public.%I enable row level security;', t);

    -- ---- 2.2 KEŞFET + TEMİZLE: canonical whitelist DIŞINDAKİ TÜM
    --          policy'leri sil (isim/permissive/restrictive fark etmez).
    --          Tek bir legacy "allow all" bile OR ile güvenliği deldiği
    --          için bu adım kritik. ----
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename  = t
        and policyname not in (v_canon_read, v_canon_write)
    loop
      execute format('drop policy %I on public.%I;', pol.policyname, t);
      v_dropped := v_dropped + 1;
      raise notice 'CLEANUP [%]: legacy policy "%" DROP edildi', t, pol.policyname;
    end loop;

    if v_dropped = 0 then
      raise notice 'CLEANUP [%]: temizlenecek legacy policy yok', t;
    end if;

    -- ---- 2.3 Canonical'leri de drop et (tam tanımı garantiye almak
    --          için: eski aynı-isimli policy farklı tanımlı olabilir). ----
    execute format('drop policy if exists %I on public.%I;', v_canon_read,  t);
    execute format('drop policy if exists %I on public.%I;', v_canon_write, t);

    -- ---- 2.4 PRE-CREATE VERIFY: artık tabloda HİÇ policy kalmamalı.
    --          Kaldıysa beklenmedik durum → abort (rollback). ----
    select count(*) into v_stray
    from pg_policies
    where schemaname = 'public' and tablename = t;

    if v_stray <> 0 then
      raise exception
        'RLS DRIFT [%]: cleanup sonrası % policy hâlâ duruyor (beklenen 0). Abort.',
        t, v_stray;
    end if;

    -- ---- 2.5 CANONICAL RECREATE ----
    -- public read: anon + authenticated, koşulsuz (mevcut public davranış aynen)
    execute format($f$
      create policy %I on public.%I
        as permissive
        for select
        to anon, authenticated
        using (true);
    $f$, v_canon_read, t);

    -- admin write: yalnız aktif admin (authenticated). FOR ALL → yazma
    -- bu policy'den geçer; SELECT'i public_read OR'lar.
    execute format($f$
      create policy %I on public.%I
        as permissive
        for all
        to authenticated
        using (public.is_active_admin())
        with check (public.is_active_admin());
    $f$, v_canon_write, t);

    -- ---- 2.6 POST-CREATE VERIFY: tam 2 policy ve ikisi de canonical olmalı ----
    select count(*) into v_final
    from pg_policies
    where schemaname = 'public' and tablename = t;

    if v_final <> 2 then
      raise exception
        'RLS VERIFY [%]: beklenen 2 policy, bulunan %. Abort.', t, v_final;
    end if;

    perform 1
    from pg_policies
    where schemaname = 'public' and tablename = t
      and policyname not in (v_canon_read, v_canon_write);
    if found then
      raise exception
        'RLS VERIFY [%]: canonical-dışı policy tespit edildi. Abort.', t;
    end if;

    raise notice 'OK [%]: RLS açık, % legacy temizlendi, canonical 2 policy kuruldu',
      t, v_dropped;
  end loop;

  raise notice '──────────────────────────────────────────────';
  raise notice 'PHASE 1 RLS — cleanup + recreate tamamlandı.';
  raise notice '──────────────────────────────────────────────';
end
$rls$;


-- ----------------------------------------------------------------------------
-- 3) FINAL STATE LOG — her tablonun kalan policy listesini NOTICE'la
-- ----------------------------------------------------------------------------
-- Audit/doğrulama için: migration sonunda her hedef tabloda HANGİ
-- policy'lerin kaldığını (isim, komut, roller, permissive) loglar.
do $log$
declare
  t   text;
  pol record;
  v_rls boolean;
  public_tables text[] := array[
    'villa','villa_images','villa_prices','villa_features',
    'villa_feature_relations','rule_items','villa_rule_relations',
    'price_include_items','villa_price_include_relations','villa_locations',
    'villa_types','villa_type_relations','villa_distances','menu',
    'homepage_collections','faqs','payment_methods','exchange_rates'
  ];
begin
  raise notice '════════ FINAL POLICY STATE ════════';
  foreach t in array public_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    select c.relrowsecurity into v_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;

    raise notice '── %  (RLS=%) ──', t, v_rls;

    for pol in
      select policyname, cmd, permissive, roles
      from pg_policies
      where schemaname = 'public' and tablename = t
      order by policyname
    loop
      raise notice '    • % | cmd=% | %  | roles=%',
        pol.policyname, pol.cmd, pol.permissive, pol.roles;
    end loop;
  end loop;
  raise notice '════════════════════════════════════';
end
$log$;


-- ----------------------------------------------------------------------------
-- 4) MANUEL DOĞRULAMA (uygulamadan sonra çalıştır — opsiyonel)
-- ----------------------------------------------------------------------------
-- -- Her hedef tabloda RLS açık + tam 2 canonical policy mı?
-- select c.relname, c.relrowsecurity,
--        (select count(*) from pg_policies p
--          where p.schemaname='public' and p.tablename=c.relname) as policy_count
-- from pg_class c
-- join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relname in (
--   'villa','villa_images','villa_prices','villa_features',
--   'villa_feature_relations','rule_items','villa_rule_relations',
--   'price_include_items','villa_price_include_relations','villa_locations',
--   'villa_types','villa_type_relations','villa_distances','menu',
--   'homepage_collections','faqs','payment_methods','exchange_rates'
-- )
-- order by c.relname;
--
-- -- ANON OKUMA çalışıyor mu? (≥1 satır dönmeli)
-- --   curl '<URL>/rest/v1/villa?select=id&limit=1' -H "apikey:<ANON>" -H "Authorization: Bearer <ANON>"
-- -- ANON YAZMA reddediliyor mu? (önceden başarılıydı; artık RLS engellemeli)
-- --   curl -X PATCH '<URL>/rest/v1/villa?id=eq.<UUID>' -H "apikey:<ANON>" \
-- --     -H "Authorization: Bearer <ANON>" -H "Content-Type: application/json" -d '{"title":"x"}'


-- ----------------------------------------------------------------------------
-- ROLLBACK BLOĞU (gerekirse — ayrı oturumda; güvenlik geriler, TAVSİYE EDİLMEZ)
-- ----------------------------------------------------------------------------
-- do $rollback$
-- declare t text;
-- declare tabs text[] := array[
--   'villa','villa_images','villa_prices','villa_features',
--   'villa_feature_relations','rule_items','villa_rule_relations',
--   'price_include_items','villa_price_include_relations','villa_locations',
--   'villa_types','villa_type_relations','villa_distances','menu',
--   'homepage_collections','faqs','payment_methods','exchange_rates'
-- ];
-- begin
--   foreach t in array tabs loop
--     if to_regclass('public.'||t) is null then continue; end if;
--     execute format('drop policy if exists %I on public.%I;', t||'_public_read', t);
--     execute format('drop policy if exists %I on public.%I;', t||'_admin_write', t);
--     execute format('alter table public.%I disable row level security;', t);
--   end loop;
-- end
-- $rollback$;
-- -- drop function if exists public.is_active_admin();
-- ============================================================================
