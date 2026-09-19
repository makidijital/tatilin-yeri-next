# Full RLS Migration Planı — Production-Safe

> Hedef: Tüm public tablolarda RLS'i, **production'ı bozmadan**, fazlı ve rollback-safe şekilde devreye almak. İlk migration kodun gerçek erişim pattern'lerine göre tasarlandı; agresif değil, non-destructive.

**Çalıştırılabilir ilk migration:** `db/migrations/037_rls_phase1_public_content.sql`

---

## Önce: Şema adı düzeltmeleri (kritik)

İstediğin tablo adlarının bir kısmı gerçek şemada farklı. Migration'ları yanlış tabloya yazmamak için doğrulanmış eşleme:

| Sen yazdın | Gerçek tablo | Not |
|---|---|---|
| `villas` | **`villa`** | tekil |
| `locations` | **`villa_locations`** | bölge/lokasyon taksonomisi |
| `regions` | **— (tablo yok)** | "region" bir filtre; villa.`location` alanı + `villa_locations` taksonomisi üzerinden geliyor |
| `villa_rules` | **`rule_items`** + **`villa_rule_relations`** | tanım tablosu + junction |
| `villa_availability` | **— (tablo yok)** | müsaitlik HESAPLANIYOR: `reservations` + `manual_reservations` + `external_calendar_events` + `villa_prices` |
| `villa_features` | `villa_features` + `villa_feature_relations` | tanım + junction |

---

## Erişim modeli (her şeyin dayandığı temel)

Sistemde üç rol var ve migration bunları korumak zorunda:

- **`anon`** → public site ziyaretçisi (login yok). Tarayıcı bundle'ındaki anon key ile gelir.
- **`authenticated`** → admin paneli. Admin login sonrası anon client'a Supabase Auth session set ediliyor; istekler `authenticated` rolüyle + admin JWT ile gidiyor (migration 034'te kanıtlandı). Sistemde **public kullanıcı hesabı yok**, dolayısıyla `authenticated` ≈ admin.
- **`service_role`** → `getSupabaseAdmin()` kullanan API route'ları. RLS'i **otomatik bypass** eder; policy gerekmez, bozulmaz.

Tüm policy'ler bu modele göre yazıldı. Admin guard'ı `public.is_active_admin()` SECURITY DEFINER fonksiyonuyla yapılıyor — böylece `admin_users` üzerinde ileride RLS açılsa bile recursion/lock-out olmuyor.

---

## 1. Tablo Sınıflandırması

### A) Public read (anon SELECT açık + admin write) — **Migration 037 (Faz 1)**

Public sayfalarda okunur, sadece admin yazar, **sır/PII içermez, availability okuması için kullanılmaz.** En güvenli grup.

`villa`, `villa_images`, `villa_prices`, `villa_features`, `villa_feature_relations`, `rule_items`, `villa_rule_relations`, `price_include_items`, `villa_price_include_relations`, `villa_locations`, `villa_types`, `villa_type_relations`, `villa_distances`, `menu`, `homepage_collections`, `faqs`, `payment_methods`, `exchange_rates`

> Bu tablolar şu an anon **yazmaya da** açık (RLS yok). Faz 1'in asıl kazancı: public okumayı bozmadan **anon yazma açığını kapatmak.**

### B) Admin only (anon erişim YOK, authenticated-admin + service_role) — **Faz 2**

Public hiç görmemeli. Sadece admin panelinde okunur/yazılır.

`admin_users` (dikkat: guard fonksiyonu burayı okur → SECURITY DEFINER şart), `mail_logs`, `admin_audit_logs`

> `contact_messages`, `offer_requests`, `admin_activity_logs`, `pages`, `villa_reviews`, `shared_*`, `external_calendar_*`, `payment_accounts` zaten RLS'li — Faz 2'de yalnız tutarlılık denetimi.

### C) Mixed access (split read/write) — **Faz 3 (app değişikliği önkoşullu)**

`reservations`, `manual_reservations`

- **anon:** `reservations` INSERT açık (public booking), SELECT **kapalı** (PII koruması). `manual_reservations` anon erişimi yok.
- **authenticated-admin:** tam CRUD.
- **service_role:** bypass.
- **Önkoşul:** Müsaitlik okuması bu tabloları anon SELECT ile yapıyor (aşağıda risk analizi). Bu yüzden önce **SECURITY DEFINER `get_blocked_ranges()` RPC'si** yazılıp `getBlockedVillaIds` + conflict check'ler ona çevrilmeli. Sonra anon SELECT güvenle kapatılır.

