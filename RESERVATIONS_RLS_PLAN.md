# reservations / manual_reservations — RLS PHASE 3 (Staged, Production-Safe)

> Hedef: bu iki tabloyu admin-only RLS altına alıp **PII sızıntısını sıfırlamak**, ama availability / arama / public booking / admin panelini **bozmadan**. Yaklaşım: önce SECURITY DEFINER RPC + app refactor, EN SON RLS.

**Üretilen SQL:**
- `db/migrations/039_availability_rpc.sql` — availability RPC'leri (önce deploy).
- `db/migrations/040_reservations_rls.sql` — admin-only RLS (EN SON deploy).

---

## 1. Mevcut Risk Analizi — hangi endpoint neden PII riski taşıyor?

Kod düzeyinde doğrulanmış erişim haritası. İki tablo da bugün **RLS-siz** → anon key ile doğrudan REST'ten `select *` mümkün (name, phone, email, total_price, commission, payload). Üç erişim sınıfı var:

**A) Public ANON availability okumaları (PII değil ama RLS açılınca KIRILIR):**
- `lib/availability.helper.ts > getBlockedVillaIds` — `/arama` (server component, anon). `reservations.select("villa_id")` + `manual.select("villa_id")`. Admin-only RLS → boş döner → dolu villalar müsait görünür.
- `app/components/villa/booking/useBookingEngine.ts` — public booking sidebar (CLIENT, anon). `reservations.select("start_date,end_date,status")` + `manual.select("start_date,end_date")`. RLS → takvim bloklamayı gösteremez.
- `lib/villa-availability.helper.ts > fetchVillaAvailability` — villa detay (server, anon). Aynı per-villa shape.
- `app/services/reservation/_helpers/conflict.ts` (createReservation fast-path, client anon) — overlap existence.

**B) Server-side ANON tam-PII okumaları (asıl PII riski + RLS açılınca KIRILIR):**
- `app/(admin)/maki-admin/page.tsx` — dashboard (server component, anon): `select("id,name,total_price,status,...")` → **PII anon ile okunuyor**.
- `app/services/analytics.service.ts`, `operations.service.ts`, `finance.service.ts` (anon) — dashboard/maki-finans server fetch.
- `app/api/mail/reservation-request/route.ts` (PUBLIC, anon) — mail için **tam reservation PII** çekiyor.
- `app/api/mail/reservation-approved|cancelled/route.ts` (Bearer-admin AMA DB'yi anon client ile okuyor).
- `app/api/mail/payment-link|payment-confirmed|bank-transfer/route.ts` (reservation.repository, anon) — PII snapshot.
- `app/lib/voucher/data.ts` (server, anon) — voucher PDF, tam PII.

> Bu B grubu **gerçek PII açığının kalbi**: anon key ile bu tablolar `select *` edilebildiği için, uygulamayı hiç ziyaret etmeden tüm müşteri verisi çekilebilir. Aynı zamanda bu kod yolları server-side anon olduğundan, RLS açılınca da kırılırlar — yani hem güvenlik hem süreklilik için service_role'e taşınmaları şart.

**C) Admin CLIENT okumaları (authenticated → RLS sonrası ÇALIŞIR, değişmez):**
- `app/(admin)/maki-admin/reservations/page.tsx`, `.../ekle/page.tsx`, `.../[id]/_effects/fetchBlockedDates.ts`, `manual-reservation.repository` admin CRUD. Hepsi tarayıcıda anon client + **authenticated admin session** → `is_active_admin()` policy ile geçer. Dokunulmaz.

---

## 2. Yeni Güvenli Mimari — RPC flow

```
❌ ESKİ
browser ─→ reservations  select *        (PII + RLS yok)
        ─→ manual_reservations select *

✅ YENİ
browser ─→ rpc get_villa_blocked_ranges(villa_id)   ─┐  SECURITY DEFINER
        ─→ rpc get_blocked_villa_ids(start,end,ids)  ─┤  (postgres owner, RLS bypass)
        ─→ rpc check_villa_availability_conflict(..) ─┘  → SADECE: villa_id / kind / status / start_date / end_date
public booking yazımı:
browser ─→ POST /api/public/reservations ─→ service_role insert (server)  → RLS bypass, .insert().select() çalışır
server (mail/voucher/dashboard) ─→ service_role read  → RLS bypass, PII server'da kalır
admin panel ─→ anon client + admin session ─→ is_active_admin() policy  → tam CRUD
```

