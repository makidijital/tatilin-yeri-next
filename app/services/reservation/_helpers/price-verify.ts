import "server-only";

import { reservationRepository } from "@/lib/db/reservation.repository";
import {
  calculateGrandTotal,
  calculateStayTotal,
  calculateNights,
  calculatePrepayment,
  accommodationBase,
  getActiveDiscount,
  type DiscountRange,
} from "@/lib/price.engine";
import { parseLocalDate } from "@/lib/date-format";
import { normalizePriceRanges } from "@/lib/villa-row.types";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getExchangeRatesMap } from "@/app/services/exchange-rate.service";
import { getPublicSettings } from "@/app/services/settings.service";
import type { ReservationCreateInput } from "../types";
/* 🛡️ HAVUZ ISITMA — 6. adım. Server-authoritative pool heating snapshot
   — SAF helper (server-only İŞARETİ YOK, bkz. dosyanın kendi doc-comment'i).
   Client'ın gönderdiği pool heating total'a GÜVENMEZ; villanın gerçek
   pool_heating_fee/currency + burada hesaplanan nights ile YENİDEN üretir. */
import { computeAuthoritativePoolHeatingSnapshot } from "./pool-heating-verify";
/* 🛡️ FAZ 3 — villa_discounts SERVER-SIDE OKUMA (public-safe read, zaten
   ADIM 1/villa detay akışında kullanılan AYNI servis — İKİNCİ bir discount
   engine/repository YOK). Fail-safe: repository hata dönerse [] döner
   (bkz. villa-discount.service.ts doc-comment'i) — recompute bu durumda
   "indirim yok" ile AYNI davranır, booking'i ASLA bloklamaz. */
import { getVillaDiscounts } from "@/app/services/villa-discount.service";

/* ===============================================================
   🛡️ PUBLIC RESERVATION — SERVER-SIDE PRICE VERIFY
   ===============================================================
   AMAÇ:
     Public booking create'te client'ın gönderdiği finansal alanlara
     (total_price / total_price_try / original_price / original_currency /
     exchange_rate / original_cleaning_fee / original_cleaning_currency /
     cleaning_fee_try / prepayment_amount / remaining_payment) kör
     güvenmeyi bırakmak. Bu helper, MEVCUT price engine'i (lib/price.engine)
     SUNUCUDA — villa_prices + villa_discounts + villa cleaning config +
     exchange rate'leri KENDİSİ okuyarak — yeniden çalıştırır.

   🛡️ FAZ 3 (bu tur) — SERVER-AUTHORITATIVE FİNANSAL ALANLAR:
     - `recomputePublicReservationPrice` artık villa_discounts'ı
       (`getVillaDiscounts`) da okur ve `calculateGrandTotal`'a `discounts`
       parametresi olarak geçirir — indirim/özel fiyat STAY hesabına
       (ve YALNIZ stay'e — cleaning/pool heating İZOLE kalır, bkz.
       lib/price.engine.ts) sunucu tarafında da uygulanır.
     - Dönen `ServerPriceResult` artık total/cleaning/prepayment/remaining
       yanında `original_price`/`original_currency`/`exchange_rate`/
       `original_cleaning_fee`/`original_cleaning_currency` için de
       authoritative değerleri taşır — `buildPublicReservationPayload.ts`
       (client) İLE BİREBİR AYNI türetme mantığı (foreign-currency ternary),
       yalnız YENİ bir hesaplama icat EDİLMEDİ, mevcut `snapshot` (TRY
       calculateGrandTotal çıktısı) üzerinden okunuyor.
     - `verifyPublicReservationPrice` bu genişletilmiş sonucu
       `authoritative` alanı olarak döner (pool heating'in `poolHeating`
       alanıyla AYNI desen) — route.ts bunu `body` üzerine YAZAR
       (createReservation'dan ÖNCE).
     - Eski COMPARE/LOG (`comparison`) DAVRANIŞI KORUNDU — artık
       discounts'ı da içerdiği için indirimli rezervasyonlarda önceden
       var olan yanlış-pozitif "drift" uyarısı da bu adımda kendiliğinden
       düzeliyor (ayrı bir fix GEREKMEDİ, aynı `discounts` parametresi
       hem authoritative hem comparison'ın kullandığı `server` sonucundan
       besleniyor).
     - discount_applied/discount_type/discount_value/discount_currency/
       original_stay_total_try/stay_discount_amount_try (migration 080)
       snapshot kolonları BU FAZDA YAZILMIYOR — yalnız server'ın discount
       bilgisine erişip DOĞRU final fiyatı hesaplayabilmesi bu fazın
       kapsamı (kalıcı snapshot persistansı SONRAKİ bir faz).

   FAIL-OPEN (DEĞİŞMEDİ): herhangi bir fetch/parse hatası → null döner;
   route loglar ve booking'i ASLA bloklamaz — bu durumda `authoritative`
   de `poolHeating` gibi null döner, route body'yi DEĞİŞTİRMEDEN bırakır
   (mevcut fail-open felsefe — pool heating precedent'iyle BİREBİR aynı).

   server-only: client bundle'a sızmaz.
   =============================================================== */

