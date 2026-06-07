# SUPABASE STORAGE → R2 BULK COPY RUNBOOK (villa-images)

**Tarih:** 2026-06-07 · **Kapsam:** YALNIZ dosya kopyalama planı (analiz/runbook; app kodu değişmez)

## Doğrulanmış gerçekler
- Bucket: **`villa-images`** · **2433 dosya** · **~394 MB**
- `villa_images.image_url` kayıtları **tamamı relative path** · **full_url = 0**
- R2 bucket hazır · **`cdn.villayagel.com`** aktif (R2 custom domain)

## ⚠️ Bu turda YAPILMAYACAK (kesin sınır)
Provider değişimi · upload sistemi · `next.config` · R2 provider yazımı → **HİÇBİRİ**. Yalnız dosyalar Supabase → R2'ye kopyalanır. Kaynak (Supabase) **salt-okunur** kalır; bu işlem üretimi etkilemez.

> **Neden bu kadar düşük riskli:** Tüm DB satırları relative path olduğu için, dosyalar R2'ye **birebir aynı key** ile kopyalanırsa, ileride provider R2'ye alındığında `getPublicUrl` aynı path'i `https://cdn.villayagel.com/...` olarak üretir → **tek bir DB satırı bile değişmeden** tüm görseller döner. Bu kopya adımı, o geçişin yalnız veri ön-hazırlığıdır.

---

## 1) SUPABASE STORAGE S3 ENDPOINT NASIL ALINIR

Supabase Storage **S3-uyumlu** bir endpoint sunar. Gerekenler: endpoint, region, S3 access key + secret.

**Dashboard adımları:**
1. Supabase Dashboard → projen (`uauhkizhzdpsjtctddbe`) → **Project Settings → Storage** (veya **Storage → Settings → "S3 Connection"**).
2. Şu üç değeri kaydet:
   - **Endpoint:** `https://uauhkizhzdpsjtctddbe.supabase.co/storage/v1/s3`
   - **Region:** dashboard'da yazan değer (örn. `eu-central-1` / `eu-west-1` — projenin region'ı; rclone'da birebir kullanılacak).
3. **S3 Access Keys** bölümünden **"New access key"** üret → **Access Key ID** + **Secret Access Key** (yalnız bir kez gösterilir; kaydet).
   - Not: Bu S3 anahtarları, `SUPABASE_SERVICE_ROLE_KEY`'den **ayrıdır** — Storage S3 protokolü için özel anahtarlardır.
   - Kopya için **read** yetkisi yeterli; mümkünse salt-okunur kapsam ver.

**R2 tarafı (kaynak değil hedef — referans):**
- Cloudflare → **R2 → Manage R2 API Tokens → Create API Token** → Access Key ID + Secret.
- Endpoint: `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`

---

## 2) RCLONE KURULUMU VE AYARLAR

**Kurulum (yerel makine / güvenli bir VM):**
```bash
# macOS
brew install rclone
# Linux
curl https://rclone.org/install.sh | sudo bash
# Doğrula
rclone version
```

**İki remote tanımı** (`~/.config/rclone/rclone.conf`). Anahtarları buraya yaz veya `rclone config` interaktif sihirbazıyla gir.

```ini
# ---- KAYNAK: Supabase Storage (S3-compatible) ----
[supabase]
type = s3
provider = Other
access_key_id     = <SUPABASE_S3_ACCESS_KEY_ID>
secret_access_key = <SUPABASE_S3_SECRET>
endpoint = https://uauhkizhzdpsjtctddbe.supabase.co/storage/v1/s3
region   = <PROJE_REGION>          # dashboard'daki değer (örn. eu-central-1)
acl = private

# ---- HEDEF: Cloudflare R2 ----
[r2]
type = s3
provider = Cloudflare
access_key_id     = <R2_ACCESS_KEY_ID>
secret_access_key = <R2_SECRET>
endpoint = https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
region = auto
acl = private
no_check_bucket = true             # R2'de CreateBucket denemesini engeller
```

**Bağlantı testi (kaynağa yazma YOK — sadece listeler):**
```bash
rclone lsd supabase:villa-images        # klasörleri listele (villas/ ve legacy UUID klasörleri görünmeli)
rclone size supabase:villa-images       # ~2433 dosya / ~394 MB beklenir
rclone lsd r2:villa-images              # hedef bucket erişilebilir mi
```

---

## 3) KAYNAĞA ZARAR VERMEDEN YALNIZ COPY

**Kesin kurallar:**
- ✅ **Sadece `rclone copy`** — `sync`/`move` **YASAK** (sync hedefte silebilir; move kaynağı boşaltır).
- ✅ **Path/key'leri DEĞİŞTİRME** (prefix ekleme/çıkarma yok) → relative DB path'leri bozulmaz.
- ✅ Kaynak Supabase **salt-okunur** kalır; copy kaynaktan yalnız okur.
- ✅ Hedef R2 bucket adı **`villa-images`** ve yapı birebir.

**Adım 1 — Kuru çalışma (hiçbir şey kopyalanmaz, sadece plan):**
```bash
rclone copy supabase:villa-images r2:villa-images \
  --dry-run --checksum --transfers 16 --retries 5 -P
```
Çıktıda ~2433 dosyanın "would copy" olarak listelendiğini doğrula.

