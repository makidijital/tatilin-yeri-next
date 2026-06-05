"use client";

import { useEffect, useState } from "react";
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

import { GripVertical } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { revalidateVillas } from "@/app/services/revalidate.actions";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ VillaSortPanel — admin drag-drop sıralama (MINIMAL)
   ===============================================================
   `/maki-admin/villas/siralama` route'una bağlı client island.
   Mevcut VillaSortableGrid'in drag-drop core'u BURAYA TAŞINDI.
   `set_villa_sort_orders` RPC + adminFetch + revalidate akışı
   BİREBİR aynı.

   FARKLAR (operasyon kart'ına göre):
     - Search YOK (subset reorder global sort_order'ı bozar
       → sıralama ekranında search yapısal olarak imkansız)
     - Operasyon aksiyonları (düzenle/galeri/takvim/ZIP/Temporary
       URL/kopyala/pasifleştir/sil) YOK
     - Kapak görseli YOK
     - Fiyat / pasif badge YOK
     - Kart minimal: drag handle + villa adı + #ID + sıra no

   AMAÇ: 1000+ villa scale'inde hafif render.

   KORUNAN DAVRANIŞLAR:
     - DndContext + SortableContext + verticalListSortingStrategy
     - arrayMove + idx-based sort_order map
     - adminFetch POST /api/admin/villas/sort-orders
     - setVillaSortOrders → RPC set_villa_sort_orders
     - revalidateVillas() (tag "villas" invalidation)
     - router.refresh() (admin force-dynamic re-fetch)
     - Optimistic UI + fail revert
     - useNotify toast pattern
     - useEffect[initialVillas] state sync (router.refresh sonrası)
=============================================================== */

/* Minimal VillaItem: yalnız sıralama UI'sının okuduğu alanlar.
   Service `getVillasForAdmin` ekstra alanlar döndürür ama bu
   panel onları okumaz (tip loose `[k: string]: unknown`). */
type VillaItem = {
  id: string;
  title: string;
  sort_order?: number;
  [k: string]: unknown;
};

export default function VillaSortPanel({
  initialVillas,
}: {
  initialVillas: VillaItem[];
}) {
  const router = useRouter();
  const toast = useNotify();

  const [items, setItems] = useState<VillaItem[]>(initialVillas);
  const [persisting, setPersisting] = useState(false);

  /* Prop değişirse (router.refresh sonrası) local state'i senkronize et. */
  useEffect(() => {
    setItems(initialVillas);
  }, [initialVillas]);

  async function handleDragEnd(event: DragEndEvent) {
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

    /* 🛡️ adminFetch POST /api/admin/villas/sort-orders.
       Route içinde `setVillaSortOrders` service delege; RPC payload +
       return BYTE-IDENTICAL. Mevcut VillaSortableGrid ile aynı endpoint. */
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
       /kiralik-villalar) yeni sırayı görmesi için. */
    revalidateVillas().catch(() => {});
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)]">
        <p className="font-medium text-[var(--admin-text)]">
          Sıralanacak villa yok
        </p>
        <p className="text-[12.5px] mt-1">
          Önce{" "}
          <Link
            href="/maki-admin/villas/ekle"
            className="underline underline-offset-4 hover:text-[var(--admin-text)]"
          >
            yeni villa
          </Link>{" "}
          ekleyin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-[var(--admin-muted-2)]">
          Toplam{" "}
          <span className="font-semibold text-[var(--admin-text)]">
            {items.length}
          </span>{" "}
          villa
        </p>
        {persisting && (
          <p className="text-[12px] text-[var(--admin-muted-2)]">
            Kaydediliyor…
          </p>
        )}
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((v) => v.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {items.map((villa, index) => (
              <SortRowCard
                key={villa.id}
                villa={villa}
                index={index}
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
   SortRowCard — minimal kart: drag handle + title + #ID + sıra no
   ===============================================================
   Operasyon kart'ından bilinçli olarak SADELEŞTİRİLDİ. 1000+ villa
   scale'inde DOM'da render edilecek node sayısı düşürüldü.
=============================================================== */
function SortRowCard({
  villa,
  index,
  persisting,
}: {
  villa: VillaItem;
  index: number;
  persisting: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: villa.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={
        "admin-card p-3 flex items-center gap-3 " +
        (isDragging ? "shadow-xl z-10" : "")
      }
    >
      {/* DRAG HANDLE — tek interactive element; tüm listener'lar
         burada (operasyon kart'ı paterni ile birebir). */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Sürükle: ${villa.title} sırasını değiştir`}
        title="Sürükle: sırala"
        disabled={persisting}
        className="
          shrink-0 inline-flex items-center justify-center
          w-7 h-7 rounded-md
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

      {/* CONTENT — title + #ID */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--admin-text)] truncate">
          {villa.title}
        </p>
        <p className="text-[11.5px] text-[var(--admin-muted-2)] mt-0.5 font-mono">
          #{String(villa.id).slice(0, 8)}
        </p>
      </div>

      {/* SIRA NO — sağ tarafta, görünür index (1-based) */}
      <span
        className="shrink-0 text-[12px] text-[var(--admin-muted-2)] tabular-nums"
        title={`sort_order = ${index}`}
      >
        #{index + 1}
      </span>
    </article>
  );
}