/* Rounding/drift toleransları — false-positive (rounding + meşru
   exchange-rate/price drift) gürültüsünü azaltır. Compare/log fazında
   yalnız bu eşiği AŞAN farklar "drift" sayılır. */
const TOLERANCE_TRY = 1; // ±1 TRY mutlak (float/round)
const TOLERANCE_PCT = 0.01; // ±%1 oransal (exchange/price drift)

export type ServerPriceResult = {
  totalPriceTry: number;
  cleaningFeeTry: number;
  prepaymentAmount: number;
  remainingPayment: number;
  prepaymentRate: number;
  // 🛡️ HAVUZ ISITMA — 6. adım. Server-authoritative snapshot (villanın
  // gerçek pool_heating_fee/currency + server nights ile hesaplanmış;
  // client'ın gönderdiği değerlere bağımlı DEĞİL).
  poolHeatingSelected: boolean;
  originalPoolHeatingTotal: number;
  originalPoolHeatingCurrency: string;
  poolHeatingTotalTry: number;
  // 🛡️ FAZ 3 — server-authoritative finansal alanlar (indirim-farkında).
  // `totalPrice` ve `totalPriceTry` bu kod tabanında HER ZAMAN aynı
  // sayıdır (bkz. buildPublicReservationPayload.ts: total_price =
  // snapshotTotalTRY = total_price_try) — ayrı bir "display currency
  // total" kolonu YOK; ikisi de aynı authoritative değerden türetilir.
  totalPrice: number;
  originalPrice: number;
  originalCurrency: string;
  exchangeRate: number;
  originalCleaningFee: number;
  originalCleaningCurrency: string;
  // 🛡️ FAZ 4 — İNDİRİM/ÖZEL FİYAT SNAPSHOT (migration 080). Discount
  // uygulanmadıysa (discountApplied=false) diğer 5 alan null. `stay`
  // dışındaki hiçbir bileşene (cleaning/pool heating/damage deposit)
  // dokunmaz — yalnız konaklama (stay) bileşeninden türetilir.
  discountApplied: boolean;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  discountCurrency: string | null;
  originalStayTotalTry: number | null;
  stayDiscountAmountTry: number | null;
};

/* 🛡️ FAZ 4 — bir rezervasyon tarih aralığındaki GECELERDEN en az biri
   için villa_discounts'ta aktif bir kayıt var mı, varsa HANGİSİ?
   ===============================================================
   YENİ bir discount ENGINE/hesaplama DEĞİL — `lib/price.engine.ts`'in
   ZATEN EXPORT ettiği `getActiveDiscount` (calculateStayTotal'ın
   kendi içinde HER GECE için çağırdığı AYNI saf fonksiyon) tekrar
   kullanılıyor; yalnız hangi discount kaydının eşleştiğini (miktar
   hesaplamadan) DETECT eder — computeAuthoritativePoolHeatingSnapshot'ın
   `isPoolHeatingActiveForRange`/`calculatePoolHeatingFee`'yi reuse
   etme deseniyle BİREBİR aynı yaklaşım.

   Bir rezervasyonun farklı geceleri TEORİK olarak farklı (üst üste
   binmeyen, DB EXCLUDE constraint'i zaten aynı gün için ikinci bir
   kaydı engelliyor) villa_discounts kayıtlarına denk gelebilir — bu
   durumda İLK eşleşen (en erken tarihli) gece'nin discount'u snapshot
   metadata'sı (discount_type/value/currency) olarak kullanılır.
   `original_stay_total_try`/`stay_discount_amount_try` HER ZAMAN
   TÜM gecelerin TOPLAMINDAN türetildiği için bu durumda dahi doğru
   kalır — yalnız TEK bir "discount_type/value" alanı olduğu için
   metadata bu basitleştirmeyi taşır (pratikte: bir rezervasyon
   aralığını kapsayan tek bir indirim/özel fiyat tanımı — mevcut admin
   UI akışının tipik kullanımı). */
