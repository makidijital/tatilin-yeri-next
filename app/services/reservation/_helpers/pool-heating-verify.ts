import { calculatePoolHeatingFee } from "@/lib/price.engine";
import { convertPrice } from "@/lib/currency";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 6. adım (public reservation create, SERVER RULE)
   ===============================================================
   AMAÇ:
     Server-authoritative havuz ısıtma snapshot'ı — client'ın gönderdiği
     pool heating total'a GÜVENMEZ; villanın gerçek pool_heating_fee /
     pool_heating_currency + server'ın hesapladığı nights ile YENİDEN
     üretir. Kullanıcı kuralı (verbatim):
       - selected=false                          → total=0
       - selected=true, villa fee NULL veya <=0   → total=0
       - selected=true, fee>0                     → nights × fee
     Yeni fiyat hesaplama mantığı YAZILMADI — mevcut, zaten test edilmiş
     `calculatePoolHeatingFee` (lib/price.engine.ts) + `convertPrice`
     (lib/currency.ts) compose edildi.

   ⚠️ KASITLI OLARAK `import "server-only"` YOK:
     `price-verify.ts` (bu helper'ın tek caller'ı) zaten `server-only`
     taşıyor ve zaten (bu değişiklikten ÖNCE de) vitest'te import
     edilemiyor — proje genelinde önceden var olan bir kısıt (npm
     paketi `server-only` node_modules'te yok, yalnız Next.js build'de
     kendi marker'ını sağlıyor). Bu dosya SAF/test edilebilir kalsın diye
     server-only İŞARETİ TAŞIMAZ — projenin mevcut deseniyle birebir
     (commission.ts, conflict.ts, payload-create.ts da aynı şekilde
     server-only'siz, yalnız server tarafından kullanılan saf helper'lar).

   PURE: input alır, snapshot döner. Side-effect / network / DB YOK.
=============================================================== */

export type PoolHeatingSnapshotInput = {
  nights: number;
  poolHeatingSelected: boolean;
  villaPoolHeatingFee: number | null | undefined;
  villaPoolHeatingCurrency: string | null | undefined;
  rates: Record<string, number>;
};

export type PoolHeatingSnapshot = {
  pool_heating_selected: boolean;
  original_pool_heating_total: number;
  original_pool_heating_currency: string;
  pool_heating_total_try: number;
};

export function computeAuthoritativePoolHeatingSnapshot(
  input: PoolHeatingSnapshotInput
): PoolHeatingSnapshot {
  const {
    nights,
    poolHeatingSelected,
    villaPoolHeatingFee,
    villaPoolHeatingCurrency,
    rates,
  } = input;

  const currency = villaPoolHeatingCurrency || "TRY";

  // 🔥 calculatePoolHeatingFee zaten SERVER KURALI'nı uyguluyor:
  // !selected → 0, !fee → 0, nights<=0 → 0, aksi halde nights×fee.
  const rawTotal = calculatePoolHeatingFee(
    nights,
    villaPoolHeatingFee,
    !!poolHeatingSelected
  );

  const totalTRY = convertPrice(rawTotal, currency, "TRY", rates);

  return {
    pool_heating_selected: !!poolHeatingSelected,
    original_pool_heating_total: rawTotal,
    original_pool_heating_currency: currency,
    pool_heating_total_try: totalTRY,
  };
}
