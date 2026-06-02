import Section from "./shared/Section";
import PoolBlock from "./shared/PoolBlock";
import PoolSizeRow from "./shared/PoolSizeRow";
import ChipCheckbox from "./shared/ChipCheckbox";

import type {
  VillaFormShape,
  VillaFormSetter,
  VillaTypeOption,
  VillaFeatureOption,
} from "./types";

/* ===============================================================
   🔥 AmenitiesStep — Wizard Adım 2 (Step 2).
   Üç Section:
     - Adım 3 → Havuz bilgileri
     - Adım 5 → Villa tipleri
     - Adım 6 → Villa özellikleri
   Pure presentational. Tüm state page.tsx'te kalır.
   =============================================================== */

export default function AmenitiesStep({
  form,
  setForm,
  types,
  selectedTypes,
  setSelectedTypes,
  features,
  selectedFeatures,
  setSelectedFeatures,
}: {
  form: VillaFormShape;
  setForm: VillaFormSetter;
  types: ReadonlyArray<VillaTypeOption>;
  selectedTypes: string[];
  setSelectedTypes: (next: string[]) => void;
  features: ReadonlyArray<VillaFeatureOption>;
  selectedFeatures: string[];
  setSelectedFeatures: (next: string[]) => void;
}) {
  return (
    <>
      {/* HAVUZ — Adım 3 */}
      <Section
        eyebrow="Adım 3"
        title="Havuz bilgileri"
        subtitle="Havuz tiplerini ve ölçülerini gir"
      >
        <div className="space-y-6">
          <PoolBlock title="Yüzme havuzu">
            <select
              value={form.pool_type || ""}
              onChange={(e) =>
                setForm({ ...form, pool_type: e.target.value })
              }
              className="input"
            >
              <option value="">Seç</option>
              <option value="ozel">Özel</option>
              <option value="ortak">Ortak</option>
              <option value="yok">Yok</option>
            </select>
            {form.pool_type && form.pool_type !== "yok" && (
              <PoolSizeRow
                values={[
                  form.pool_depth,
                  form.pool_width,
                  form.pool_length,
                ]}
                onChange={(idx, v) => {
                  const keys = [
                    "pool_depth",
                    "pool_width",
                    "pool_length",
                  ];
                  setForm({ ...form, [keys[idx]]: v });
                }}
              />
            )}
          </PoolBlock>

          <PoolBlock title="Kapalı havuz">
            <select
              value={form.indoor_pool ? "var" : "yok"}
              onChange={(e) =>
                setForm({
                  ...form,
                  indoor_pool: e.target.value === "var",
                })
              }
              className="input"
            >
              <option value="yok">Yok</option>
              <option value="var">Var</option>
            </select>
            {form.indoor_pool && (
              <PoolSizeRow
                values={[
                  form.indoor_pool_depth,
                  form.indoor_pool_width,
                  form.indoor_pool_length,
                ]}
                onChange={(idx, v) => {
                  const keys = [
                    "indoor_pool_depth",
                    "indoor_pool_width",
                    "indoor_pool_length",
                  ];
                  setForm({ ...form, [keys[idx]]: v });
                }}
              />
            )}
          </PoolBlock>

          <PoolBlock title="Çocuk havuzu">
            <select
              value={form.child_pool ? "var" : "yok"}
              onChange={(e) =>
                setForm({
                  ...form,
                  child_pool: e.target.value === "var",
                })
              }
              className="input"
            >
              <option value="yok">Yok</option>
              <option value="var">Var</option>
            </select>
            {form.child_pool && (
              <PoolSizeRow
                values={[
                  form.child_pool_depth,
                  form.child_pool_width,
                  form.child_pool_length,
                ]}
                onChange={(idx, v) => {
                  const keys = [
                    "child_pool_depth",
                    "child_pool_width",
                    "child_pool_length",
                  ];
                  setForm({ ...form, [keys[idx]]: v });
                }}
              />
            )}
          </PoolBlock>
        </div>
      </Section>

      {/* TYPES — Adım 5 */}
      <Section
        eyebrow="Adım 5"
        title="Villa tipleri"
        subtitle="Birden fazla seçim yapabilirsin"
      >
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
          {types.map((t) => {
            const isSelected = selectedTypes.includes(t.id);
            return (
              <ChipCheckbox
                key={t.id}
                label={t.name}
                checked={isSelected}
                onChange={(checked) =>
                  setSelectedTypes(
                    checked
                      ? [...selectedTypes, t.id]
                      : selectedTypes.filter((x) => x !== t.id)
                  )
                }
              />
            );
          })}
        </div>
      </Section>

      {/* FEATURES — Adım 6 */}
      <Section
        eyebrow="Adım 6"
        title="Villa özellikleri"
        subtitle="Villada bulunan olanakları seç"
      >
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
          {features.map((f) => {
            const isSelected = selectedFeatures.includes(f.id);
            return (
              <ChipCheckbox
                key={f.id}
                label={f.name}
                checked={isSelected}
                onChange={(checked) =>
                  setSelectedFeatures(
                    checked
                      ? [...selectedFeatures, f.id]
                      : selectedFeatures.filter((x) => x !== f.id)
                  )
                }
              />
            );
          })}
        </div>
      </Section>
    </>
  );
}