### D) Mixed + sır (önce env temizliği) — **Faz 4**

`settings`

- Public site config'i (başlık, hero, iletişim) için anon SELECT gerekiyor; **ama aynı satırda `resend_api_key` sırrı var.** RLS satır-bazlı olduğu için tek satırda sütun gizlenemez.
- **Önkoşul:** `resend_api_key`'i (ve varsa diğer sırları) DB'den **env'e taşı** (`app/lib/mail/client.ts` zaten `RESEND_API_KEY` env fallback'i destekliyor). Sonra `settings` anon SELECT güvenli olur — ya da güvenli sütunları açan bir `public.settings_public` VIEW'i + base tabloda anon revoke.

---

## 2. Risk Analizi — Hangi tablo RLS açılınca hangi ekran kırılır?

| Tablo | Naif "service-role only" RLS açılırsa kırılan ekran | 037'deki güvenli yaklaşım | Sonuç |
|---|---|---|---|
| `villa` | Anasayfa, `/kiralik-villalar`, `/arama`, villa detay, SEO — **hepsi boşalır** | anon SELECT `using(true)` korunur | ✅ kırılmaz |
| `villa_images` | Tüm galeriler/kartlar görselsiz kalır | anon SELECT korunur | ✅ kırılmaz |
| `villa_prices` | Detay fiyat listesi + booking sidebar + availability API çöker | anon SELECT korunur | ✅ kırılmaz |
| `villa_features` / `rule_items` / `price_include_items` (+junction'lar) | Detay sayfası olanak/kural/dahil blokları boşalır | anon SELECT korunur | ✅ kırılmaz |
| `villa_locations` / `villa_types` (+junction) | Arama filtreleri, taksonomi sayfaları, menü boşalır | anon SELECT korunur | ✅ kırılmaz |
| `villa_distances` | Detay "mesafeler" bloğu boşalır | anon SELECT korunur | ✅ kırılmaz |
| `menu` / `homepage_collections` / `faqs` | Layout menüsü, anasayfa kolonları, SSS boşalır | anon SELECT korunur | ✅ kırılmaz |
| `payment_methods` | **Rezervasyon formu** ödeme yöntemi listesi boşalır (anon okuyor) | anon SELECT korunur | ✅ kırılmaz |
| `exchange_rates` | Fiyat çevrimi bozulur | anon SELECT korunur | ✅ kırılmaz |
| `admin_users` | Naif kapatma → guard subquery'si boş döner, **tüm admin panel kilitlenir** | `is_active_admin()` SECURITY DEFINER ile bypass | ⚠️ Faz 2'de bu fonksiyonla |
| `reservations` | anon SELECT kapanırsa: **`/arama` tarih filtresi** dolu villaları "müsait" gösterir; booking fast-path zayıflar (ama EXCLUDE constraint yine doğru engeller) | Faz 3: önce RPC, sonra anon SELECT kapat; anon INSERT açık | ⚠️ app değişikliği önkoşullu |
| `manual_reservations` | Aynı: arama availability filtresi sapar | Faz 3 ile beraber | ⚠️ önkoşullu |
| `settings` | anon SELECT kapanırsa **tüm site** (başlık/menü/hero) boşalır; açık bırakılırsa **resend_api_key sızar** | Faz 4: önce env'e taşı | ⚠️ önkoşullu |

**Özet:** Faz 1 (037) hiçbir ekranı kırmaz — sadece anon yazma deliğini kapatır. Asıl dikkat gerektiren üç tablo (`reservations`, `manual_reservations`, `settings`) bilinçli olarak ertelendi çünkü küçük app değişiklikleri önkoşul.

---

## 3. Güvenli Migration Sırası

**Faz 1 — `037_rls_phase1_public_content.sql` (HAZIR, şimdi uygulanabilir)**
Public içerik/taksonomi tabloları. `is_active_admin()` guard fonksiyonu + her tabloya `public_read` + `admin_write` policy. Risk: çok düşük. Kazanç: anon yazma açığı kapanır.

**Faz 2 — Admin-only tablolar**
`admin_users`, `mail_logs`, `admin_audit_logs`: RLS aç, anon policy YOK (default deny), `authenticated` için `is_active_admin()` guard, service_role bypass.
`admin_users` için ek incelik: admin'in kendi kaydını okuyabilmesi gerek (`auth_user_id = auth.uid()` self-read policy) — login lookup'ı bozulmasın. Mevcut RLS'li tablolarda (pages, payment_accounts vb.) policy tutarlılığını da bu fazda denetle.

**Faz 3 — Rezervasyon tabloları (app değişikliği önce)**
1. `public.get_villa_blocked_ranges(p_villa_id uuid)` ve `public.get_blocked_villa_ids(p_start date, p_end date)` SECURITY DEFINER RPC'leri yaz (yalnız `villa_id, start_date, end_date` döner — PII yok).
2. `lib/availability.helper.ts > getBlockedVillaIds` ve `lib/db/reservation.repository.ts` conflict select'lerini bu RPC'lere çevir.
3. RLS aç: `reservations` → anon INSERT açık (booking), anon SELECT YOK; admin tam CRUD; service_role bypass. `manual_reservations` → anon yok, admin + service_role. PII bu noktada kapanır.

**Faz 4 — settings sır temizliği**
1. `resend_api_key` (ve diğer sırlar) DB'den env'e taşı, kodda env fallback'i doğrula.
2. `settings` RLS aç: anon SELECT (artık sırsız) veya `settings_public` view + base tabloda anon revoke. Admin tam CRUD.

**Faz 5 — Final denetim**
`pg_class.relrowsecurity` ile tüm public tablolarda RLS açık mı doğrula; "RLS-free tablo kalmadı" raporu. Sızıntı testleri (anon ile reservations/settings/admin_users SELECT → boş dönmeli).

---

## 4. İlk Migration SQL'i

Tam, idempotent ve rollback-safe migration dosyası oluşturuldu:

**`db/migrations/037_rls_phase1_public_content.sql`**

İçeriği özetle:

1. **Ön koşul index:** `idx_admin_users_auth_user_id` (guard sorgusu için, `create index if not exists`).
2. **Guard fonksiyonu:** `public.is_active_admin()` — `SECURITY DEFINER`, `search_path` pinned, `STABLE`. admin_users'a RLS açılsa bile güvenli.
3. **18 public tablo** üzerinde DO-loop ile:
   - `enable row level security` (idempotent),
   - `drop policy if exists` (eski + yeni isimler — idempotent),
   - `<t>_public_read`: `FOR SELECT TO anon, authenticated USING (true)` → public okuma aynen,
   - `<t>_admin_write`: `FOR ALL TO authenticated USING/CHECK is_active_admin()` → yazma yalnız admin.
   - Tablo yoksa sessizce atlar (`to_regclass` guard).
4. **Doğrulama SQL'leri** (yorum içinde): RLS durumu, anon-read hâlâ çalışıyor mu, anon-write artık reddediliyor mu.
5. **Rollback bloğu** (yorum içinde): policy'leri drop + RLS disable + fonksiyon drop.

### Neden bu pattern güvenli?

- **Public read korunur:** `using (true)` satır filtresi koymaz → ziyaretçi her şeyi eskisi gibi okur.
- **Anon write kapanır:** SELECT-only `public_read` yazmayı kapsamaz; yazma yalnız `admin_write`'tan geçer → admin şart. Bu, şu anki **gerçek açığı** (anon villa/fiyat değiştirme) kapatır.
- **Admin panel bozulmaz:** authenticated + aktif admin → `admin_write` ile tam CRUD.
- **API route'ları bozulmaz:** service_role RLS'i bypass eder.
- **Idempotent:** `drop ... if exists` + `create or replace` + `if not exists` → tekrar çalıştırılabilir.
- **Rollback-safe:** her şey geri alınabilir; ayrı rollback bloğu hazır.
- **Performans:** public_read maliyeti ≈ 0; admin guard yalnız yazmada + indexli lookup.

### Uygulama talimatı

Önce **staging**'de çalıştır, sonra doğrulama SQL'lerini koştur (özellikle "anon write artık reddediliyor mu" testi — önceden başarılıydı, şimdi reddetmeli; "anon read hâlâ çalışıyor mu" — dönmeli). Public siteyi ve admin panelini duman testinden geçir. Ardından prod'a al.

> Faz 2–4'ün SQL'lerini de hazırlamamı istersen söyle — özellikle Faz 3'ün availability RPC'si + ilgili app refactor'ı en kritik adım (PII'yi gerçekten kapatan kısım).
