-- ============================================================================
-- Migration 038 — RLS PHASE 2: PRIVATE / ADMIN-ONLY TABLES
-- ============================================================================
-- KAPSAM: admin_users, mail_logs, admin_audit_logs
-- HEDEF : anon ERİŞEMEZ, normal authenticated ERİŞEMEZ, yalnız AKTİF ADMIN
--         erişir. service_role RLS'i bypass eder (DOKUNULMAZ).
--
-- ⚠️⚠️ ÜRETIM ÖNKOŞULU — mail_logs (UYGULAMADAN ÖNCE OKU) ⚠️⚠️
--   mail_logs şu an PUBLIC rezervasyon mail route'larından (auth YOK:
--   /api/mail/reservation-request, -approved, -cancelled) ANON client ile
--   yazılıyor (lib/db/mail-log.repository.ts → import { supabase }).
--   Bu migration mail_logs'u admin-only yapınca, anon INSERT REDDEDİLİR →
--   public mail loglaması bozulur.
--   ZORUNLU ÖNKOŞUL: lib/db/mail-log.repository.ts içindeki anon `supabase`
--   client'ını service_role'e çevir (getSupabaseAdmin()). Mail logging
--   best-effort olduğundan crash etmez ama log kaybı yaşanır. Repository
--   service_role'e geçince RLS bypass olur → kayıt aynen sürer.
--   admin_users ve admin_audit_logs'ta bu risk YOK (sırasıyla
--   authenticated-admin ve service_role ile yazılıyor).
--
-- AKIŞ (her tablo için zorunlu sıra):
--   1) RLS enable
--   2) pg_policies ile MEVCUT TÜM policy'leri keşfet
--   3) canonical DIŞINDAKİ her policy'i sil (isim/permissive/restrictive farketmez)
--   4) cleanup doğrulaması (stray = 0, değilse RAISE EXCEPTION)
--   5) canonical policy oluştur
--   6) final state doğrulaması (tam 1 canonical, değilse RAISE EXCEPTION)
--   7) NOTICE ile final state logla
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- FORCE ROW LEVEL SECURITY KULLANILMAZ → service_role bypass korunur.
-- restrictive policy KULLANILMAZ → service_role bypass korunur.
--
-- CANONICAL İSİMLER (her tabloda TEK policy):
--   admin_users_admin_only · mail_logs_admin_only · admin_audit_logs_admin_only
--
-- POLICY MANTIĞI (üçü de aynı):
--   FOR ALL TO authenticated
--   USING (public.is_active_admin()) WITH CHECK (public.is_active_admin())
--
-- RECURSION/LOCKOUT (admin_users):
--   is_active_admin() SECURITY DEFINER + pinned search_path. Fonksiyon,
--   sahibi (postgres) yetkisiyle admin_users'ı RLS BYPASS ederek okur →
--   admin_users üzerindeki policy fonksiyonu tekrar tetiklemez → recursion
--   YOK, lockout YOK. anon login öncesi zaten authenticated olur; lookup
--   authenticated-admin olarak is_active_admin()=true ile geçer.
--
-- ⚠️ TRANSACTION: TEK transaction içinde çalıştır (Supabase CLI runner
--   otomatik yapar). Herhangi bir doğrulama EXCEPTION verirse TÜM migration
--   rollback olur → kısmi/tutarsız RLS state oluşmaz.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) ÖN KOŞUL — admin guard lookup index'i (idempotent)
-- ----------------------------------------------------------------------------
create index if not exists idx_admin_users_auth_user_id
  on public.admin_users (auth_user_id);


-- ----------------------------------------------------------------------------
-- 1) GUARD FONKSİYONU — public.is_active_admin() (idempotent, recursion-safe)
-- ----------------------------------------------------------------------------
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
-- 2) PHASE 2 — KEŞFET → TEMİZLE → DOĞRULA → CANONICAL → DOĞRULA
-- ----------------------------------------------------------------------------
do $rls$
declare
  t              text;
  pol            record;
  v_canon        text;
  v_stray        int;
  v_final        int;
  v_dropped      int;
  admin_tables text[] := array[
    'admin_users',
    'mail_logs',
    'admin_audit_logs'
  ];
