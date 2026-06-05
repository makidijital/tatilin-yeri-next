"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import {
  Image as ImageIcon,
  Pencil,
  ArrowUpRight,
  Search,
  Calendar,
} from "lucide-react";

import { VillaActions } from "../VillaActions";
import { VillaTemporaryUrlButton } from "../VillaTemporaryUrlButton";
import { VillaZipShareButton } from "../VillaZipShareButton";

/* ===============================================================
   🛡️ VillaOperationsList — admin operasyon ekranı (drag-drop YOK)
   ===============================================================
   `/maki-admin/villas` route'una bağlı client component. Eski
   VillaSortableGrid'in OPERASYONEL kısmı (search + kart + 8
   aksiyon) BURAYA TAŞINDI. Drag-drop kapasitesi
   `/maki-admin/villas/siralama` route'undaki VillaSortPanel'e
   ayrıldı.

   KORUNAN DAVRANIŞLAR (operasyon ekranı sözleşmesi):
     - Client-side search (admin-pill-search): title / location /
       slug / id üzerinde lowercase includes filter
     - Aktif/Pasif badge ile durum gösterimi
     - Cover thumbnail (mapVilla DTO images[0] reuse)
     - 8 aksiyon: Düzenle / Galeri / Takvim (quick-action query
       param) / (pasif ise) Temporary URL / ZIP Paylaş / Detay /
       Pasifleştir / Kopyala / Sil
     - VillaActions, VillaTemporaryUrlButton, VillaZipShareButton
       child island'ları AYNEN reuse
     - AUDIT log akışları (`villa.published / .unpublished /
       .deleted / .cloned`) VillaActions / clone handler'ında
       bozulmadan devam eder

   KALDIRILAN DAVRANIŞLAR (sıralama ekranına taşındı):
     - DndContext / SortableContext / useSortable / arrayMove
     - Drag handle (GripVertical button)
     - handleDragEnd + adminFetch sort-orders + RPC zincir
     - "Search aktifken drag NO-OP" guard (sıralama ekranında
       search yok → bu guard yapısal olarak gereksiz)
     - persisting state (sıralama side-effect'i)

   YENİ DAVRANIŞ: YOK. Tek değişen şey drag UI'nin kaldırılması.
=============================================================== */

type VillaItem = {
  id: string;
  title: string;
  location?: string;
  is_active?: boolean;
  /* mapVilla DTO `images: string[]` (cover-first sorted) — reuse. */
  images?: string[];
  /* slug field'ı search haystack'inde kullanılır. */
  slug?: string | null;
  [k: string]: unknown;
};

export default function VillaOperationsList({
  initialVillas,
}: {
  initialVillas: VillaItem[];
}) {
  /* 🛡️ Client-side UI search — VillaSortableGrid'den AYNEN taşındı.
     Title / bölge adı / slug / id üzerinde lowercase includes.
     URL'e dokunmaz; pagination yok (kapsam dışı). */
  const [search, setSearch] = useState<string>("");

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialVillas;
    return initialVillas.filter((v) => {
      const slug = String((v as { slug?: unknown }).slug ?? "");
      const haystack = (
        (v.title || "") +
        " " +
        (v.location || "") +
        " " +
        slug +
        " " +
        (v.id || "")
      ).toLowerCase();
      return haystack.includes(q);
    });
  }, [initialVillas, search]);

  return (
    <div className="space-y-4">
      {/* ════════ SEARCH BAR ════════
          VillaSortableGrid paterni AYNEN. URL'e dokunmaz; client-side
          filter. */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Villa adı, bölge, slug veya ID ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2">
          {visibleItems.length} villa
        </span>
      </div>

      {/* ════════ LIST ════════ */}
      <div className="flex flex-col gap-3">
        {visibleItems.map((villa) => (
          <OperationsVillaCard key={villa.id} villa={villa} />
        ))}
      </div>
    </div>
  );
}

