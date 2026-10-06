/* ===============================================================
   🛡️ iCAL GEÇMİŞ EVENT KURALI (pure, no IO)
   ===============================================================
   KURAL: Bugünden önce BİTMİŞ iCal event'i sisteme alınmaz ve DB'de
   tutulmaz.

     end_date <  today  → GEÇMİŞ (import edilmez / DB'den silinir)
     end_date >= today  → import edilir

   • `end_date` iCal DTEND'den gelir ve EXCLUSIVE (çıkış günü) —
     parser semantiği DEĞİŞMEDİ. Bugün çıkışı olan event
     (end_date === today) KORUNUR; filtre start_date'e BAKMAZ.
   • `today` = Europe/Istanbul TAKVİM günü ("YYYY-MM-DD"). Mevcut
     villa-prices-cleanup / villa-discounts-cleanup cron'larıyla BİREBİR
     aynı yöntem (`toLocaleDateString("en-CA", { timeZone })`). Sunucu
     UTC'de çalışsa bile TR gece yarısından sonra doğru gün döner →
     bugün biten event bir gün erken silinmez.
   • Karşılaştırma "YYYY-MM-DD" string'i üzerinden (lexicographic ==
     kronolojik); Date/UTC drift YOK.
   =============================================================== */

export const EXTERNAL_CALENDAR_TIMEZONE = "Europe/Istanbul";

/** Europe/Istanbul takvim günü — "YYYY-MM-DD". */
export function getExternalCalendarToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", {
    timeZone: EXTERNAL_CALENDAR_TIMEZONE,
  });
}

/** Bugünden önce bitmiş mi? (`end_date` exclusive; `end_date < today`). */
export function isPastExternalEvent(endDate: string, today: string): boolean {
  return endDate < today;
}
