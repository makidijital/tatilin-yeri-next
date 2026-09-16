"use client";

/* ===============================================================
   🛡️ PHASE 10E — ADMIN KONAKLAMA DÜZENİ ÇEVİRİ UI
   ===============================================================
   Oda/banyo ADLARININ EN/DE çevirilerini düzenleyen self-contained
   panel. VillaTranslationsCard.tsx (Phase 10A) ile AYNI tasarım dili
   ve AYNI prensip: kendi state'i, kendi save mekanizması — ana wizard
   "Güncelle" akışına (handleUpdate/buildVillaUpdatePayload) KARIŞMAZ.
   VillaTranslationsCard'ın KENDİSİ bu fazda DEĞİŞTİRİLMEDİ.

   TR KAYNAK SALT-OKUNUR: TR oda/banyo adları bu ekranda yalnız
   referans olarak gösterilir, input DEĞİLDİR. Oda ekleme/silme/
   sıralama YOKTUR — sıra ve sayı TR layout'un (villa.bedroom_layout,
   migration 047) aynasıdır. TR düzeni 1. adımdan (AccommodationLayoutStep)
   yönetilir.

   MULTILINGUAL GATE: `multilingual_enabled !== true` (false VEYA null)
   iken panel HİÇBİR ŞEY render etmez. Fail-safe: null = KAPALI.
   Settings okuma mekanizması İCAT EDİLMEDİ — TopBar.tsx'in ve Phase 10D
   taksonomi sayfalarının ZATEN kullandığı `getPublicSettingsAction`
   (public-safe, secret içermez, "use client"ten çağrılabilir) reuse
   edildi.

   PARTIAL SAVE: Oda ve banyo bölümlerinin AYRI "Kaydet" butonu vardır.
   Her buton YALNIZ kendi alanını gönderir; Batch 2 servisi gönderilmeyen
   kolonu payload'a HİÇ koymaz (ON CONFLICT DO UPDATE SET yalnız
   gönderilen kolonu set eder) → diğer çeviri korunur.

   GÜVENLİK: Buradan gönderilen `tr` değerlerine sunucu GÜVENMEZ —
   Batch 2 servisi yetkili TR layout'u DB'den okuyup birebir doğrular ve
   uyuşmazlıkta yazımı REDDEDER. Bu mekanizma bozulmadı.
   =============================================================== */