RPC'ler **asla** name/phone/email/price/commission/payload döndürmez — yalnız `villa_id`, `kind`, `status`, `start_date`, `end_date`. Böylece PII leak ihtimali tablo erişimi seviyesinde **sıfırlanır** (anon'a tabloda hiçbir grant kalmaz).

**Neden create için RPC değil server route?** Public create payload'u ~25 tipli kolon (tarih, numeric, text[], boolean). Elle yazılan typed/jsonb insert RPC'si schema tipiyle uyuşmazsa runtime'da patlar; mevcut `buildCreateReservationPayload` zaten kanıtlanmış doğru payload üretiyor. Onu server'da service_role ile çalıştırmak hem tip-güvenli hem `.insert().select()` RLS sorununu (anon SELECT olmadan RETURNING boş döner) tamamen aşar.

---

## 3. Refactor Planı — hangi dosyalar değişecek?

**Stage 1 — Availability okuma → RPC (Group A):**

`lib/availability.helper.ts` — `getBlockedVillaIds`:
```ts
// ESKİ: 3 ayrı supabase.from(...) + getSupabaseAdmin external branch
// YENİ:
const scoped = Array.isArray(villaIds) && villaIds.length > 0 ? villaIds : null;
const { data, error } = await supabase.rpc("get_blocked_villa_ids", {
  p_start: start, p_end: end, p_villa_ids: scoped,
});
if (error) { console.error("[availability.helper] rpc:", error.message); return blocked; } // fail-soft
for (const id of (data as string[] | null) || []) if (id) blocked.add(String(id));
return blocked;
// → getSupabaseAdmin importu ve external branch kaldırılır (RPC external'ı içeriyor).
```

`app/components/villa/booking/useBookingEngine.ts` — fetch bloğu:
```ts
const { data, error } = await supabase.rpc("get_villa_blocked_ranges", { p_villa_id: villaId });
if (error) { console.error("❌ rezervasyon çekme:", error); return; }
const rows = (data || []) as Array<{kind:string; status:string|null; start_date:string; end_date:string}>;
const resvData  = rows.filter(r => r.kind === "reservation")
                      .map(r => ({ start_date: r.start_date, end_date: r.end_date, status: r.status }));
const manual    = rows.filter(r => r.kind === "manual")
                      .map(r => ({ start_date: r.start_date, end_date: r.end_date }));
// kalan pending/confirmed/manual expansion mantığı AYNEN (resvData/manual üzerinden).
```

`lib/villa-availability.helper.ts` — `fetchVillaAvailability`:
```ts
const { data } = await supabase.rpc("get_villa_blocked_ranges", { p_villa_id: villaId });
const rows = (data || []) as Array<{kind:string; status:string|null; start_date:string; end_date:string}>;
return {
  reservations: rows.filter(r => r.kind === "reservation")
                    .map(r => ({ start_date: r.start_date, end_date: r.end_date, status: r.status })) as ReservationRow[],
  manual_reservations: rows.filter(r => r.kind === "manual")
                    .map(r => ({ start_date: r.start_date, end_date: r.end_date })) as ManualReservationRow[],
};
```

