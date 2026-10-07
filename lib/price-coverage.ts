/* ===============================================================
   🛡️ FİYAT KAPSAMI — REZERVASYON TARİH SEÇİLEBİLİRLİĞİ (pure)
   ===============================================================
   Rezervasyon yapılabilen TÜM takvimlerin (public villa detay /
   /v/[token] / /arama modalı + admin rezervasyon oluştur/düzenle)
   ORTAK fiyat uygunluğu kuralı.

   YENİ BİR FİYAT TANIMI DEĞİLDİR — fiyat motorunun MEVCUT semantiğinin
   birebir aynısıdır (`lib/price.engine.ts`):
     • `getDailyPrice`: gün, `start_date <= gün <= end_date` (end_date
       DAHİL) olan İLK satırla eşleşir (`find`; parseLocalDate +
       normalizeDate, LOCAL gün).
     • `calculateStayTotal`: gece `!(Number(price || 0) > 0)` ise
       "fiyatsız" sayılır → 0 / null / satır yok = fiyatsız.
     • Kontrol İNDİRİMDEN ÖNCEKİ fiyata bakar → %100 indirimli gerçek
       fiyat GEÇERLİ kalır (motorla aynı).
     • Konaklama [giriş, çıkış) — çıkış günü ücretlendirilmez.
   Parite `tests/unit/price-coverage.test.ts` içinde motorun
   `calculateStayTotal(...).uncoveredNights` çıktısıyla kilitlidir.

   TAKVİM KURALI — İKİ AYRI SORU (birbirine KARIŞTIRILMAZ):
     1) "Gün takvimde açık mı?" → `isDayClosedForPrice`: günün KENDİ
        gecesi fiyatsızsa gün KAPALIDIR (check-in yapılamaz). Önceki
        gecenin fiyatlı olması günü AÇMAZ.
     2) "Seçili check-in için bu gün checkout olabilir mi?" →
        `isValidCheckoutDay`: [check-in, gün) içindeki TÜM geceler
        fiyatlıysa evet. Checkout günü fiyat GEREKTİRMEZ.
     Takvimler kapalı fiyatsız günü YALNIZ check-in seçiliyken ve 2)
     doğruysa checkout için seçilebilir kılar (örn. 30 Kas fiyatlı,
     1 Ara fiyatsız → 30 Kas seçiliyken 1 Ara checkout olabilir; 1 Ara
     check-in olarak her zaman kapalı).
   =============================================================== */

import { parseLocalDate } from "@/lib/date-format";

export type PriceCoverageRange = {
  start_date: string | null | undefined;
  end_date: string | null | undefined;
  price?: number | string | null;
};

function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** O günün GECESİ için geçerli fiyat var mı? (getDailyPrice ile aynı eşleşme) */
export function isNightPriced(
  date: Date,
  prices: ReadonlyArray<PriceCoverageRange> | null | undefined
): boolean {
  if (!Array.isArray(prices) || prices.length === 0) return false;
  const d = localDay(date);
  const found = prices.find((p) => {
    const s = parseLocalDate(p.start_date as string);
    const e = parseLocalDate(p.end_date as string);
    return d >= s && d <= e;
  });
  if (!found) return false;
  return Number(found.price || 0) > 0;
}

/** Takvimde gün (check-in olarak) kapalı mı? → kendi GECESİ fiyatsızsa. */
export function isDayClosedForPrice(
  date: Date,
  prices: ReadonlyArray<PriceCoverageRange> | null | undefined
): boolean {
  return !isNightPriced(date, prices);
}

/** [start, end) içindeki herhangi bir gece fiyatsız mı? `isExempt`
 *  verilen geceler (örn. admin düzenlemede rezervasyonun KENDİ geceleri)
 *  kontrol dışı tutulur. 0 gecelik aralık → false. */
export function rangeHasUnpricedNight(
  start: Date,
  end: Date,
  prices: ReadonlyArray<PriceCoverageRange> | null | undefined,
  isExempt?: (night: Date) => boolean
): boolean {
  const cursor = localDay(start);
  const last = localDay(end);
  while (cursor < last) {
    if (!(isExempt && isExempt(cursor)) && !isNightPriced(cursor, prices)) {
      return true;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

/** Seçili `checkIn` için `date` checkout olabilir mi? `date` check-in'den
 *  SONRA olmalı ve [checkIn, date) gecelerinin TAMAMI fiyatlı olmalı.
 *  Checkout gününün kendi gecesine BAKILMAZ (fiyatlandırılmaz). */
export function isValidCheckoutDay(
  checkIn: Date,
  date: Date,
  prices: ReadonlyArray<PriceCoverageRange> | null | undefined,
  isExempt?: (night: Date) => boolean
): boolean {
  if (localDay(date) <= localDay(checkIn)) return false;
  return !rangeHasUnpricedNight(checkIn, date, prices, isExempt);
}
