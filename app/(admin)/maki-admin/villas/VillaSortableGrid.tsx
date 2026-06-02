"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import {
  Image as ImageIcon,
  Pencil,
  ArrowUpRight,
  GripVertical,
  Search,
} from "lucide-react";

import { VillaActions } from "./VillaActions";
import { VillaTemporaryUrlButton } from "./VillaTemporaryUrlButton";
import { VillaZipShareButton } from "./VillaZipShareButton";
/* 🛡️ FAZ 2 frontend purge — direct service import KALDIRILDI.
   Eskiden:
     import { setVillaSortOrders } from "@/app/services/villa-admin.service";
   villa-admin.service barrel'ı `hard-delete.service`'i re-export ediyor,
   o da `admin-gateway/server` (server-only) zinciri pulluyordu → client
   bundle'a server-only sızıntısı (BUILD HATA). Şimdi adminFetch (Bearer)
   ile /api/admin/villas/sort-orders POST route'u; route içinde aynı
   service delege (RPC + return shape BYTE-IDENTICAL). */
import { adminFetch } from "@/lib/admin-fetch";
import { revalidateVillas } from "@/app/services/revalidate.actions";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ VillaSortableGrid — admin drag-drop ordering
   ===============================================================
   Server component villas/page.tsx tarafından SSR'da fetch edilen
   liste prop olarak buraya gelir. Bu istemci-tarafı bileşen:
     - rectSortingStrategy ile grid drag (sm/lg/xl/2xl cols)
     - drag handle sol üst (yalnız handle drag listener'a sahip)
     - dragEnd → array index'lerini yeni sort_order olarak set RPC
       (set_villa_sort_orders, tek round-trip)
     - hata olursa optimistic state revert
     - success'te router.refresh ile public/SSR cache invalidation

   REUSE:
     - VillaActions (toggle + soft delete) tek başına client island
     - useNotify provider zaten admin layout'ta mounted
   =============================================================== */

/* VillaItem: minimum admin grid render contract. getVillasForAdmin
   DTO'sundan gelen fields — tüm villa kolonlarına gerek yok, sadece
   card render için olanlar. Loose `[k: string]: unknown` index
   imzası nedeniyle ekstra alanlar tolere edilir (forward-compat). */
type VillaItem = {
  id: string;
  title: string;
  location?: string;
  is_active?: boolean;
  sort_order?: number;
  /* 🛡️ FAZ 30 — Cover thumbnail için. mapVilla zaten DTO'da
     `images: string[]` döndürüyordu (cover-first sorted); admin
     grid'e geliyordu ama render edilmiyordu. Şimdi reuse. */
  images?: string[];
  [k: string]: unknown;
};

export default function VillaSortableGrid({
  initialVillas,
}: {
  initialVillas: VillaItem[];
}) {
  const router = useRouter();
  const toast = useNotify();

  const [items, setItems] = useState<VillaItem[]>(initialVillas);
  const [persisting, setPersisting] = useState(false);

  /* 🛡️ Client-side UI search — rezervasyonlar/villa-listesi paritesi.
     Title / bölge adı / slug / id üzerinde lowercase includes.
     `items` state TAM listeyi tutar; search yalnız görseli daraltır
     → drag-drop persistance full-list üzerinde çalışmaya devam eder. */
  const [search, setSearch] = useState<string>("");

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((v) => {
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
  }, [items, search]);

  const isSearching = search.trim().length > 0;

  /* Prop değişirse (router.refresh sonrası) local state'i senkronize et. */
  useEffect(() => {
    setItems(initialVillas);
  }, [initialVillas]);

  async function handleDragEnd(event: DragEndEvent) {
    /* 🛡️ Search aktifken yalnız subset render edilir; filtreli liste
       üzerinde reorder, full-list sort_order semantiğini bozar →
       drag persist'i bilinçli olarak no-op. Search temizlenince
       drag-drop tam listede aynen çalışır. */
    if (search.trim().length > 0) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((v) => v.id === active.id);
    const newIndex = items.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);

    /* Optimistic: önce UI'ı güncelle, sonra persist. Fail olursa revert. */
    const prev = items;
    setItems(reordered);
    setPersisting(true);

    const updates = reordered.map((v, idx) => ({
      id: String(v.id),
      sort_order: idx,
    }));

    /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villas/sort-orders.
       Route içinde `setVillaSortOrders` service delege; RPC payload +
       return BYTE-IDENTICAL. */
    let res: { ok: boolean; error?: string };
    try {
      const apiRes = await adminFetch("/api/admin/villas/sort-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      res =
        apiRes.ok && json.ok
          ? { ok: true }
          : { ok: false, error: json.error || `HTTP ${apiRes.status}` };
    } catch (err) {
      res = {
        ok: false,
        error: err instanceof Error ? err.message : "İstek başarısız",
      };
    }
    setPersisting(false);

    if (!res.ok) {
      setItems(prev);
      toast.error("Sıralama kaydedilemedi", {
        id: "villa-sort",
        description: res.error,
      });
      return;
    }

    toast.success("Sıralama güncellendi", { id: "villa-sort" });
    /* Public/SSR cache invalidation — frontend listelerin (/, /arama,
       /kiralik-villalar) yeni sırayı görmesi için.
       revalidateVillas: getCachedVillas tag invalidate.
       router.refresh: route segment cache invalidate. */
    revalidateVillas().catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* ════════ SEARCH BAR ════════
          Rezervasyonlar/Villa Listesi paritesi (admin-pill-search).
          URL'e dokunmaz; pagination yok; client-side filter. */}
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

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={visibleItems.map((v) => v.id)}
          /* 🛡️ FAZ 30 — Grid → stacked list:
             rectSortingStrategy (2D grid) → verticalListSortingStrategy
             (1D vertical column). Drag UX yatay row card'lar için doğru. */
          strategy={verticalListSortingStrategy}
        >
          {/* 🛡️ FAZ 30 — `flex flex-col gap-3` stacked list. */}
          <div className="flex flex-col gap-3">
            {visibleItems.map((villa) => (
              <SortableVillaCard
                key={villa.id}
                villa={villa}
                persisting={persisting}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/* ===============================================================
   SortableVillaCard — tek kart, drag handle sol üst
   ===============================================================
   useSortable listener'ları YALNIZ drag handle butonuna bağlı —
   Düzenle / Galeri / Detay / VillaActions linkleri normal click
   alır, drag tetiklenmez.
=============================================================== */
function SortableVillaCard({
  villa,
  persisting,
}: {
  villa: VillaItem;
  persisting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: villa.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isInactive = villa.is_active === false;
  /* 🛡️ FAZ 30 — Cover thumbnail: mapVilla images dizisinin ilki
     (is_cover öncelikli sort'lu). DTO'da bu shape garantili. */
  const coverImage =
    Array.isArray(villa.images) && villa.images.length > 0
      ? villa.images[0]
      : null;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={
        "admin-card p-3 md:p-4 flex items-start gap-3 md:gap-4 group " +
        (isInactive ? "ring-1 ring-amber-200/70 " : "") +
        (isDragging ? "shadow-xl z-10" : "")
      }
    >
      {/* ═══════════════════════════════════════════════════════
          🛡️ FAZ 30 — DRAG HANDLE (stacked list left edge)
          ═══════════════════════════════════════════════════════ */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Sürükle: villa sırasını değiştir"
        title="Sürükle: sırala"
        disabled={persisting}
        className="
          shrink-0 inline-flex items-center justify-center
          w-7 h-7 mt-1 rounded-md
          text-[var(--admin-muted-2)] hover:text-[var(--admin-text)]
          hover:bg-[var(--admin-bg-soft)]
          cursor-grab active:cursor-grabbing
          transition-colors motion-reduce:transition-none
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--admin-accent-soft,rgba(0,0,0,0.1))]
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        <GripVertical size={14} />
      </button>

      {/* ═══════════════════════════════════════════════════════
          🛡️ FAZ 30 — THUMBNAIL
          mapVilla DTO images[0] reuse — yeni image sistemi YAZILMADI.
          ═══════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════
          🛡️ FAZ 30 — CONTENT (flex-1)
          Üst: title + status badge + #ID
          Orta: location
          Alt: action toolbar (Düzenle / Galeri / Detay / Pasifleştir / Sil)
          ═══════════════════════════════════════════════════════ */}
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

        {/* ACTION TOOLBAR — mobile: wrap; desktop: single row */}
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

          {/* 🛡️ FAZ 31 + 31B — Temporary URL (private/off-market preview link).
             SADECE PASİF (is_active === false) villalarda render edilir;
             aktif villalarda DOM'a bile girmez. Pasif villa public
             listelerde gizli olduğu için Temporary URL paylaşımı
             buradan akan canonical akış.

             Client island; mevcut admin-btn-ghost styling reuse. Token
             yoksa generate edip DB'ye yazar, varsa reuse eder; her
             durumda panoya kopyalar ve premium toast döndürür. Drag
             handle persist olduğunda disable. */}
          {isInactive && (
            <VillaTemporaryUrlButton
              villaId={String(villa.id)}
              villaTitle={String(villa.title || "Villa")}
              disabled={persisting}
            />
          )}

          {/* 🛡️ ZIP Paylaş — additive client island; tüm villalarda
             (aktif/pasif) görünür. Kendi modal state'ini taşır; grid'in
             DnD/sort/CRUD akışına dokunmaz. */}
          <VillaZipShareButton
            villaId={String(villa.id)}
            villaTitle={String(villa.title || "Villa")}
            disabled={persisting}
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

          {/* Lifecycle actions (Pasifleştir + Sil) — mevcut handler'lar.
             VillaActions iç buton'larında `flex-1` + `shrink-0` var;
             local flex wrapper içinde compact toolbar item gibi render
             olur (toolbar'ı kontrolünü ele almaz). */}
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