export function detectAppliedDiscountForStay(
  start: string,
  end: string,
  discounts: DiscountRange[] | null | undefined
): DiscountRange | null {
  if (!Array.isArray(discounts) || discounts.length === 0) return null;
  if (!start || !end) return null;

  const current = parseLocalDate(start);
  const endD = parseLocalDate(end);
  if (!(current < endD)) return null;

  while (current < endD) {
    const active = getActiveDiscount(current, discounts);
    if (active) return active;
    current.setDate(current.getDate() + 1);
  }
  return null;
}

export async function recomputePublicReservationPrice(input: {
  villa_id: string;
  start_date: string;
  end_date: string;
  // 🛡️ HAVUZ ISITMA — 6. adım. Client'ın "seçtim/seçmedim" tercihi —
  // BU alan güvenilir (bir tercih, bir tutar değil); tutar HER ZAMAN
  // sunucuda villanın gerçek fee'sinden yeniden üretilir.
  pool_heating_selected?: boolean;
}): Promise<ServerPriceResult | null> {
  const { villa_id, start_date, end_date, pool_heating_selected } = input;
  if (!villa_id || !start_date || !end_date) return null;

  const [prices, ratesMap, settings, villaRes, discounts] = await Promise.all([
    getVillaPrices(villa_id),
    getExchangeRatesMap(),
    getPublicSettings(),
    reservationRepository.findVillaCleaningConfig(villa_id),
    // 🛡️ FAZ 3 — villa_discounts server-side okuma. Fail-safe: hata
    // durumunda [] döner (getVillaDiscounts'ın kendi doc-comment'i) —
    // calculateGrandTotal'a discounts:[] gitmesi "indirim yok" ile AYNI.
    getVillaDiscounts(villa_id),
  ]);

  const villaRow =
    (villaRes.data as Record<string, unknown> | null) || null;

  /* Engine `rates: Record<string, number>` bekler; getExchangeRatesMap
     `Partial<Record<"USD"|"EUR"|"GBP", number>>` döner — yapı uyumlu. */
  const rates = (ratesMap?.rates || {}) as Record<string, number>;

  const normalizedPrices = normalizePriceRanges(prices);

  const snapshot = calculateGrandTotal({
    start: start_date,
    end: end_date,
    prices: normalizedPrices,
    currency: "TRY",
    rates,
    cleaning_fee: Number(villaRow?.cleaning_fee) || 0,
    cleaning_currency:
      (villaRow?.cleaning_currency as string) || "TRY",
    cleaning_limit: Number(villaRow?.cleaning_limit) || 0,
    // 🛡️ FAZ 3 — indirim/özel fiyat katmanı, YALNIZ stay'e uygulanır
    // (cleaning/pool heating izole — bkz. lib/price.engine.ts). Client'ın
    // gönderdiği herhangi bir discount alanı YOK/OKUNMUYOR; villa_id +
    // tarih aralığından sunucunun kendi okuduğu villa_discounts kayıtları
    // kullanılır.
    discounts,
  });

  /* prepayment rate precedence — ReservationForm ile BİREBİR:
     custom_prepayment_rate (null/undefined/"" değilse) → onu kullan,
     yoksa settings.prepayment_rate (truthy ise), yoksa 20. */
  const override = villaRow?.custom_prepayment_rate;
  let prepaymentRate = 20;
  if (override !== null && override !== undefined && override !== "") {
    prepaymentRate = Number(override);
  } else if (settings?.prepayment_rate) {
    prepaymentRate = Number(settings.prepayment_rate);
  }

  /* 🛡️ HAVUZ ISITMA — 6. adım. `calculateGrandTotal` çağrısı YUKARIDA
     BİLEREK pool heating parametreleri OLMADAN bırakıldı (risk minimizasyonu
     — mevcut snapshot semantiği/davranışı hiç dokunulmadan korunuyor).
     Pool heating totali AYRI, saf helper (`computeAuthoritativePoolHeatingSnapshot`)
     ile hesaplanır ve additive olarak totale eklenir — server KURALI
     (selected=false → 0; fee NULL/<=0 → 0; aksi halde nights×fee) birebir
     bu helper içinde uygulanıyor (bkz. pool-heating-verify.ts). */
  const nights = calculateNights(start_date, end_date);

  const poolHeatingSnapshot = computeAuthoritativePoolHeatingSnapshot({
    nights,
    poolHeatingSelected: !!pool_heating_selected,
    villaPoolHeatingFee: villaRow?.pool_heating_fee as
      | number
      | null
      | undefined,
    villaPoolHeatingCurrency: villaRow?.pool_heating_currency as
      | string
      | null
      | undefined,
    rates,
    // 🛡️ Migration 076 — sezonluk ay kısıtı. Server bu tarih aralığını
    // KENDİSİ hesaplıyor (start_date/end_date — client'tan gelen
    // GÜVENİLİR tarih alanları, zaten availability kontrolünde de
    // kullanılıyor) ve villanın gerçek pool_heating_months'unu
    // (findVillaCleaningConfig'in genişletilmiş projeksiyonundan) geçirir.
    startDate: start_date,
    endDate: end_date,
    villaPoolHeatingMonths: villaRow?.pool_heating_months as
      | number[]
      | null
      | undefined,
  });

  const cleaningFeeTry = snapshot.cleaning || 0;
  const totalPriceTry =
    (snapshot.total || 0) + poolHeatingSnapshot.pool_heating_total_try;
  const prepaymentAmount = calculatePrepayment(
    accommodationBase(
      totalPriceTry,
      cleaningFeeTry,
      poolHeatingSnapshot.pool_heating_total_try
    ),
    prepaymentRate
  );
  const remainingPayment = Math.max(
    totalPriceTry - prepaymentAmount,
    0
  );

  /* 🛡️ FAZ 3 — original_price/original_currency/original_cleaning_fee/
     original_cleaning_currency/exchange_rate. `buildPublicReservationPayload.ts`
     (client, ReservationForm) İLE BİREBİR AYNI türetme — YENİ bir kural
     İCAT EDİLMEDİ, yalnız server'ın KENDİ hesapladığı `snapshot` üzerinden
     aynı ternary'ler tekrarlanıyor:
       original_price = original_currency !== "TRY" ? snapshot.original_stay : 0
       original_currency = original_currency !== "TRY" ? snapshot.original_currency : "TRY"
       original_cleaning_fee = original_cleaning_currency !== "TRY" ? snapshot.original_cleaning : 0
       original_cleaning_currency = aynı ternary
       exchange_rate = hasForeignCurrency ? rates[originalCurrency] (veya 1) : 1
     `snapshot.original_stay` ZATEN indirim uygulanmış (discounted) değeri
     taşır — `calculateStayTotal` > `applyDiscountToDailyPrice` NİHAİ
     `original`'i döner (bkz. lib/price.engine.ts) — ayrı bir "pre-discount"
     hesaplama BURADA YAPILMAZ — ayrı, İZOLE bir "pre-discount" hesabı
     (yalnız original_stay_total_try/stay_discount_amount_try snapshot
     alanları İÇİN) aşağıda AYRICA yapılır (bkz. FAZ 4 bloğu). */
  const originalCurrencyRaw = snapshot.original_currency || "TRY";
  const originalCleaningCurrencyRaw =
    snapshot.original_cleaning_currency || "TRY";
  const hasForeignCurrency =
    originalCurrencyRaw !== "TRY" || originalCleaningCurrencyRaw !== "TRY";

  const originalPrice =
    originalCurrencyRaw !== "TRY" ? snapshot.original_stay || 0 : 0;
  const originalCurrency =
    originalCurrencyRaw !== "TRY" ? originalCurrencyRaw : "TRY";
  const originalCleaningFee =
    originalCleaningCurrencyRaw !== "TRY" ? snapshot.original_cleaning || 0 : 0;
  const originalCleaningCurrency =
    originalCleaningCurrencyRaw !== "TRY" ? originalCleaningCurrencyRaw : "TRY";

  const rateForOriginal =
    originalCurrencyRaw === "TRY" ? 1 : Number(rates[originalCurrencyRaw]) || 1;
  const exchangeRate = hasForeignCurrency ? rateForOriginal : 1;

  /* 🛡️ FAZ 4 — İNDİRİM/ÖZEL FİYAT SNAPSHOT (migration 080 kolonları).
     ===============================================================
     `discounts`'ı KİMLİĞİYLE (hangi kayıt eşleşti) detect etmek için
     `detectAppliedDiscountForStay` (YUKARIDA — `getActiveDiscount`
     reuse, YENİ bir engine DEĞİL). Miktar için ise `calculateStayTotal`
     (price.engine.ts'in ZATEN export ettiği aynı saf fonksiyon) İKİNCİ
     KEZ, bu sefer discounts OLMADAN çağrılır — bu "ikinci bir discount
     engine" DEĞİL, AYNI fonksiyonun "indirimsiz" varyantı (calculateStayTotal
     zaten discounts'ı opsiyonel/undefined kabul edip "indirim yok" ile
     BYTE-IDENTICAL davranıyor — bkz. lib/price.engine.ts kendi doc-comment'i).
     `.stay` alanı SADECE konaklama bileşenidir — cleaning/pool heating/
     damage deposit HİÇBİR ŞEKİLDE karışmaz (calculateGrandTotal'ın kendi
     izolasyonu — bu iki ayrı alan zaten toplanmaz).

     Discount UYGULANMADIYSA (hiçbir gece eşleşmediyse) TÜM detay alanları
     null (discount_applied hariç → false) — kullanıcı KURALI. */
  const appliedDiscount = detectAppliedDiscountForStay(
    start_date,
    end_date,
    discounts
  );
  const discountApplied = appliedDiscount !== null;

  let originalStayTotalTry: number | null = null;
  let stayDiscountAmountTry: number | null = null;
  let discountType: "percent" | "fixed" | null = null;
  let discountValue: number | null = null;
  let discountCurrency: string | null = null;

  if (discountApplied && appliedDiscount) {
    const undiscountedStay = calculateStayTotal(
      start_date,
      end_date,
      normalizedPrices,
      "TRY",
      rates
      // discounts parametresi BİLEREK verilmiyor → "indirim yok" hesabı
    );
    originalStayTotalTry = undiscountedStay.stay || 0;
    // finalStayTotalTry: snapshot.stay ZATEN indirim uygulanmış (FAZ 3'ten
    // beri mevcut) — burada TEKRAR hesaplanmaz, aynen okunur.
    const finalStayTotalTry = snapshot.stay || 0;
    // 🛡️ CLAMP YOK — fixed özel fiyat normal fiyattan yüksekse negatif
    // olabilir (kullanıcı KURALI, verbatim).
    stayDiscountAmountTry = originalStayTotalTry - finalStayTotalTry;

    discountType = appliedDiscount.discount_type;
    discountValue = Number(appliedDiscount.discount_value) || 0;
    // percent → NULL; fixed → villa_discounts.currency (ham/raw — TRY'ye
    // ÇEVRİLMEZ, snapshot "kaydın kendisi" olarak saklanır).
    discountCurrency =
      appliedDiscount.discount_type === "fixed"
        ? appliedDiscount.currency || null
        : null;
  }

  return {
    totalPriceTry,
    cleaningFeeTry,
    prepaymentAmount,
    remainingPayment,
    prepaymentRate,
    poolHeatingSelected: poolHeatingSnapshot.pool_heating_selected,
    originalPoolHeatingTotal: poolHeatingSnapshot.original_pool_heating_total,
    originalPoolHeatingCurrency:
      poolHeatingSnapshot.original_pool_heating_currency,
    poolHeatingTotalTry: poolHeatingSnapshot.pool_heating_total_try,
    // 🛡️ FAZ 3
    totalPrice: totalPriceTry,
    originalPrice,
    originalCurrency,
    exchangeRate,
    originalCleaningFee,
    originalCleaningCurrency,
    // 🛡️ FAZ 4
    discountApplied,
    discountType,
    discountValue,
    discountCurrency,
    originalStayTotalTry,
    stayDiscountAmountTry,
  };
}

