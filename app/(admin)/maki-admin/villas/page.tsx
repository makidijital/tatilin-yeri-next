import Link from "next/link";
import { getVillasForAdmin } from "@/app/services/villa.service";
import { Plus, Home, Trash as TrashBin } from "lucide-react";
import VillaSortableGrid from "./VillaSortableGrid";

/* 🛡️ FORCE-DYNAMIC — production statik cache problemi çözümü.
   Bu sayfa hiçbir dinamik API kullanmıyor (cookies/headers/searchParams)
   olduğu için Next.js otomatik static-eligible sayıyor ve Full Route
   Cache'e yazıyordu. Production'da villa silindikten sonra cached HTML
   servis edildiği için admin listesinden kayıp olmuyordu. `force-dynamic`
   her request'te fresh render zorunlu kılar; getVillasForAdmin() taze DB
   SELECT çalıştırır → silinen villa anında listeden kaybolur.
   Local dev (`next dev`) zaten her request fresh render yaptığı için
   etkilenmez; davranış birebir aynı kalır.
   Pattern referansı: app/(admin)/maki-admin/villa-listesi/page.tsx:33. */
export const dynamic = "force-dynamic";

export default async function VillasPage() {
  // 🛡️ Admin listing: pasif villalar dahil; soft-deleted hariç.
  const villas = await getVillasForAdmin();

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Villalar</p>
          <h1 className="admin-page-header__title">Tüm mülkler</h1>
          <p className="admin-page-header__sub">
            Toplam{" "}
            <span className="text-[var(--admin-text)] font-semibold">
              {villas.length}
            </span>{" "}
            villa kayıtlı. Buradan ekleyebilir, düzenleyebilir ve galeri
            yönetimine geçebilirsin.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link
            href="/maki-admin/villas/trash"
            className="admin-btn-ghost"
          >
            <TrashBin size={14} />
            Çöp Kutusu
          </Link>
          <Link href="/maki-admin/villas/ekle" className="admin-btn-primary">
            <Plus size={15} />
            Yeni Villa
          </Link>
        </div>
      </header>

      {/* LIST */}
      {villas.length === 0 ? (
        <div className="admin-card-flat p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center mx-auto">
            <Home size={18} className="text-[var(--admin-muted)]" />
          </div>
          <h3 className="font-display text-[22px] text-[var(--admin-text)] mt-4 tracking-[-0.015em]">
            Henüz villa eklenmemiş
          </h3>
          <p className="text-[var(--admin-muted)] text-sm mt-2 max-w-sm mx-auto">
            İlk villanı ekleyerek katalog oluşturmaya başla. Daha sonra galeri,
            fiyatlar ve özellikler ekleyebilirsin.
          </p>
          <Link
            href="/maki-admin/villas/ekle"
            className="admin-btn-primary mt-6 inline-flex"
          >
            <Plus size={15} />
            Villa Ekle
          </Link>
        </div>
      ) : (
        /* 🛡️ Drag-drop ordering — VillaSortableGrid client island.
           Card UI birebir aynı; sadece sol üstte drag handle + sortable
           wrapping eklendi. Persist tek RPC round-trip
           (set_villa_sort_orders), public listeleri router.refresh
           ile invalidate eder. */
        <VillaSortableGrid initialVillas={villas} />
      )}
    </div>
  );
}
