# Migration Arşivi

Bu klasördeki SQL dosyaları **artık uygulanmaz**. Salt tarihsel kayıttır:
bir kolonun/tablonun neden var olduğunu açıklayan şema soyağacı.

Projede **migration runner yoktur** (`package.json`'da migration script'i,
`schema_migrations` ledger tablosu veya CI adımı yok) — migration'lar elle
uygulanır. Bu nedenle bu dosyaların taşınmasının **runtime/deployment
etkisi sıfırdır**.

## `supabase/` — Supabase dönemi (29 dosya)

Proje Supabase PostgreSQL'den native PostgreSQL'e (Hetzner) geçtiği için
bu migration'lar **bugünkü veritabanında çalıştırılamaz**: `anon`,
`authenticated`, `service_role` rolleri ve `auth` şeması vanilla
PostgreSQL'de yoktur → `ERROR` verirler.

İçerdikleri Supabase'e özgü yapılar:

- `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY`
- `GRANT … TO anon | authenticated | service_role`
- `auth.uid()` / `auth.users`

Kapsam: `015`–`069` arası 28 dosya + numaralandırma öncesi
`2026_05_payment_accounts_rls.sql`.

> `069_native_auth_password_import.sql` Supabase GoTrue
> (`auth.users.encrypted_password`) → `admin_users.password_hash`
> köprüsüdür. `to_regclass('auth.users')` koruması sayesinde
> `auth` şeması olmayan bir veritabanında sessizce atlanır.

**Bu dosyalardaki tablo/kolon/fonksiyon tanımları hâlâ geçerlidir** —
yalnızca RLS/rol/auth katmanı geçersizdir. Yetkilendirme artık uygulama
katmanında (`authorizeAdminCaller`, native JWT) yapılır.

## `pre-numbering/` — numaralandırma öncesi (1 dosya)

`db/migrations/NNN_*.sql` şeması benimsenmeden önce kök `migrations/`
klasöründe duran, Supabase'e özgü olmayan migration.

## Aktif migration'lar

`db/migrations/*.sql` (numaralı) — native PostgreSQL. `070` ve sonrası
RLS/rol/`auth.*` kullanmaz.

> ⚠️ Bilinen istisna: `070_reservation_share_links.sql` içindeki
> `public.is_active_admin()` fonksiyonu hâlâ `auth.uid()` çağırır.
> Fonksiyon uygulama kodundan **çağrılmaz** (yalnız arşivlenen RLS
> policy'leri kullanıyordu); vanilla PostgreSQL'de bu migration'ın
> yeniden çalıştırılması `auth.uid()` bulunamadığı için hata verir.
> Ayrı bir görevde temizlenmelidir.
