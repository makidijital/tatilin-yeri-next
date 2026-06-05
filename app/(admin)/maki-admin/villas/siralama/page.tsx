import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getVillasForAdmin } from "@/app/services/villa.service";
import VillaSortPanel from "./_components/VillaSortPanel";

/* ===============================================================
   🛡️ ADMIN — VILLA SIRALA (drag-drop only)
   ===============================================================
   Mevcut `/maki-admin/villas` operasyon ekranından AYRILMIŞ
   drag-drop sıralama akışı. Tek sorumluluk: villa sort_order
   güncellemek. Operasyonel aksiyonlar (düzenle/galeri/takvim/
   ZIP/temporary URL/kopyala/pasifleştir/sil) burada YOK; admin
   onlar için "Mülkler" ekranına döner.

   VERI KAYNAĞI:
     `getVillasForAdmin()` — `/maki-admin/villas` ile AYNI service.
     Repository sözleşmesi DEĞİŞMEDİ; pagination YOK. Bu sayfa
     tüm aktif+pasif (soft-deleted hariç) villaları tek seferde
     fetch eder — sort_order semantiği global.

   CACHE:
     `dynamic = "force-dynamic"` — FAZ 30 pattern; mutation
     sonrası router.refresh + revalidateVillas zinciri panelden
     gelir.

   PERMISSION:
     Sidebar menüsünde `permissionKey: "villas"` reuse — yeni
     permission/role/migration YOK.
=============================================================== */

export const dynamic = "force-dynamic";

export default async function VillaSiralaPage() {
  // 🛡️ Admin listing: pasif villalar dahil; soft-deleted hariç.
  //    Bu service `/maki-admin/villas` ile birebir aynı — tek source.
  const villas = await getVillasForAdmin();

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <Link
            href="/maki-admin/villas"
            className="inline-flex items-center gap-1 text-[13px] text-[var(--admin-muted)] hover:text-[var(--admin-text)] transition"
          >
            <ChevronLeft size={14} />
            Mülkler
          </Link>
          <p className="admin-page-eyebrow mt-3">Villalar</p>
          <h1 className="admin-page-header__title">Villa Sırala</h1>
          <p className="admin-page-header__sub">
            Villaları sürükle-bırak ile sırala. Sıra anlık olarak
            kaydedilir; public site, arama ve homepage listeleri
            otomatik güncellenir. Bu ekranda yalnız sıralama yapılır
            — düzenleme / galeri / silme gibi işlemler için{" "}
            <Link
              href="/maki-admin/villas"
              className="underline decoration-dotted underline-offset-4 hover:text-[var(--admin-text)]"
            >
              Mülkler
            </Link>{" "}
            ekranına dön.
          </p>
        </div>
      </header>

      {/* PANEL — drag-drop minimal liste */}
      <VillaSortPanel initialVillas={villas} />
    </div>
  );
}
