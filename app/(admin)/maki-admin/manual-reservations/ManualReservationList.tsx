"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deleteManualReservation } from "@/app/services/manualReservation.service";
import {
  Calendar,
  Trash2,
  CalendarRange,
  Pencil,
  ArrowRight,
  Search,
} from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";

/* 🛡️ FAZ 29 — formatDateTr + calculateNights reuse.
   Mevcut helper'lar; yeni math/format YAZILMADI. */
import { formatDateTr } from "@/lib/date-format";
import { calculateNights } from "@/lib/price.engine";

export default function ManualReservationList({ initialData }: any) {
  const toast = useNotify();
  const confirm = useConfirm();
  const [data, setData] = useState(initialData || []);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  /* 🛡️ Client-side UI search — rezervasyonlar paritesi.
     Aranan alanlar: villa.title, id (rezervasyon kodu/id), note (açıklama),
     ve defansif olarak name/phone (manual_reservations şemasında yok ama
     ileride eklenirse otomatik kapsanır; yoksa boş string → no-op). */
  const [search, setSearch] = useState<string>("");
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).filter((it) => {
      const haystack = (
        (it?.villa?.title || "") +
        " " +
        (it?.id || "") +
        " " +
        (it?.note || "") +
        " " +
        (it?.name || "") +
        " " +
        (it?.phone || "")
      ).toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Blok silinsin mi?",
      description: "Seçili manuel blok kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;
    /* 🛡️ FAZ 55J-3 — BEFORE snapshot from list state. */
    const before = data.find((x: any) => x.id === id) || null;
    try {
      setLoadingId(id);
      /* FAZ 34: DB I/O service'e delege; service repository'ye delege.
         Davranış BYTE-IDENTICAL — error throw + audit log + toast
         + UI state component'te kalır (UI concerns). */
      await deleteManualReservation(id);
      setData((prev: any) => prev.filter((x: any) => x.id !== id));
      toast.success("Blok silindi", { id: `manual-blok-delete-${id}` });
      /* AUDIT LOG (fail-safe). */
      logActivity({
        action: "manual_reservation.deleted",
        entity_type: "manual_reservation",
        entity_id: id,
        entity_title: before
          ? `${before.start_date} → ${before.end_date}`
          : "Manuel blok",
        before_data: before
          ? {
              id: before.id,
              villa_id: before.villa_id,
              start_date: before.start_date,
              end_date: before.end_date,
              note: before.note,
            }
          : null,
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error("Silinemedi", { id: `manual-blok-delete-${id}` });
    } finally {
      setLoadingId(null);
    }
  };

  if (data.length === 0) {
    return (
      <div className="card-premium p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
          <CalendarRange size={16} className="text-[var(--color-champagne-700)]" />
        </div>
        <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
          Henüz blok eklenmemiş
        </h3>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Tarih bloklamak için &ldquo;Yeni Blok&rdquo; butonunu kullan.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ════════ SEARCH BAR (rezervasyonlar paritesi) ════════
          Liste populated iken görünür; data tamamen boşken early-return
          empty-state'ine girilir ve bar render edilmez. */}
      <div className="admin-filter-bar mb-3">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Villa, ID, not ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2">
          {visibleItems.length} kayıt
        </span>
      </div>

    <div className="card-premium overflow-hidden divide-y divide-[var(--color-stone-100)]">
      {visibleItems.map((item: any) => {
        /* 🛡️ FAZ 29 — premium tarih format + gece hesap (reuse).
           formatDateTr: "20 Mayıs 2026" (UTC→Istanbul shift safe).
           calculateNights: 7 gece (BookingSidebar, PricingCalendarCanvas,
           ReservationCalendar ile birebir aynı). */
        const nights = calculateNights(
          item.start_date,
          item.end_date
        );

        return (
          <div
            key={item.id}
            className="flex justify-between items-center p-5 hover:bg-[var(--color-sand-50)] transition gap-4"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0 mt-0.5">
                <Calendar
                  size={14}
                  className="text-[var(--color-champagne-700)]"
                />
              </span>
              <div className="min-w-0">
                <div className="font-medium text-[var(--color-stone-900)] truncate">
                  {item.villa?.title || "-"}
                </div>
                {/* 🛡️ FAZ 29 — premium readable tarih.
                   ESKİ: 20.05.2026 → 23.05.2026
                   YENİ: 20 Mayıs 2026 → 23 Mayıs 2026 */}
                <div className="text-sm text-[var(--color-stone-700)] mt-1 inline-flex items-center gap-1.5 flex-wrap tabular-nums">
                  <span>{formatDateTr(item.start_date)}</span>
                  <ArrowRight
                    size={12}
                    className="text-[var(--color-stone-400)] shrink-0"
                    aria-hidden
                  />
                  <span>{formatDateTr(item.end_date)}</span>
                </div>
                {nights > 0 && (
                  <div className="text-[11px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
                    {nights} gece
                  </div>
                )}
                {item.note && (
                  <div className="text-[11px] text-[var(--color-stone-400)] tracking-[0.04em] uppercase mt-1.5 truncate">
                    {item.note}
                  </div>
                )}
              </div>
            </div>

            {/* 🛡️ FAZ 29 — Aksiyon grubu: Düzenle + Sil */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href={`/maki-admin/manual-reservations/${item.id}`}
                className="
                  inline-flex items-center gap-1.5 text-[13px]
                  text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)]
                  px-3 py-1.5 rounded-lg
                  border border-transparent
                  hover:bg-white hover:border-[var(--color-champagne-300)]
                  transition-colors motion-reduce:transition-none
                "
                aria-label="Düzenle"
              >
                <Pencil size={13} />
                Düzenle
              </Link>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={loadingId === item.id}
                className="
                  inline-flex items-center gap-1.5 text-[13px]
                  text-red-600 hover:text-red-700
                  px-3 py-1.5 rounded-lg hover:bg-red-50
                  transition-colors motion-reduce:transition-none
                  disabled:opacity-40
                "
              >
                <Trash2 size={13} />
                {loadingId === item.id ? "Siliniyor…" : "Sil"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