function withinTolerance(client: number, server: number): boolean {
  const diff = Math.abs(client - server);
  if (diff <= TOLERANCE_TRY) return true;
  if (server > 0 && diff / server <= TOLERANCE_PCT) return true;
  return false;
}

export type PriceComparison = {
  match: boolean;
  deltas: Record<
    string,
    { client: number; server: number; diff: number }
  >;
};

export function comparePublicReservationPrice(
  payload: ReservationCreateInput,
  server: ServerPriceResult
): PriceComparison {
  const fields: Array<[string, number, number]> = [
    [
      "total_price_try",
      Number(payload.total_price_try) || 0,
      server.totalPriceTry,
    ],
    [
      "cleaning_fee_try",
      Number(payload.cleaning_fee_try) || 0,
      server.cleaningFeeTry,
    ],
    [
      "prepayment_amount",
      Number(payload.prepayment_amount) || 0,
      server.prepaymentAmount,
    ],
    [
      "remaining_payment",
      Number(payload.remaining_payment) || 0,
      server.remainingPayment,
    ],
    // 🛡️ HAVUZ ISITMA — 6. adım. Log-only karşılaştırma (enforcement YOK —
    // mevcut fail-open felsefe aynen).
    [
      "pool_heating_total_try",
      Number(payload.pool_heating_total_try) || 0,
      server.poolHeatingTotalTry,
    ],
  ];

  const deltas: PriceComparison["deltas"] = {};
  let match = true;
  for (const [name, client, srv] of fields) {
    if (!withinTolerance(client, srv)) {
      match = false;
      deltas[name] = { client, server: srv, diff: client - srv };
    }
  }
  return { match, deltas };
}