**Adım 2 — Gerçek kopya (path-korumalı, checksum'lı):**
```bash
rclone copy supabase:villa-images r2:villa-images \
  --checksum --transfers 16 --checkers 16 --retries 5 \
  --log-file=rclone-r2-copy.log --log-level INFO -P
```
- 394 MB / 2433 dosya → tipik birkaç dakika.
- Kesinti olursa **aynı komutu tekrar çalıştır** — `copy` idempotent, yalnız eksikleri tamamlar (kaynağa zarar vermez).

---

## 4) KOPYA SONRASI DOĞRULAMA

**4.1 — Bire bir içerik doğrulaması (checksum):**
```bash
rclone check supabase:villa-images r2:villa-images --checksum
# Beklenen: "0 differences found", "2433 matching files"
```

**4.2 — Sayım + boyut çapraz-kontrol:**
```bash
rclone size r2:villa-images
# Beklenen: 2433 objects, ~394 MB (kaynakla aynı)
```
Ayrıca SQL ile referans sayım:
```sql
select count(*) from storage.objects where bucket_id = 'villa-images';  -- = 2433
```

**4.3 — DB ↔ R2 hizalama spot-check (en kritik):**
Birkaç gerçek `image_url` (relative path) al ve cdn üzerinden 200 dönüyor mu test et:
```sql
select image_url from villa_images
where image_url not ilike 'http%' order by random() limit 5;
```
Her path için:
```bash
curl -I "https://cdn.villayagel.com/<image_url_path>"
# Beklenen: HTTP/2 200, content-type: image/webp
```
> Bu, hem dosyanın R2'de doğru key'de olduğunu hem de `cdn.villayagel.com`'un bucket köküne doğru bağlandığını kanıtlar. **Provider switch'in çalışacağının kanıtı budur.**

**4.4 — Orphan/eksik kontrol (opsiyonel):**
```bash
rclone check supabase:villa-images r2:villa-images --checksum --one-way
# Kaynakta olup hedefte olmayan dosya kalmadığını garanti eder
```

---

## 5) PROVIDER DEĞİŞİMİNDEN ÖNCE KONTROL LİSTESİ

(Switch bu turda YAPILMAYACAK — ama hazır olunduğunu doğrulayan ön-koşullar:)

- [ ] `rclone check` → **0 fark, 2433 eşleşme**
- [ ] `rclone size r2:villa-images` → 2433 / ~394 MB (SQL count ile eşit)
- [ ] 5+ rastgele relative path → `cdn.villayagel.com/<path>` **HTTP 200 + image/webp**
- [ ] R2 bucket + `cdn.villayagel.com` **public read** doğru (private kalmamış)
- [ ] R2 object key'leri **bucket adı içermeyen** path (yani `villas/...`, `villa-images/villas/...` DEĞİL) — cdn kök eşlemesiyle uyumlu
- [ ] DB doğrulaması: `full_url = 0` hâlâ geçerli (yeni FULL-URL satır eklenmemiş)
- [ ] `next.config` R2 host eklenmesi **planlanmış** (switch anında `next/image` için gerekli — ama bu turda yapılmıyor)
- [ ] `villa-zip` route'unun R2 URL ile çalışacağı **not edilmiş** (switch fazında ele alınacak)
- [ ] Cutover öncesi **son artımlı `rclone copy`** (kopya↔switch arası yeni upload'ları yakalamak için)

---

## 6) ROLLBACK PLANI

Bu aşama **non-destructive** olduğu için rollback trivial:

| Senaryo | Aksiyon |
|---------|---------|
| Kopya yarıda kaldı / şüpheli | Hiçbir şey yapma — kaynak Supabase **dokunulmadı**, üretim hâlâ Supabase'den servis ediyor. Komutu tekrar çalıştır veya R2 bucket'ı boşaltıp baştan kopyala. |
| R2'de yanlış path/yapı oluştu | `rclone delete r2:villa-images` (yalnız **R2** hedefini temizle — kaynağa dokunmaz) → config düzelt → yeniden `copy`. |
| Doğrulama (`check`) fark gösterdi | Eksikleri `rclone copy` ile tamamla; tekrar `check`. |
| Tamamen vazgeçildi | R2 bucket'ı sil/boşalt. **Üretim etkilenmez** çünkü provider hâlâ Supabase; DB hâlâ relative path → Supabase `getPublicUrl`. |

**Kritik güvence:** Provider switch yapılmadığı sürece üretim **%100 Supabase'den** servis eder. Bu kopya yalnız R2'yi doldurur; canlı trafiğe sıfır etki. Geri dönüş = "R2'yi yok say".

---

## ÖZET AKIŞ
```
1. Supabase S3 keys üret (Dashboard → Storage → S3 Connection)
2. rclone kur + 2 remote tanımla (supabase, r2)
3. rclone lsd/size ile bağlantı testi
4. rclone copy --dry-run  → planı gör
5. rclone copy --checksum → 2433 dosyayı R2'ye kopyala (path 1:1)
6. rclone check --checksum → 0 fark doğrula
7. cdn.villayagel.com/<path> → HTTP 200 spot-check
8. (Switch AYRI faz — bu turda YOK)
```

*Bu rapor yalnız plandır; hiçbir app kodu, dosya, DB veya yapılandırma değiştirilmemiştir. Tüm `rclone` komutları kaynağa salt-okunurdur (`copy`, asla `sync`/`move`).*