import { useEffect, useState } from "react";
import { BedDouble, Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { getPublicSettingsAction } from "@/app/services/settings.action";
import { normalizeLayoutTranslationEntries } from "@/lib/villa-layout-translation.helper";
import type {
  BedroomLayoutItem,
  BathroomLayoutItem,
} from "@/lib/villa-layout.helper";
import {
  loadVillaLayoutTranslationsAction,
  saveVillaLayoutTranslationAction,
} from "./villa-layout-translations.action";

type WritableLocale = "en" | "de";
type SectionKey = "bedrooms" | "bathrooms";

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type LocaleFormState = {
  bedrooms: string[];
  bathrooms: string[];
};

type Props = {
  villaId: string;
  /** TR kaynak — 1. adımdaki (AccommodationLayoutStep) canlı layout. */
  bedrooms: BedroomLayoutItem[];
  bathrooms: BathroomLayoutItem[];
};

/** Kaydedilmiş çeviri dizisini TR pozisyonlarına hizalar.
 *  ADMIN GÖRÜNÜMÜ public'ten FARKLIDIR: çeviri yoksa/uyuşmuyorsa TR'ye
 *  fallback ETMEZ, input'u BOŞ bırakır — admin neyin gerçekten
 *  çevrildiğini görmelidir. Kabul kuralı yazım tarafıyla aynıdır
 *  (uzunluk + index + TR adı); yetkili doğrulama her hâlükârda
 *  serviste yapılır. */
function extractValues(raw: unknown, trNames: string[]): string[] {
  const entries = normalizeLayoutTranslationEntries(raw);
  const aligned = entries.length === trNames.length;
  return trNames.map((tr, i) => {
    const entry = entries[i];
    if (!aligned || !entry || entry.i !== i || entry.tr !== tr) return "";
    return entry.name;
  });
}

export default function AccommodationTranslationsPanel({
  villaId,
  bedrooms,
  bathrooms,
}: Props) {
  const toast = useNotify();

  /* TR kaynak adlar — payload'da AYNEN bu değerler gider (ekranda
     gösterilen "1. Yatak Odası" numara fallback'i DEĞİL). */
  const trBedroomNames = bedrooms.map((r) => r.name);
  const trBathroomNames = bathrooms.map((b) => b.name);

  const [multilingualEnabled, setMultilingualEnabled] = useState(false);
  const [activeLocale, setActiveLocale] = useState<WritableLocale>("en");
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [forms, setForms] = useState<Record<WritableLocale, LocaleFormState>>({
    en: { bedrooms: [], bathrooms: [] },
    de: { bedrooms: [], bathrooms: [] },
  });

  /* 🛡️ multilingual_enabled — TopBar.tsx / Phase 10D taksonomi
     sayfalarıyla BİREBİR AYNI mekanik (useEffect + cancelled guard). */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const settings = await getPublicSettingsAction();
      if (cancelled) return;
      setMultilingualEnabled(!!settings?.multilingual_enabled);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadVillaLayoutTranslationsAction(villaId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: "villa-layout-translations-load",
          description: result.error,
        });
        setLoading(false);
        return;
      }

      const next: Record<WritableLocale, LocaleFormState> = {
        en: {
          bedrooms: trBedroomNames.map(() => ""),
          bathrooms: trBathroomNames.map(() => ""),
        },
        de: {
          bedrooms: trBedroomNames.map(() => ""),
          bathrooms: trBathroomNames.map(() => ""),
        },
      };
      for (const row of result.rows) {
        if (row.locale !== "en" && row.locale !== "de") continue;
        next[row.locale] = {
          bedrooms: extractValues(row.bedroom_layout, trBedroomNames),
          bathrooms: extractValues(row.bathroom_layout, trBathroomNames),
        };
      }
      setForms(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villaId]);

  function setValue(section: SectionKey, index: number, value: string) {
    setForms((prev) => {
      const current = prev[activeLocale][section];
      const nextValues = [...current];
      nextValues[index] = value;
      return {
        ...prev,
        [activeLocale]: { ...prev[activeLocale], [section]: nextValues },
      };
    });
  }

  async function handleSave(section: SectionKey) {
    const trNames = section === "bedrooms" ? trBedroomNames : trBathroomNames;
    const values = forms[activeLocale][section];

    /* `tr` AYNEN TR kaynak değeridir; sunucu bunu DB ile doğrular. */
    const payloadEntries = trNames.map((tr, i) => ({
      i,
      tr,
      name: values[i] ?? "",
    }));

    setSavingSection(section);
    try {
      const result = await saveVillaLayoutTranslationAction({
        villaId,
        locale: activeLocale,
        ...(section === "bedrooms"
          ? { bedroomLayout: payloadEntries }
          : { bathroomLayout: payloadEntries }),
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: "villa-layout-translations-save",
          description: result.error,
        });
        return;
      }

      toast.success(
        `${LOCALE_LABELS[activeLocale]} ${
          section === "bedrooms" ? "oda" : "banyo"
        } çevirileri kaydedildi`,
        { id: "villa-layout-translations-save" }
      );
    } finally {
      setSavingSection(null);
    }
  }

  if (!multilingualEnabled) return null;

  const hasBedrooms = trBedroomNames.length > 0;
  const hasBathrooms = trBathroomNames.length > 0;

  function renderSection(
    section: SectionKey,
    heading: string,
    trNames: string[],
    fallbackLabel: string
  ) {
    const values = forms[activeLocale][section];
    const isSaving = savingSection === section;

    return (
      <div className="space-y-4">
        <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
          {heading}
        </p>

        <div className="space-y-4">
          {trNames.map((trName, index) => {
            const inputId = `${section}-${activeLocale}-${index}`;
            const displayTr = trName || `${index + 1}. ${fallbackLabel}`;
            return (
              <div key={inputId}>
                <label
                  htmlFor={inputId}
                  className="block text-sm font-medium text-[var(--color-stone-700)]"
                >
                  <span className="text-[var(--color-stone-400)]">
                    {index + 1}.
                  </span>{" "}
                  {displayTr}
                </label>
                <input
                  id={inputId}
                  className="input mt-1.5"
                  maxLength={200}
                  value={values[index] ?? ""}
                  aria-label={`${displayTr} — ${LOCALE_LABELS[activeLocale]}`}
                  onChange={(e) => setValue(section, index, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleSave(section)}
          disabled={savingSection !== null}
          className="btn-primary disabled:opacity-60"
        >
          {isSaving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Kaydediliyor…
            </span>
          ) : (
            "Kaydet"
          )}
        </button>
      </div>
    );
  }

  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-stone-100)] text-[var(--color-stone-700)]">
          <BedDouble className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">Çok Dilli İçerik</p>
          <h2 className="text-lg font-semibold text-[var(--color-stone-900)]">
            Konaklama Düzeni Çevirileri
          </h2>
          <p className="mt-1 text-sm text-[var(--color-stone-500)]">
            Yalnızca oda ve banyo adları çevrilir. Türkçe adlar salt
            okunurdur; sıra ve sayı 1. adımdaki konaklama düzeninden gelir.
            Boş bırakılan alanlar public tarafta Türkçe ada geri döner.
          </p>
        </div>
      </header>

      <div className="flex gap-2">
        {(Object.keys(LOCALE_LABELS) as WritableLocale[]).map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-4 py-1.5 text-sm font-semibold text-[var(--color-stone-600)]"
            }
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor…
        </div>
      ) : !hasBedrooms && !hasBathrooms ? (
        <p className="text-sm text-[var(--color-stone-500)]">
          Bu villada konaklama düzeni girilmemiş. Önce 1. adımdan oda ve
          banyo ekleyin.
        </p>
      ) : (
        <div className="space-y-8">
          {hasBedrooms &&
            renderSection(
              "bedrooms",
              "Oda Çevirileri",
              trBedroomNames,
              "Yatak Odası"
            )}
          {hasBathrooms &&
            renderSection(
              "bathrooms",
              "Banyo Çevirileri",
              trBathroomNames,
              "Banyo"
            )}
        </div>
      )}
    </section>
  );
}
