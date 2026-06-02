"use client";

import { useEffect, useState } from "react";
import {
  getVillaFeatures,
  addVillaFeature,
  updateVillaFeature,
  deleteVillaFeature,
} from "@/app/services/villa-feature.service";
import { Plus, Save, Trash2, Sparkles } from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

export default function FeaturesPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [features, setFeatures] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const data = await getVillaFeatures();
    setFeatures(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!name) return;
    setLoading(true);
    const ok = await addVillaFeature(name);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "feature-create" });
      setLoading(false);
      return;
    }
    setName("");
    await load();
    setLoading(false);
    toast.success("Olanak eklendi", { id: "feature-create" });
  }

  async function handleUpdate(id: string, newName: string) {
    const ok = await updateVillaFeature(id, newName);
    if (!ok) {
      toast.error("Güncellenemedi", { id: `feature-update-${id}` });
      return;
    }
    load();
    toast.success("Olanak güncellendi", { id: `feature-update-${id}` });
  }

  async function handleDelete(id: string) {
    const proceed = await confirm({
      title: "Olanak silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deleteVillaFeature(id);
    if (!ok) {
      toast.error("Silinemedi", { id: `feature-delete-${id}` });
      return;
    }
    load();
    toast.success("Olanak silindi", { id: `feature-delete-${id}` });
  }

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Yönetim</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Villa olanakları
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Villa detayında &ldquo;Özellikler&rdquo; listesi olarak gösterilir.
        </p>
      </div>

      <div className="card-premium p-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Özellik adı (Örn: Havuzlu)"
          className="input flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !name}
          className="btn-primary"
        >
          <Plus size={15} />
          {loading ? "Ekleniyor…" : "Ekle"}
        </button>
      </div>

      {features.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Sparkles size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz özellik eklenmemiş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarıdan ilk olanağı eklemeyi dene.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {features.map((f) => (
            <div
              key={f.id}
              className="card-premium p-3 flex items-center gap-2"
            >
              <input
                value={f.name}
                onChange={(e) => {
                  const updated = features.map((x) =>
                    x.id === f.id ? { ...x, name: e.target.value } : x
                  );
                  setFeatures(updated);
                }}
                className="input flex-1"
              />

              <button
                onClick={() => handleUpdate(f.id, f.name)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
              >
                <Save size={13} />
                Kaydet
              </button>

              <button
                onClick={() => handleDelete(f.id)}
                className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
              >
                <Trash2 size={13} />
                Sil
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
