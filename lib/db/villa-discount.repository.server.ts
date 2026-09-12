import "server-only";

/* 🛡️ NATIVE-ONLY — bu repository baştan native provider ile yazıldı,
   Supabase-js bağımlılığı hiç eklenmedi (mevcut mimarideki "NATIVE
   CUTOVER" ilkesiyle tutarlı — bkz. lib/db/villa-price.repository.server.ts,
   lib/db/discount.repository.ts). `dbAdminNative` = `dbNative` (native
   runtime'da tek app rolü; anon/service-role ayrımı yok, RLS bypass —
   bkz. lib/db/native.ts doc-comment'i). */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";
import type { VillaDiscountRow } from "@/types/database";

/* ===============================================================
   🛡️ VILLA DISCOUNT — SERVER-ONLY REPOSITORY (ADIM 1 — VERİ MODELİ)
   ===============================================================
   AMAÇ:
     `villa_discounts` tablosu (migration 079) için minimal repository
     yüzeyi — yalnız READ + atomic REPLACE-ALL. `villa_prices`'ın
     kendi server repository'sinin (villa-price.repository.server.ts)
     ve admin repository'deki `rpcReplaceVillaPrices`/`findPricesByVillaId`
     metodlarının BİREBİR yapısal ikizi.

   ⚠️ KAPSAM (bilinçli sınır — bu adımda):
     - Bu dosya HİÇBİR YERDEN import edilmiyor / çağrılmıyor. Price
       engine (`lib/price.engine.ts`), rezervasyon hesaplama/snapshot
       kodları, admin/public UI — HİÇBİRİ bu repository'yi kullanmıyor.
       Bu adımın kapsamı yalnız "veri modeli hazır, tüketici YOK".
     - `villa_prices`'a ait hiçbir repository metoduna (`villaAdminRepository`
       içindeki price metodları, `villa-price.repository.server.ts`)
       dokunulmadı; bu dosya onlardan tamamen bağımsız, ayrı bir dosya.

   GÜVENLİK SINIRI (diğer .server repo'larla aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → native provider; RLS'in aksine yetki uygulama
       katmanında (bu dosyayı çağıracak service/route kendi admin
       auth kontrolünü yapmalı — henüz hiçbir caller yok).

   TARİH SEMANTİĞİ: `start_date`/`end_date` `villa_prices` ile birebir
   aynı — kapalı interval, ikisi de dahil (migration 079 doc-comment'i).
   Bu repository yalnız ham veri taşır; karşılaştırma/hesaplama mantığı
   burada YOK (sonraki adımda `lib/price.engine.ts`'e eklenecek).
=============================================================== */

export type VillaDiscountInput = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency?: string | null;
};

export const villaDiscountRepository = {
  /** READ — villa_discounts by villa_id. `findPricesByVillaId` (villa
   *  admin repository) ile aynı desen: ham satırlar, filtre/sıralama
   *  caller'da. */
  async findDiscountsByVillaId(villaId: string) {
    return await dbAdmin
      .from<VillaDiscountRow>("villa_discounts")
      .select("*")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     RPC — DISCOUNTS atomic replace (`replace_villa_discounts`,
     migration 079). `rpcReplaceVillaPrices`'in BİREBİR yapısal ikizi
     — yalnız tablo/RPC adı ve payload alanları farklı.
     ⚠️ RPC parameter shape: { p_villa_id, p_discounts jsonb }
     ⚠️ pg_advisory_xact_lock DB-level concurrent admin replace
       serileştirir — değiştirilmez.
     ⚠️ Bu metodun HENÜZ hiçbir çağıranı yok (Adım 1 kapsamı).
  =============================================================== */
  async rpcReplaceVillaDiscounts(
    villaId: string,
    payload: VillaDiscountInput[]
  ) {
    return await dbAdmin.rpc("replace_villa_discounts", {
      p_villa_id: villaId,
      p_discounts: payload,
    });
  },
};
