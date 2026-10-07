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

   TAKVİM KURALI:
     Bir gün yalnız HEM kendi gecesi HEM önceki gecesi fiyatsızsa
     tamamen kapanır. Böylece fiyatlı sezonun ertesi günü, son gecenin
     ÇIKIŞ günü olarak seçilebilir kalır; o günden başlayan konaklama
     ise aralık kontrolünde (`rangeHasUnpricedNight`) reddedilir.
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

/** Takvimde gün tamamen kapalı mı? (kendi gecesi VE önceki gecesi fiyatsız) */
export function isDayClosedForPrice(
  date: Date,
  prices: ReadonlyArray<PriceCoverageRange> | null | undefined
): boolean {
  if (isNightPriced(date, prices)) return false;
  const prev = localDay(date);
  prev.setDate(prev.getDate() - 1);
  return !isNightPriced(prev, prices);
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