begin
  foreach t in array admin_tables loop

    -- ---- 2.0 Tablo var mı? ----
    if to_regclass('public.' || t) is null then
      raise notice 'SKIP: public.% tablosu yok, atlandı', t;
      continue;
    end if;

    v_canon   := t || '_admin_only';
    v_dropped := 0;

    -- ---- 2.1 RLS enable (idempotent) ----
    execute format('alter table public.%I enable row level security;', t);

    -- ---- 2.2 KEŞFET + TEMİZLE: canonical DIŞINDAKİ TÜM policy'leri sil.
    --          Dashboard'dan veya eski migration'dan kalmış FARKLI İSİMLİ,
    --          permissive ya da restrictive her policy buraya düşer. Tek bir
    --          legacy "allow all" bile OR ile güvenliği deldiği için kritik.
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

    -- ---- 2.3 Canonical'i de drop et (eski aynı-isimli farklı tanım riskini ele) ----
    execute format('drop policy if exists %I on public.%I;', v_canon, t);

    -- ---- 2.4 CLEANUP DOĞRULAMASI: artık HİÇ policy kalmamalı (stray = 0) ----
    select count(*) into v_stray
    from pg_policies
    where schemaname = 'public' and tablename = t;

    if v_stray <> 0 then
      raise exception
        'RLS DRIFT [%]: cleanup sonrası % policy hâlâ duruyor (beklenen 0). Abort.',
        t, v_stray;
    end if;

    -- ---- 2.5 CANONICAL POLICY: yalnız aktif admin (FOR ALL) ----
    execute format($f$
      create policy %I on public.%I
        as permissive
        for all
        to authenticated
        using (public.is_active_admin())
        with check (public.is_active_admin());
    $f$, v_canon, t);

    -- ---- 2.6 FINAL DOĞRULAMA: tam 1 policy, o da canonical olmalı ----
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
  raise notice 'PHASE 2 RLS (admin-only) — cleanup + recreate tamamlandı.';
  raise notice '──────────────────────────────────────────────';
end
$rls$;


-- ----------------------------------------------------------------------------
-- 3) FINAL STATE LOG — RLS durumu + kalan policy isimleri
-- ----------------------------------------------------------------------------
do $log$
declare
  t     text;
  pol   record;
  v_rls boolean;
  admin_tables text[] := array[
    'admin_users','mail_logs','admin_audit_logs'
  ];
begin
  raise notice '════════ FINAL POLICY STATE (PHASE 2) ════════';
  foreach t in array admin_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

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
-- 4) MANUEL DOĞRULAMA (uygulamadan sonra — opsiyonel)
-- ----------------------------------------------------------------------------
-- -- RLS açık + tam 1 canonical policy mı?
-- select c.relname, c.relrowsecurity,
--        (select count(*) from pg_policies p
--          where p.schemaname='public' and p.tablename=c.relname) as policy_count
-- from pg_class c join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relname in
--   ('admin_users','mail_logs','admin_audit_logs')
-- order by c.relname;
--
-- -- ANON erişemiyor mu? (boş dönmeli)
-- --   curl '<URL>/rest/v1/admin_users?select=id' -H "apikey:<ANON>" -H "Authorization: Bearer <ANON>"
-- --   → [] (RLS reddeder; ÖNCEDEN tüm satırlar dönüyordu).


-- ----------------------------------------------------------------------------
-- ROLLBACK BLOĞU (gerekirse — ayrı oturum; güvenlik geriler, TAVSİYE EDİLMEZ)
-- ----------------------------------------------------------------------------
-- do $rollback$
-- declare t text;
-- declare tabs text[] := array['admin_users','mail_logs','admin_audit_logs'];
-- begin
--   foreach t in array tabs loop
--     if to_regclass('public.'||t) is null then continue; end if;
--     execute format('drop policy if exists %I on public.%I;', t||'_admin_only', t);
--     execute format('alter table public.%I disable row level security;', t);
--   end loop;
-- end
-- $rollback$;
-- ============================================================================
