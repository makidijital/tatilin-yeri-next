/* ===============================================================
   🛡️ FAZ 2 — buildHeroDateLabel (PURE)
   ===============================================================
   Eski Hero.tsx içinde inline `dateLabel` ternary chain'in
   BYTE-IDENTICAL kopyası. DatePicker custom `value` prop'una
   verilen TR-locale label.

   ⚠️ KESIN KURAL:
     - `tr-TR` locale aynen.
     - `day: "numeric", month: "short"` format aynen.
     - " – " (en-dash + boşluklar) aynen.
     - Sentinel "Tarih seç" aynen (Search Panel'de
       `value === "Tarih seç" ? "" : ...` kontrolü için).
   =============================================================== */

export function buildHeroDateLabel(
  startDate: Date | null,
  endDate: Date | null
): string {
  return startDate && endDate
    ? `${startDate.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
      })} – ${endDate.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
      })}`
    : startDate
    ? startDate.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
      })
    : "Tarih seç";
}
