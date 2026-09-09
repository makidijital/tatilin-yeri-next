/* ===============================================================
   📦 Reservation Detail — MisafirBilgisiCard (presentational wrapper)
   ===============================================================
   🛡️ UI/yerleşim turu — YENİ dosya. Daha önce PersonalInfoCard.tsx
   ("Kişisel bilgiler") + LocationCard.tsx ("Konum bilgisi") olarak
   2 ayrı, yalnızca wizard'ın 1. adımında (currentStep === 1) görünen
   kart olarak render ediliyordu. Bu component o İKİ kartın alanlarını
   TEK, her zaman görünür "Misafir Bilgisi" kartında birleştirir.

   ⚠️ SIFIR LOGIC DEĞİŞİKLİĞİ:
     - Alan listesi (name/phone/email/identity_number/city/country/
       address) PersonalInfoCard.tsx + LocationCard.tsx'ten BİREBİR
       aynı şekilde kopyalandı — hiçbir alan eklenmedi/çıkarılmadı.
     - onChange handler'ları (setData functional update) BİREBİR AYNI.
     - city/country select'lerin "önce ülke seç" disabled davranışı
       ve seçenek sırası (city select üstte, country select altta)
       LocationCard.tsx'teki mevcut JSX sırasıyla AYNI korundu.
     - getCountryLabel importu LocationCard.tsx'ten AYNI şekilde
       kullanılıyor.
     - Veri kaynağı (data/setData, countryOptions/cityOptions —
       page.tsx'teki mevcut useMemo'lardan gelir) DEĞİŞMEDİ.

   Tasarım: Section wrapper (= "Fiyat bilgisi" kartıyla AYNI beyaz
   card-premium, border/shadow/radius) + 2 sütunlu kompakt grid
   (mobilde 1 sütuna düşer — grid-cols-1 md:grid-cols-2).
=============================================================== */

import { getCountryLabel } from "@/lib/country.helper";
import Section from "./Section";
import Label from "./Label";

export default function MisafirBilgisiCard({
  data,
  setData,
  countryOptions,
  cityOptions,
}: {
  data: Record<string, any>;
  setData: (updater: (prev: any) => any) => void;
  countryOptions: ReadonlyArray<{ isoCode: string; name: string }>;
  cityOptions: ReadonlyArray<{ isoCode: string; name: string }>;
}) {
  return (
    <Section
      eyebrow="Bilgiler"
      title="Misafir Bilgisi"
      subtitle="İletişim, kimlik ve konum bilgileri"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PersonalInfoCard.tsx ile BİREBİR AYNI alanlar/handler. */}
        {[
          { key: "name", label: "Ad Soyad" },
          { key: "phone", label: "Telefon" },
          { key: "email", label: "E-posta" },
          { key: "identity_number", label: "TC / Pasaport" },
        ].map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label>{field.label}</Label>
            <input
              value={data[field.key] || ""}
              onChange={(e) =>
                setData((prev) => ({
                  ...prev,
                  [field.key]: e.target.value,
                }))
              }
              className="input"
            />
          </div>
        ))}

        {/* LocationCard.tsx ile BİREBİR AYNI alanlar/handler/sıra
            (şehir select'i ülke seçilene kadar disabled — mevcut
            davranış korunuyor). */}
        <div className="space-y-1.5">
          <Label>Şehir</Label>
          <select
            value={data.city || ""}
            onChange={(e) =>
              setData((prev) => ({ ...prev, city: e.target.value }))
            }
            disabled={!data.country}
            className="input disabled:opacity-60"
          >
            <option value="">
              {data.country ? "Şehir seç" : "Önce ülke seç"}
            </option>
            {cityOptions.map((c) => (
              <option key={c.isoCode} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Ülke</Label>
          <select
            value={data.country || ""}
            onChange={(e) => {
              const next = e.target.value;
              setData((prev) => ({ ...prev, country: next, city: "" }));
            }}
            className="input"
          >
            <option value="">Ülke seç</option>
            {countryOptions.map((c) => (
              <option key={c.isoCode} value={c.isoCode}>
                {getCountryLabel(c.isoCode)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label>Adres</Label>
          <input
            placeholder="Adres"
            value={data.address || ""}
            onChange={(e) =>
              setData((prev) => ({ ...prev, address: e.target.value }))
            }
            className="input"
          />
        </div>
      </div>
    </Section>
  );
}
