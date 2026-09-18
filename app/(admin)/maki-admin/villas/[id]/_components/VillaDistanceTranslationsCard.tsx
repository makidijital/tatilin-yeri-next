"use client";

/* ===============================================================
   🛡️ ADMIN — VILLA MESAFE ÇEVİRİLERİ (EN / DE)
   ===============================================================
   `villa_distance_translations` (migration 082) tablosu public EN/DE
   villa detay sayfası tarafından ZATEN okunuyordu; bu kart o tablonun
   EKSİK OLAN admin giriş yüzeyidir.

   `VillaTranslationsCard.tsx` ile BİREBİR aynı desen: kendi state'i,
   kendi save mekanizması — ana wizard "Güncelle" akışına
   (handleUpdate / buildVillaUpdatePayload / setVillaDistances) KARIŞMAZ.

   TR buradan DÜZENLENEMEZ — canonical `villa_distances.title/distance`
   satırları AYNEN kalır. Boş bırakılan alanlar public tarafta TR'ye
   fallback eder (`resolveTranslatedField`).
   =============================================================== */

import { useEffect, useState } from "react";
import { Languages, Loader2, MapPin } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadVillaDistanceTranslationsAction,
  saveVillaDistanceTranslationAction,
  type VillaDistanceRow,
} from "./villa-distance-translations.action";

type WritableLocale = "en" | "de";

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type FieldState = { title: string; distance: string };
type FormState = Record<string, Record<WritableLocale, FieldState>>;

const EMPTY_FIELD: FieldState = { title: "", distance: "" };

export default function VillaDistanceTranslationsCard({
  villaId,
}: {
  villaId: string;
}) {
  const toast = useNotify();

  const [rows, setRows] = useState<VillaDistanceRow[]>([]);
  const [forms, setForms] = useState<FormState>({});
  const [activeLocale, setActiveLocale] = useState<WritableLocale>("en");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadVillaDistanceTranslationsAction(villaId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Mesafe çevirileri yüklenemedi", {
          id: "villa-distance-translations-load",
          description: result.error,
        });
        setLoading(false);
        return;
      }

      const next: FormState = {};
      for (const row of result.rows) {
        next[row.id] = { en: { ...EMPTY_FIELD }, de: { ...EMPTY_FIELD } };
      }
      for (const t of result.translations) {
        if (t.locale !== "en" && t.locale !== "de") continue;
        if (!next[t.distance_id]) continue;
        next[t.distance_id][t.locale] = {
          title: t.title ?? "",
          distance: t.distance ?? "",
        };
      }

      setRows(result.rows);
      setForms(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villaId]);

  function setField(
    distanceId: string,
    field: keyof FieldState,
    value: string
  ) {
    setForms((prev) => ({
      ...prev,
      [distanceId]: {
        ...prev[distanceId],
        [activeLocale]: { ...prev[distanceId][activeLocale], [field]: value },
      },
    }));
  }

  async function handleSave(distanceId: string) {
    const current = forms[distanceId]?.[activeLocale];
    if (!current) return;

    setSavingId(distanceId);
    try {
      const result = await saveVillaDistanceTranslationAction({
        distanceId,
        locale: activeLocale,
        title: current.title,
        distance: current.distance,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: "villa-distance-translations-save",
          description: result.error,
        });
        return;
      }

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: "villa-distance-translations-save",
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-stone-100)] text-[var(--color-stone-700)]">
          <Languages className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">Çok Dilli İçerik</p>
          <h2 className="text-lg font-semibold text-[var(--color-stone-900)]">
            Mesafe Çevirileri (EN / DE)
          </h2>
          <p className="mt-1 text-sm text-[var(--color-stone-500)]">
            &quot;Yakındaki Noktalar&quot; bölümünde görünen başlık ve mesafe
            metinleri. Türkçe içerik buradan düzenlenemez; boş bırakılan
            alanlar public tarafta Türkçe içeriğe geri döner.
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
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-stone-500)]">
          Bu villa için henüz mesafe kaydı yok. Önce &quot;Konum&quot;
          adımından mesafe ekleyin.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const form = forms[row.id]?.[activeLocale] ?? EMPTY_FIELD;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-[var(--color-stone-100)] p-4 space-y-3"
              >
                <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--color-stone-700)]">
                  <MapPin className="h-4 w-4 text-[var(--color-stone-400)]" />
                  {row.title || "—"}
                  <span className="text-[var(--color-stone-400)] font-normal">
                    · {row.distance || "—"}
                  </span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                      Başlık
                    </label>
                    <input
                      className="input"
                      maxLength={120}
                      value={form.title}
                      onChange={(e) =>
                        setField(row.id, "title", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                      Mesafe
                    </label>
                    <input
                      className="input"
                      maxLength={60}
                      value={form.distance}
                      onChange={(e) =>
                        setField(row.id, "distance", e.target.value)
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSave(row.id)}
                  disabled={savingId === row.id}
                  className="btn-secondary disabled:opacity-60"
                >
                  {savingId === row.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Kaydediliyor…
                    </span>
                  ) : (
                    `${LOCALE_LABELS[activeLocale]} kaydet`
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