/* ===============================================================
   OperationsVillaCard — kart: thumbnail + title + status + toolbar
   ===============================================================
   Eski VillaSortableGrid > SortableVillaCard'ın drag-handle SİZ
   versiyonu. Hover/click davranışı + 8 aksiyon byte-identical.
=============================================================== */
function OperationsVillaCard({ villa }: { villa: VillaItem }) {
  const isInactive = villa.is_active === false;
  /* Cover thumbnail: mapVilla images dizisinin ilki (is_cover öncelikli
     sort'lu). DTO'da bu shape garantili. */
  const coverImage =
    Array.isArray(villa.images) && villa.images.length > 0
      ? villa.images[0]
      : null;

  return (
    <article
      className={
        "admin-card p-3 md:p-4 flex items-start gap-3 md:gap-4 group " +
        (isInactive ? "ring-1 ring-amber-200/70 " : "")
      }
    >
      {/* THUMBNAIL */}
      <div
        className="
          shrink-0 w-24 h-20 md:w-28 md:h-24
          rounded-xl overflow-hidden
          bg-[var(--admin-bg-soft)]
          border border-[var(--admin-border)]
          flex items-center justify-center
          text-[var(--admin-muted-2)]
        "
      >
        {coverImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverImage}
            alt={villa.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={18} aria-hidden />
        )}
      </div>

      {/* CONTENT (flex-1) */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* TITLE ROW */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-[16px] md:text-[17px] text-[var(--admin-text)] tracking-[-0.015em] leading-tight truncate">
                {villa.title}
              </h3>
              {isInactive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-amber-500"
                  />
                  Pasif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  />
                  Aktif
                </span>
              )}
            </div>
            <p className="text-[12px] text-[var(--admin-muted-2)] mt-0.5 truncate">
              {villa.location || "—"}
              <span className="mx-1.5 text-[var(--admin-border-strong)]">·</span>
              <span className="font-mono">#{String(villa.id).slice(0, 4)}</span>
            </p>
          </div>
        </div>

        {/* ACTION TOOLBAR — mobile: wrap; desktop: single row.
           VillaSortableGrid L369-457 paterni AYNEN; tek fark `persisting`
           prop'unun olmaması (drag side-effect kaldırıldı, persist YOK). */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link
            href={`/maki-admin/villas/${villa.id}`}
            className="admin-btn-ghost"
          >
            <Pencil size={13} />
            Düzenle
          </Link>

          <Link
            href={`/maki-admin/villas/${villa.id}/galeri`}
            className="admin-btn-primary"
          >
            <ImageIcon size={13} />
            Galeri
          </Link>

          {/* 🛡️ TAKVİM — quick-action: manuel rezervasyon ekranına
             villa pre-select query param'ı ile yönlendirir. */}
          <Link
            href={`/maki-admin/manual-reservations/ekle?villa=${encodeURIComponent(
              String(villa.id)
            )}`}
            className="admin-btn-ghost"
            title="Bu villa için takvimi aç ve yeni blok ekle"
          >
            <Calendar size={13} />
            Takvim
          </Link>

          {/* 🛡️ Temporary URL — SADECE PASİF villalarda. */}
          {isInactive && (
            <VillaTemporaryUrlButton
              villaId={String(villa.id)}
              villaTitle={String(villa.title || "Villa")}
            />
          )}

          {/* 🛡️ ZIP Paylaş — tüm villalarda görünür. */}
          <VillaZipShareButton
            villaId={String(villa.id)}
            villaTitle={String(villa.title || "Villa")}
          />

          <Link
            href={`/maki-admin/villas/${villa.id}`}
            className="
              inline-flex items-center gap-1
              px-2.5 py-1.5 rounded-lg
              text-[12.5px] font-medium
              text-[var(--admin-muted)]
              hover:text-[var(--admin-text)]
              hover:bg-[var(--admin-bg-soft)]
              transition-colors motion-reduce:transition-none
            "
          >
            Detay
            <ArrowUpRight size={12} />
          </Link>

          {/* Lifecycle actions (Pasifleştir + Kopyala + Sil) — mevcut
             VillaActions client island AYNEN reuse. */}
          <div className="flex items-center gap-1.5">
            <VillaActions
              villaId={String(villa.id)}
              villaTitle={String(villa.title || "Villa")}
              initialActive={villa.is_active !== false}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
