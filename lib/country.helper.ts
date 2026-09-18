import { Country } from "country-state-city";

import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";

/* ===============================================================
   🌍 COUNTRY HELPER — display-side localization wrapper
   ===============================================================
   country-state-city library tüm ülke adlarını İngilizce döndürür
   ("Turkey", "United States", ...). Türk kullanıcıya yönelik display
   tutarlılığı için TR kodu özelinde "Türkiye" override'ı uygulanır.

   KESIN SINIRLAR (display-only contract):
     ❌ DB country code         — DOKUNULMAZ ("TR" olarak saklanır)
     ❌ Form payload / API body — DOKUNULMAZ (ISO code akar)
     ❌ Validation              — DOKUNULMAZ
     ❌ Phone input             — DOKUNULMAZ
     ❌ country-state-city kütüphane usage'ı — DOKUNULMAZ
     ✅ Sadece **görünen** text dönüşümü.

   PATTERN:
     - `getCountryLabel(iso)`       : ISO code → display ad (TR → Türkiye)
     - `findCountryByLabel(label)`  : display ad → ISO code (reverse)
       Reverse lookup, free-text input → ISO code map'i için gerekli;
       admin LocationStep ve reservation detail page'inde kullanıcı
       text yazıp ülke seçtiğinde "Türkiye" ifadesinin de TR ISO kodu
       ile eşleşmesini garanti eder.

   GENİŞLETME:
     Yeni TR-only override (ör. "GB" → "İngiltere") gerekirse
     COUNTRY_DISPLAY_OVERRIDES map'ine ekleyin; diğer kodlar
     library default'una düşmeye devam eder.
   =============================================================== */

/* TR-specific Türkçe display override.
   Sadece kullanıcının görünür text'ini etkiler; ISO code aynı kalır. */
const COUNTRY_DISPLAY_OVERRIDES: Readonly<Record<string, string>> = {
  TR: "Türkiye",
};

/* ---------------------------------------------------------------
   getCountryLabel — ISO country code → display label
   ---------------------------------------------------------------
   - TR  → "Türkiye"  (override)
   - US  → "United States" (country-state-city default)
   - boş / null / undefined → "" (UI tarafı `||` ile fallback kullanır)
   - bilinmeyen kod → ham kod (defensive — silent UI breakage YOK)
--------------------------------------------------------------- */
export function getCountryLabel(
  iso: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): string {
  if (!iso) return "";
  const code = iso.toUpperCase();

  /* 🛡️ PUBLIC ÇOKLU DİL — TR yolu BİREBİR korunur (override + library).
     `locale` verilmediğinde de DEFAULT_LOCALE = "tr" → admin, mail ve
     voucher çağıranlarının çıktısı DEĞİŞMEDİ. */
  if (locale === DEFAULT_LOCALE) {
    const override = COUNTRY_DISPLAY_OVERRIDES[code];
    if (override) return override;
    return Country.getCountryByCode(code)?.name || iso;
  }

  /* EN/DE: ülke adı platformun MEVCUT `Intl` altyapısından çözülür
     (yeni bağımlılık/veri tablosu YOK). Çözülemezse library default'una,
     o da yoksa ham koda düşer — sessiz UI kırılması yok. */
  const localized = intlRegionName(code, locale);
  return localized || Country.getCountryByCode(code)?.name || iso;
}

/** ISO 3166-1 alpha-2 → locale'e göre ülke adı. Desteklenmiyorsa "". */
function intlRegionName(code: string, locale: Locale): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  try {
    const dn = new Intl.DisplayNames([LOCALE_BCP47[locale]], {
      type: "region",
    });
    const name = dn.of(code);
    /* `of()` bilinmeyen kodda kodun kendisini döndürebilir. */
    return typeof name === "string" && name !== code ? name : "";
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------------
   findCountryByLabel — display label → country object
   ---------------------------------------------------------------
   Reverse lookup. Override map'i de aranır:
     "Türkiye" → { isoCode: "TR", name: "Turkey" }
     "Turkey"  → { isoCode: "TR", name: "Turkey" } (library)
     "Germany" → { isoCode: "DE", name: "Germany" } (library)
   Bulunamayan label için undefined döner — caller'lar mevcut
   "free-text fallback" davranışını koruyabilir.
--------------------------------------------------------------- */
export function findCountryByLabel(
  label: string
): { isoCode: string; name: string } | undefined {
  if (!label) return undefined;

  /* 1) Override map'inden ters arama. */
  for (const [iso, displayName] of Object.entries(COUNTRY_DISPLAY_OVERRIDES)) {
    if (displayName === label) {
      const c = Country.getCountryByCode(iso);
      if (c) return { isoCode: c.isoCode, name: c.name };
    }
  }

  /* 2) country-state-city default isim arama. */
  const found = Country.getAllCountries().find((c) => c.name === label);
  return found ? { isoCode: found.isoCode, name: found.name } : undefined;
}
