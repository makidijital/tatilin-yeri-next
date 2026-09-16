/* ===============================================================
   🛡️ VILLA LAYOUT TRANSLATION HELPER — PHASE 10E
   ===============================================================
   Oda/banyo ADI çevirilerinin (villa_translations.bedroom_layout /
   .bathroom_layout — migration 083) TR layout'a GÜVENLİ şekilde
   eşlenmesi.

   NEDEN AYRI BİR HELPER: `villa.bedroom_layout` / `.bathroom_layout`
   (migration 047) saf JSONB array'dir; oda/banyo kayıtlarının STABİL
   BİR ID'Sİ YOKTUR. Admin formu oda ekleyebilir, silebilir ve
   sıralayabilir (AccommodationLayoutStep: moveBedroom/removeBedroom,
   React key = index) — yani INDEX TEK BAŞINA GÜVENİLİR KİMLİK DEĞİLDİR.
   Ayrıca `normalizeBedroomLayout` geçersiz satırları sessizce düşürür
   ve bu normalize hem yazımda hem form HYDRATE'inde çalışır, yani
   index admin hiçbir şey yapmadan bile kayabilir.

   BU YÜZDEN: index + TR KAYNAK ADI birlikte doğrulanır. Eşleşme
   kanıtlanamıyorsa çeviri KULLANILMAZ, TR'ye fallback edilir.
   Sessizce yanlış odaya çeviri bağlamak KESİNLİKLE kabul edilmez.

   PURE & SSR-SAFE: React/DOM/DB bağımlılığı yok, dictionary bağımlılığı
   yok (o ayrı helper'da: lib/villa-layout-label.helper.ts). Server ve
   client'ta güvenle çağrılabilir.

   ⚠️ `lib/villa-layout.helper.ts` (migration 047 normalize/DB davranışı)
   bu dosyadan HİÇ DEĞİŞTİRİLMEZ — yalnız tipleri type-only import
   edilebilir (bu dosya onu import bile etmiyor; `string[]` ile çalışır,
   böylece hem bedroom hem bathroom için tek implementasyon yeter).
   =============================================================== */

/** villa_translations.{bedroom,bathroom}_layout içindeki tek kayıt.
 *  `tr` ve `name` BOŞ STRING olabilir:
 *    - `tr: ""`  → TR oda adı zaten boş (normalizeBedroomLayout, yatağı
 *                  olan isimsiz odaya izin verir) — geçerli bir durum.
 *    - `name: ""` → bu satır HENÜZ ÇEVRİLMEMİŞ (kısmi çeviri) → TR fallback. */
export type LayoutTranslationEntry = {
  i: number;
  tr: string;
  name: string;
};

export type LayoutTranslationResolution = {
  /** TR layout ile AYNI uzunlukta; her eleman gösterilecek ad.
   *  Çeviri yoksa/güvenilmiyorsa ilgili TR adı (boş olabilir — çağıran
   *  taraf kendi "N. Yatak Odası" numara fallback'ini uygular). */
  names: string[];
  /** En az bir ad çeviriden geldi mi? */
  usedTranslation: boolean;
  /** Yapısal drift veya TR ad değişikliği tespit edildi mi?
   *  (Admin UI'da "çeviriler güncellenmeli" uyarısı için.) */
  stale: boolean;
};

/** Ham JSONB değerini güvenli kayıt dizisine çevirir.
 *  Bozuk/eksik kayıtlar DÜŞÜRÜLÜR — bu, uzunluk kontrolünde yakalanır
 *  ve tüm dizinin reddedilmesine yol açar (fail-safe). */
export function normalizeLayoutTranslationEntries(
  raw: unknown
): LayoutTranslationEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LayoutTranslationEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const i = Math.floor(Number(r.i));
    if (!Number.isFinite(i) || i < 0) continue;
    if (typeof r.tr !== "string") continue;
    if (typeof r.name !== "string") continue;
    out.push({ i, tr: r.tr.trim(), name: r.name.trim() });
  }
  return out;
}

/** Admin kaydetme yolu: TR adları + girilen çeviriler → kayıt dizisi.
 *  Dizi TR layout'un POZİSYONEL AYNASIDIR (çevrilmemiş satırlar
 *  `name: ""` ile yerini korur), böylece hem kısmi çeviri mümkün olur
 *  hem de okuma tarafındaki uzunluk kontrolü anlamlı kalır.
 *  Hiç çeviri girilmemişse BOŞ dizi döner → çağıran taraf NULL yazar. */
export function buildLayoutTranslationEntries(
  trNames: readonly string[],
  translatedNames: readonly (string | null | undefined)[]
): LayoutTranslationEntry[] {
  const entries: LayoutTranslationEntry[] = [];
  let hasAny = false;
  for (let i = 0; i < trNames.length; i++) {
    const tr = (trNames[i] ?? "").trim();
    const name = (translatedNames[i] ?? "").toString().trim();
    if (name) hasAny = true;
    entries.push({ i, tr, name });
  }
  return hasAny ? entries : [];
}

/** Okuma yolu: TR adları + ham JSONB → gösterilecek adlar.
 *
 *  REDDETME KURALLARI (hepsinde TR fallback):
 *    1. dizi geçersiz/boş                      → tüm dizi reddedilir
 *    2. uzunluk ≠ TR layout uzunluğu           → tüm dizi reddedilir
 *    3. herhangi bir kaydın `i` ≠ pozisyonu    → tüm dizi reddedilir
 *    4. kaydın `tr` ≠ o anki TR adı            → YALNIZ O SATIR reddedilir
 *    5. kaydın `name` boş                      → YALNIZ O SATIR (çevrilmemiş)
 */
export function resolveLayoutTranslationNames(
  trNames: readonly string[],
  rawEntries: unknown
): LayoutTranslationResolution {
  const fallback: LayoutTranslationResolution = {
    names: trNames.map((n) => (n ?? "").trim()),
    usedTranslation: false,
    stale: false,
  };

  const entries = normalizeLayoutTranslationEntries(rawEntries);
  /* Hiç çeviri yok → "drift" DEĞİL, sadece henüz girilmemiş. */
  if (entries.length === 0) return fallback;

  /* (2) Yapısal drift: oda/banyo sayısı değişmiş. */
  if (entries.length !== trNames.length) {
    return { ...fallback, stale: true };
  }

  /* (3) Yapısal drift: index'ler pozisyonla uyuşmuyor. */
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].i !== i) {
      return { ...fallback, stale: true };
    }
  }

  const names: string[] = [];
  let usedTranslation = false;
  let stale = false;
  for (let i = 0; i < trNames.length; i++) {
    const trName = (trNames[i] ?? "").trim();
    const entry = entries[i];
    /* (4) TR adı değişmiş → bu satırın çevirisi BAYAT. */
    if (entry.tr !== trName) {
      names.push(trName);
      stale = true;
      continue;
    }
    /* (5) Henüz çevrilmemiş satır. */
    if (!entry.name) {
      names.push(trName);
      continue;
    }
    names.push(entry.name);
    usedTranslation = true;
  }

  return { names, usedTranslation, stale };
}
