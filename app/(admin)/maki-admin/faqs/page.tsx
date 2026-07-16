"use client";

import { useEffect, useState } from "react";
import { Plus, X, HelpCircle, Loader2, Sparkles } from "lucide-react";

import {
  getFaqsForAdminAction as getFaqsForAdmin,
  replaceFaqsAction as replaceFaqs,
} from "./faqs.action";
import type { FaqInput } from "@/app/services/faq.service";
import { revalidateFaqs } from "@/app/services/revalidate.actions";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ /maki-admin/faqs — Global FAQ admin page (Faz 25)
   ===============================================================
   Site geneli SSS yönetimi. Pattern: villa-form repeater UI feel
   ile uyumlu, ama tek sayfada tam liste (wizard step yok).

   SAVE FLOW (replace-all):
     replaceFaqs(items) → DELETE all + bulk INSERT
     Sonra revalidateFaqs() → "faqs" cache tag invalidate.
     Homepage FAQ section anlık güncellenir.

   UI HARDENING:
     - Max 15 satır (UI'da disable + service-side guard)
     - Boş satırlar service'te otomatik filtre (save → drop)
     - Textarea autosize (CSS resize-y; admin manuel uzatabilir)
     - Sticky save bar yok (bu sayfa tek section; standart action bar)

   DOKUNULMAYAN:
     - villa services, reservation flow, BookingSidebar, map,
       admin sidebar, layout, auth — sıfır coupling
   =============================================================== */

const MAX_FAQS = 15;

type FaqRow = { question: string; answer: string };

export default function FaqsAdminPage() {
  const toast = useNotify();
  const [items, setItems] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Initial load */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getFaqsForAdmin();
      if (cancelled) return;
      /* Boş tabloda 1 placeholder row aç (admin doğrudan yazsın). */
      setItems(
        data.length > 0
          ? data.map((d) => ({ question: d.question, answer: d.answer }))
          : [{ question: "", answer: "" }]
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (idx: number, key: "question" | "answer", value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    if (items.length >= MAX_FAQS) {
      toast.info(`En fazla ${MAX_FAQS} SSS ekleyebilirsin.`, {
        id: "faq-max",
      });
      return;
    }
    setItems((prev) => [...prev, { question: "", answer: "" }]);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: FaqInput[] = items.map((i) => ({
      question: i.question,
      answer: i.answer,
    }));
    const result = await replaceFaqs(payload);
    if (!result.ok) {
      toast.error(result.error || "SSS kaydedilemedi.", { id: "faq-save" });
      setSaving(false);
      return;
    }
    /* Cache invalidate — homepage anlık günceller. */
    await revalidateFaqs();
    toast.success("SSS güncellendi.", { id: "faq-save" });
    setSaving(false);
  };

  const filledCount = items.filter(
    (i) => i.question.trim() && i.answer.trim()
  ).length;
  const atMax = items.length >= MAX_FAQS;

  return (
    <div className="space-y-8">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">İçerik</p>
          <h1 className="admin-page-header__title">Sık Sorulan Sorular</h1>
          <p className="admin-page-header__sub">
            Site geneli (villa-bağımsız) SSS yönetimi. Anasayfada accordion
            olarak render edilir; SEO için FAQPage structured data otomatik
            yayınlanır.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="admin-btn-primary"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </header>

      {/* CONTENT */}
      {loading ? (
        <div className="admin-card-flat p-12 text-center text-sm text-[var(--admin-muted)]">
          <Loader2 size={18} className="animate-spin inline-block mr-2" />
          Yükleniyor…
        </div>
      ) : (
        <>
          {/* META INFO BAR */}
          <div className="flex items-center justify-between text-[12px] text-[var(--admin-muted)] flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle size={13} />
              <span className="tabular-nums">{filledCount}</span> /{" "}
              <span className="tabular-nums">{items.length}</span> aktif soru
              <span className="text-[var(--admin-muted-2)] ml-1">
                (max {MAX_FAQS})
              </span>
            </span>
            <span className="text-[var(--admin-muted-2)]">
              Boş satırlar kaydedilmez.
            </span>
          </div>

          {/* REPEATER */}
          <div className="space-y-3">
            {items.map((row, idx) => (
              <div
                key={idx}
                className="
                  group rounded-2xl border border-[var(--admin-border)]
                  bg-white px-4 py-4 md:px-5 md:py-5
                  hover:border-[var(--admin-border-strong)]
                  transition-colors motion-reduce:transition-none
                "
              >
                <div className="flex items-start gap-3">
                  <span
                    className="
                      w-7 h-7 shrink-0 rounded-lg
                      bg-[var(--admin-bg-soft)]
                      border border-[var(--admin-border)]
                      flex items-center justify-center
                      text-[11px] font-semibold text-[var(--admin-muted)]
                      tabular-nums mt-0.5
                    "
                    aria-hidden
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted-2)]">
                        Soru
                      </label>
                      <input
                        type="text"
                        value={row.question}
                        onChange={(e) =>
                          updateRow(idx, "question", e.target.value)
                        }
                        placeholder="Örn: Rezervasyon nasıl yapılır?"
                        className="input w-full"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted-2)]">
                        Cevap
                      </label>
                      <textarea
                        value={row.answer}
                        onChange={(e) =>
                          updateRow(idx, "answer", e.target.value)
                        }
                        placeholder="Cevabı buraya yazın…"
                        className="input w-full !rounded-xl !p-3 min-h-[90px] resize-y leading-relaxed text-[13.5px]"
                        rows={3}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="
                      w-9 h-9 shrink-0 flex items-center justify-center
                      rounded-lg text-[var(--admin-muted-2)]
                      hover:text-rose-500 hover:bg-rose-50
                      transition-colors motion-reduce:transition-none
                    "
                    aria-label={`Soru ${idx + 1}'i sil`}
                    title="Sil"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ADD BUTTON */}
          <button
            type="button"
            onClick={addRow}
            disabled={atMax}
            className="
              w-full border border-dashed border-[var(--admin-border)]
              rounded-2xl py-3.5 text-sm
              text-[var(--admin-muted)]
              hover:bg-[var(--admin-bg-soft)]
              hover:border-[var(--admin-border-strong)]
              hover:text-[var(--admin-text)]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors motion-reduce:transition-none
              inline-flex items-center justify-center gap-2
            "
          >
            <Plus size={14} />
            {atMax
              ? `Maksimum ${MAX_FAQS} SSS limiti doldu`
              : "Yeni Soru Ekle"}
          </button>

          {/* HINT */}
          <p className="text-[11.5px] text-[var(--admin-muted-2)] leading-relaxed max-w-2xl">
            SSS'ler anasayfada accordion olarak gösterilir. Aynı anda yalnız
            bir soru açık kalır. Boş bıraktığın satırlar kaydedilmez. Sıra
            burada üstten alta — kullanıcılar bu sırayla görür.
          </p>
        </>
      )}
    </div>
  );
}
