import Section from "./shared/Section";
import ChipCheckbox from "./shared/ChipCheckbox";

import type {
  VillaRuleOption,
  VillaPriceIncludeOption,
} from "./types";

/* ===============================================================
   🔥 RulesAndIncludesStep — Wizard Adım 5 (Step 5).
   İki Section:
     - Adım 11 → Kurallar
     - Adım 12 → Fiyata Dahil Olanlar
   Pure presentational. ID listeleri parent state'inde tutulur;
   bu component sadece görüntüler ve setter'ları çağırır.
   =============================================================== */

export default function RulesAndIncludesStep({
  ruleItems,
  selectedRules,
  setSelectedRules,
  priceIncludeItems,
  selectedPriceIncludes,
  setSelectedPriceIncludes,
}: {
  ruleItems: ReadonlyArray<VillaRuleOption>;
  selectedRules: string[];
  setSelectedRules: (next: string[]) => void;
  priceIncludeItems: ReadonlyArray<VillaPriceIncludeOption>;
  selectedPriceIncludes: string[];
  setSelectedPriceIncludes: (next: string[]) => void;
}) {
  return (
    <>
      {/* RULES — Adım 11 */}
      <Section
        eyebrow="Adım 11"
        title="Kurallar"
        subtitle="Villada uygulanacak kuralları seç"
      >
        {ruleItems.length === 0 ? (
          <div className="text-sm text-[var(--color-stone-400)] border border-[var(--color-stone-100)] rounded-xl py-6 text-center italic">
            Henüz kural tanımlanmamış. Kurallar menüsünden
            ekleyebilirsin.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            {ruleItems.map((r) => {
              const isSelected = selectedRules.includes(r.id);
              return (
                <ChipCheckbox
                  key={r.id}
                  label={r.title}
                  checked={isSelected}
                  onChange={(checked) =>
                    setSelectedRules(
                      checked
                        ? [...selectedRules, r.id]
                        : selectedRules.filter((x) => x !== r.id)
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* PRICE INCLUDES — Adım 12 */}
      <Section
        eyebrow="Adım 12"
        title="Fiyata Dahil Olanlar"
        subtitle="Konaklama ücretine dahil hizmetleri seç"
      >
        {priceIncludeItems.length === 0 ? (
          <div className="text-sm text-[var(--color-stone-400)] border border-[var(--color-stone-100)] rounded-xl py-6 text-center italic">
            Henüz dahil madde tanımlanmamış. Fiyata Dahil menüsünden
            ekleyebilirsin.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            {priceIncludeItems.map((p) => {
              const isSelected = selectedPriceIncludes.includes(p.id);
              return (
                <ChipCheckbox
                  key={p.id}
                  label={p.title}
                  checked={isSelected}
                  onChange={(checked) =>
                    setSelectedPriceIncludes(
                      checked
                        ? [...selectedPriceIncludes, p.id]
                        : selectedPriceIncludes.filter(
                            (x) => x !== p.id
                          )
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
