"use client";

import { useEffect, useState } from "react";
import {
  getRuleItemsAction as getRuleItems,
  addRuleItemAction as addRuleItem,
  updateRuleItemAction as updateRuleItem,
  deleteRuleItemAction as deleteRuleItem,
} from "./rules.action";
import { Plus, Save, Trash2, ShieldCheck } from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

export default function RulesPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [rules, setRules] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const data = await getRuleItems();
    setRules(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!name) return;
    setLoading(true);
    const ok = await addRuleItem(name);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "rule-create" });
      setLoading(false);
      return;
    }
    setName("");
    await load();
    setLoading(false);
    toast.success("Kural eklendi", { id: "rule-create" });
  }

  async function handleUpdate(id: string, newName: string) {
    const ok = await updateRuleItem(id, newName);
    if (!ok) {
      toast.error("Güncellenemedi", { id: `rule-update-${id}` });
      return;
    }
    load();
    toast.success("Kural güncellendi", { id: `rule-update-${id}` });
  }

  async function handleDelete(id: string) {
    const proceed = await confirm({
      title: "Kural silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deleteRuleItem(id);
    if (!ok) {
      toast.error("Silinemedi", { id: `rule-delete-${id}` });
      return;
    }
    load();
    toast.success("Kural silindi", { id: `rule-delete-${id}` });
  }

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Yönetim</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Villa kuralları
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Villa detayında &ldquo;Kurallar&rdquo; listesi olarak gösterilir.
        </p>
      </div>

      <div className="card-premium p-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kural adı (Örn: Sigara içilmez)"
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

      {rules.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <ShieldCheck
              size={16}
              className="text-[var(--color-champagne-700)]"
            />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz kural eklenmemiş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarıdan ilk kuralı eklemeyi dene.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rules.map((r) => (
            <div
              key={r.id}
              className="card-premium p-3 flex items-center gap-2"
            >
              <input
                value={r.title}
                onChange={(e) => {
                  const updated = rules.map((x) =>
                    x.id === r.id
                      ? { ...x, title: e.target.value }
                      : x
                  );
                  setRules(updated);
                }}
                className="input flex-1"
              />

              <button
                onClick={() => handleUpdate(r.id, r.title)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
              >
                <Save size={13} />
                Kaydet
              </button>

              <button
                onClick={() => handleDelete(r.id)}
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