/* 🛡️ HAVUZ ISITMA — 6. adım. Route'un (`api/public/reservations/route.ts`)
   `body`'deki 4 pool heating snapshot alanını server-authoritative
   değerlerle override edebilmesi için — `verifyPublicReservationPrice`'ın
   tek caller'ı bu route; return değeri ÖNCEDEN tamamen ignore ediliyordu
   (grep ile doğrulandı), bu yüzden shape genişletmek güvenli. */
export type PublicReservationPoolHeatingSnapshot = {
  pool_heating_selected: boolean;
  original_pool_heating_total: number;
  original_pool_heating_currency: string;
  pool_heating_total_try: number;
};

/* 🛡️ FAZ 3 — route'un `body`'deki finansal alanları (pool heating
   HARİÇ — o AYRI, zaten var olan `poolHeating` alanı üzerinden) server-
   authoritative değerlerle override edebilmesi için. Alan adları DB
   kolon adlarıyla BİREBİR (ReservationCreateInput/payload-create.ts ile
   aynı isimler) — route'ta doğrudan `body.<field> = authoritative.<field>`
   ataması yapılabilsin diye. */
export type PublicReservationAuthoritativeSnapshot = {
  total_price: number;
  total_price_try: number;
  original_price: number;
  original_currency: string;
  exchange_rate: number;
  original_cleaning_fee: number;
  original_cleaning_currency: string;
  cleaning_fee_try: number;
  prepayment_amount: number;
  remaining_payment: number;
  // 🛡️ FAZ 4 — İNDİRİM/ÖZEL FİYAT SNAPSHOT (migration 080). Discount
  // uygulanmadıysa discount_applied=false, diğer 5 alan null.
  discount_applied: boolean;
  discount_type: "percent" | "fixed" | null;
  discount_value: number | null;
  discount_currency: string | null;
  original_stay_total_try: number | null;
  stay_discount_amount_try: number | null;
};