`app/services/reservation/_helpers/conflict.ts` — fast-path (opsiyonel; create server'a taşındığında server-side service_role ile de yapılabilir):
```ts
export async function checkReservationConflict(window: ReservationConflictWindow): Promise<void> {
  const { data, error } = await supabase.rpc("check_villa_availability_conflict", {
    p_villa_id: window.villa_id, p_start: window.start_date, p_end: window.end_date,
  });
  if (error) { console.error("❌ Conflict error:", error.message); throw new Error("Rezervasyon kontrol hatası"); }
  if (data === true) throw new Error("Bu tarihler dolu");
}
// checkManualBlockConflict: combined RPC manual'ı zaten kapsıyor → no-op guard'a çekilir
// (orchestrator çağrısı korunur, davranış aynı: tek "Bu tarihler dolu").
```

**Stage 1 — Public CREATE → server + service_role:**
- Yeni `app/api/public/reservations/route.ts` (POST): rate-limit + `createReservation(payload)`'ı **server'da** çalıştırır; insert service_role ile (RLS bypass) → `.insert().select()` çalışır, EXCLUDE 23P01 → `mapInsertError` → `{error:"Bu tarihler dolu"}`. Yalnız `{ id, reservation_no }` döner (PII değil).
- `createReservation` zincirinde `reservation.repository.insert` (+ conflict reads) **service_role client** kullanacak şekilde server-only varyanta alınır (mevcut `mail-log.repository.server.ts` deseni: `lib/db/reservation.repository.server.ts`).
- `app/components/reservation/ReservationForm.tsx`: `await createReservation(...)` yerine `await fetch("/api/public/reservations", {method:"POST", body: JSON.stringify(payload)})`; dönüşten `created.id` aynen kullanılır.

**Stage 2 — Server-side ANON okumalar → service_role (Group B):**
Şu dosyalarda reservations/manual okuyan `import { supabase }` (anon) → server-only service_role'e çevrilir (gerekirse `.server.ts` ayrımı + `import "server-only"`):
- `app/(admin)/maki-admin/page.tsx` (server component) — dashboard recent.
- `app/services/analytics.service.ts`, `operations.service.ts`, `finance.service.ts` — server-only service_role.
- `app/api/mail/reservation-request|approved|cancelled/route.ts` — DB okumaları service_role.
- `app/api/mail/payment-link|payment-confirmed|bank-transfer/route.ts` — `reservation.repository` server okumaları service_role varyantına.
- `app/lib/voucher/data.ts` — service_role.

> Group C (admin client) dosyalarına **dokunulmaz** — authenticated admin olarak RLS'ten geçerler.

**Stage 3 — RLS:** `040_reservations_rls.sql` deploy.

---

## 4. SECURITY DEFINER RPC SQL'i

Tam dosya: **`db/migrations/039_availability_rpc.sql`**. Üç fonksiyon, hepsi `security definer` + `set search_path = pg_catalog, public` + minimum projection + `grant execute ... to anon, authenticated, service_role`:

- `get_blocked_villa_ids(p_start date, p_end date, p_villa_ids uuid[] default null) returns setof uuid` — arama; reservations(pending/confirmed) ∪ manual ∪ external(active), half-open overlap, distinct villa_id.
- `get_villa_blocked_ranges(p_villa_id uuid) returns table(kind text, status text, start_date date, end_date date)` — per-villa takvim; reservations(pending/confirmed) + manual (external HARİÇ → mevcut sidebar davranışı aynen).
- `check_villa_availability_conflict(p_villa_id uuid, p_start date, p_end date) returns boolean` — booking pre-submit fast-path.

Ayrıca overlap performans index'leri (`idx_reservations_avail` partial + `idx_manual_reservations_avail`). 039 additive — 040'tan önce güvenle deploy edilebilir.

---

## 5. reservations / manual_reservations RLS Migration SQL'i

Tam dosya: **`db/migrations/040_reservations_rls.sql`** (EN SON deploy). 038/037 ile aynı production-grade makine:

- `is_active_admin()` guard garanti (idempotent).
- Her tablo: RLS enable → `pg_policies` keşfet → **canonical-dışı tüm policy'leri sil** (dashboard/legacy/permissive/restrictive) → cleanup verify (stray=0 değilse `EXCEPTION`) → canonical `*_admin_only` (FOR ALL TO authenticated USING/CHECK `is_active_admin()`) → final verify (tam 1 policy) → NOTICE log.
- **anon için policy YOK** → SELECT/INSERT/UPDATE/DELETE hepsi deny (booking server'a, availability RPC'ye taşındığı için anon'a tabloda ihtiyaç kalmaz).
- `FORCE RLS` ve restrictive YOK → **service_role bypass korunur**.
- EXCLUDE constraint'lere dokunulmaz → double-booking garantisi aynen.
- Idempotent / transaction-safe / fail-safe / rollback-safe.

---

## 6. Riskli Edge-Case Analizi

**Concurrency / EXCLUDE constraint:** RLS, `reservations_no_overlap` / `manual_reservations_no_overlap` EXCLUDE constraint'lerini etkilemez (constraint'ler RLS'ten bağımsız katman). Atomik double-booking koruması aynen sürer. Server create service_role ile insert ederken 23P01 yine fırlar → `mapInsertError` → "Bu tarihler dolu".

**`.insert().select()` + RLS (KRİTİK):** anon SELECT policy'si olmadan PostgREST INSERT...RETURNING representation'ı RLS'e takılır → `.single()` boş/err → booking kırılırdı. Çözüm: create'i server + service_role'e taşımak (service_role RETURNING'i görür). Bu yüzden anon INSERT policy'si EKLENMEZ; create tamamen server.

**Cache / stale availability:** `/arama` `force-dynamic` (cache yok). Per-villa availability API route `no-store`. RPC'ler `stable` ama cache'lenmez (POST /rpc). Booking takvimi her mount'ta taze çeker. RLS bu davranışı değiştirmez → stale availability riski artmaz.

**Race condition (TOCTOU):** RPC conflict check ve takvim, INSERT'ten önce okur → aradaki pencerede başka rezervasyon girebilir. Bu ZATEN mevcut davranış; gerçek garanti EXCLUDE constraint. RPC'ye geçiş bu pencereyi değiştirmez (aynı SQL semantiği). Net: regresyon yok.

**Fail-soft:** `getBlockedVillaIds` RPC hatasında boş Set döner (mevcut permissive davranış aynen) → `/arama` tüm villaları gösterir, overbooking yine constraint ile engellenir.

**Admin path:** authenticated admin session ile `is_active_admin()` true → admin panel okuma/yazma aynen. Inactive/non-admin authenticated → deny (doğru).

**External calendar:** `get_blocked_villa_ids` external'ı içerir (search davranışı aynen); per-villa ranges içermez (sidebar davranışı aynen). Drift yok.

---

## 7. Deployment Sırası

1. **039 deploy** (availability + conflict RPC'leri + index'ler). Additive; hiçbir şeyi bozmaz, app henüz kullanmıyor.
2. **App Stage 1 deploy:** Group A okumaları RPC'ye + public create server route'a. Doğrula: arama tarih filtresi, villa takvimi, booking akışı RPC ile çalışıyor; create server'dan dönüyor.
3. **App Stage 2 deploy:** Group B server-anon okumaları service_role'e. Doğrula: dashboard, maki-finans, mail (request/approved/cancelled/payment/bank-transfer), voucher PDF çalışıyor.
4. **Ön-doğrulama (RLS'siz):** `reservations`/`manual_reservations`'a artık **anon** kod yolu kalmadığını grep + runtime ile teyit et (yalnız RPC + service_role + authenticated-admin).
5. **040 deploy** (admin-only RLS). Doğrula: anon SELECT boş, availability RPC çalışıyor, admin panel çalışıyor, booking çalışıyor.

> Her adım geri alınabilir. 040'a kadar hiçbir adım anon erişimini kesmez → kademeli ve güvenli.

---

## 8. Production Verification Checklist

039 sonrası:
- [ ] `select * from get_villa_blocked_ranges('<villa>')` → kind/status/tarih döner, PII yok.
- [ ] `select get_blocked_villa_ids('2026-07-01','2026-07-05',null)` → uuid listesi.
- [ ] RPC'ler anon key ile çağrılabiliyor (grant doğru).

App Stage 1/2 sonrası (RLS HENÜZ YOK):
- [ ] `/arama?start=..&end=..` dolu villaları gizliyor (RPC ile, eski davranışla aynı sonuç).
- [ ] Villa detay takvimi pending/confirmed/manual günleri doğru renkte blokluyor.
- [ ] Public booking baştan sona çalışıyor; `created.id` dönüyor; request maili gidiyor.
- [ ] Aynı tarihe ikinci booking → "Bu tarihler dolu" (EXCLUDE + mapInsertError).
- [ ] Admin dashboard, maki-finans, mail (5 tip), voucher PDF çalışıyor.
- [ ] grep: reservations/manual için kalan tek erişim = RPC + service_role + authenticated-admin (anon yok).

040 sonrası:
- [ ] anon `GET /rest/v1/reservations?select=name,phone` → `[]` (ÖNCEDEN PII dönüyordu).
- [ ] anon `GET /rest/v1/manual_reservations` → `[]`.
- [ ] availability RPC'leri anon ile hâlâ çalışıyor.
- [ ] Admin panel rezervasyon listele/oluştur/güncelle/sil çalışıyor.
- [ ] Public booking + mail + voucher + dashboard çalışıyor.
- [ ] NOTICE log: her iki tabloda RLS=true + tam 1 canonical (`*_admin_only`) policy.
- [ ] Double-booking hâlâ engelleniyor (EXCLUDE constraint).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` prod env tanımlı (server create + Group B buna bağımlı).

---

> Bu turda SQL (039 + 040) production-grade üretildi ve sözdizimi doğrulandı. App refactor (Group A + create server route + Group B) yukarıda dosya-dosya belirtildi; istersen Stage 1'i (availability RPC entegrasyonu + create server route) bir sonraki adımda uygulayıp `tsc` ile doğrulayayım.