export type PublicReservationServerVerification = {
  comparison: PriceComparison | null;
  /* null → recompute başarısız (fail-open); route bu durumda client'ın
     ORİJİNAL gönderdiği pool heating alanlarını DEĞİŞTİRMEDEN bırakır. */
  poolHeating: PublicReservationPoolHeatingSnapshot | null;
  /* 🛡️ FAZ 3 — null → recompute başarısız (fail-open, pool heating İLE
     AYNI davranış); route bu durumda client'ın gönderdiği finansal
     alanları DEĞİŞTİRMEDEN bırakır (mevcut fail-open felsefe korunur —
     bu fazın amacı client'ı güvenmemek, ama recompute'un KENDİSİ
     patlarsa booking'i BLOKLAMAMAK — pool heating precedent'iyle
     BİREBİR aynı trade-off). */
  authoritative: PublicReservationAuthoritativeSnapshot | null;
};

/* ---------------------------------------------------------------
   🔥 verifyPublicReservationPrice — orchestrator (SERVER-AUTHORITATIVE
   FİNANSAL ALANLAR + HAVUZ ISITMA server-authoritative snapshot +
   COMPARE/LOG)
   ---------------------------------------------------------------
   Route'tan çağrılır. Recompute + compare + structured log yapar.
   🛡️ FAZ 3 (bu tur): `comparison` HÂLÂ yalnız COMPARE/LOG (enforcement
   YOK, fail-open, mevcut felsefe aynen — drift'i loglar, bloklamaz).
   Asıl enforcement YENİ `authoritative` alanı ÜZERİNDEN olur: route
   bunu (varsa) `body` üzerine YAZAR — pool heating snapshot'ıyla AYNI
   desen (kullanıcı kuralı: server bu alanları ASLA client'tan
   güvenmemeli). Recompute başarısızsa (fail-open) `authoritative` de
   `poolHeating` gibi null döner — route body'yi DEĞİŞTİRMEZ.
=============================================================== */
export async function verifyPublicReservationPrice(
  payload: ReservationCreateInput
): Promise<PublicReservationServerVerification> {
  try {
    const server = await recomputePublicReservationPrice({
      villa_id: payload.villa_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      pool_heating_selected: payload.pool_heating_selected,
    });
    if (!server) return { comparison: null, poolHeating: null, authoritative: null };

    const cmp = comparePublicReservationPrice(payload, server);

    if (!cmp.match) {
      console.warn(
        "[price-verify] CLIENT/SERVER DRIFT (LOG-MODE — enforce edilmiyor)",
        {
          villa_id: payload.villa_id,
          start_date: payload.start_date,
          end_date: payload.end_date,
          prepaymentRate: server.prepaymentRate,
          deltas: cmp.deltas,
        }
      );
    } else {
      console.log("[price-verify] OK (client == server, tolerans içinde)", {
        villa_id: payload.villa_id,
      });
    }
    return {
      comparison: cmp,
      poolHeating: {
        pool_heating_selected: server.poolHeatingSelected,
        original_pool_heating_total: server.originalPoolHeatingTotal,
        original_pool_heating_currency: server.originalPoolHeatingCurrency,
        pool_heating_total_try: server.poolHeatingTotalTry,
      },
      // 🛡️ FAZ 3 — server-authoritative finansal alanlar (indirim-farkında).
      authoritative: {
        total_price: server.totalPrice,
        total_price_try: server.totalPriceTry,
        original_price: server.originalPrice,
        original_currency: server.originalCurrency,
        exchange_rate: server.exchangeRate,
        original_cleaning_fee: server.originalCleaningFee,
        original_cleaning_currency: server.originalCleaningCurrency,
        cleaning_fee_try: server.cleaningFeeTry,
        prepayment_amount: server.prepaymentAmount,
        remaining_payment: server.remainingPayment,
        // 🛡️ FAZ 4
        discount_applied: server.discountApplied,
        discount_type: server.discountType,
        discount_value: server.discountValue,
        discount_currency: server.discountCurrency,
        original_stay_total_try: server.originalStayTotalTry,
        stay_discount_amount_try: server.stayDiscountAmountTry,
      },
    };
  } catch (err) {
    /* FAIL-OPEN: recompute patlasa bile booking sürer; pool heating
       snapshot'ı ve FAZ 3 authoritative snapshot'ı da override EDİLMEZ
       (route client değerlerini korur). */
    console.error(
      "[price-verify] recompute FAILED (fail-open, booking sürüyor):",
      err instanceof Error ? err.message : err
    );
    return { comparison: null, poolHeating: null, authoritative: null };
  }
}
