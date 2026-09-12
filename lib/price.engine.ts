import { convertPrice } from "@/lib/currency";
import { parseLocalDate } from "@/lib/date-format";
import type { PriceRange } from "@/lib/villa-row.types";

/* ===============================================================
   🛡️ FAZ 9 TS HARDENING — `prices: any[]` → `PriceRange[]`
   ===============================================================
   Tüm engine fonksiyonları artık şu shape ile çağrılıyor:
     { start_date: string; end_date: string; price: number; currency: string }
   Caller'lar (services/villa-price, BookingSidebar, VillaCard,
   ReservationForm, /arama, /kiralik-villa) zaten bu shape'i sağlıyordu;
   yalnız tip katmanı `any` idi → autocomplete + sessiz drift riski.

   Runtime davranışı BYTE-IDENTICAL. Hiçbir alan default'u değişmedi.
   =============================================================== */

/* ===============================================================
   🔥 PRICING DATE SEMANTIC — TEK KURAL
   ===============================================================
   Bu modülde tüm "YYYY-MM-DD" string'leri parseLocalDate ile
   LOCAL midnight Date'e çevrilir. `new Date(YYYY-MM-DD)` UTC parse
   yaptığı için (örn. UTC+3'te 03:00 TR'ye düşer) drift kaynağıydı;
   normalizeDate sonrasında bile getFullYear/Month/Date ile birlikte
   farklı günü gösterebiliyordu. parseLocalDate doğrudan LOCAL
   alanlardan kurar; günler sadık kalır.
   Davranış: gece sayısı, fiyat aralığı eşleşmesi, döngü sınırı —
   hepsi BİREBİR aynı. Yalnız parse adımı tek source-of-truth'a
   bağlandı.
   =============================================================== */

// 🔥 TARİH NORMALIZE — LOCAL midnight (year/month/day)
export const normalizeDate = (
  date: Date
) => {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
};

/* ===============================================================
   🔥 STARTING PRICE — listing card fallback (date search YOK iken)
   ===============================================================
   Bir villa için "X / gece'den başlayan" gösterimi: villa_prices
   içindeki en düşük positive nightly price + currency.

   KULLANIM:
     - Yalnız listing kartları (arama / koleksiyon) için fallback
       price prop hesabı.
     - Date search varsa caller `calculateGrandTotal()` ile total
       hesaplar; bu helper devreye GİRMEZ. İki akış birbirinden
       bağımsız ve zero-impact.

   DAVRANIŞ:
     - Boş array / hepsi null/0/invalid → null. Caller'lar null'a
       göre eski fallback'i (UI'de "—" veya "Fiyat sorunuz") seçebilir.
     - Currency belirsiz veya eksik → "TRY" default.
     - Conversion YAPILMAZ — orijinal currency aynen döner; VillaCard
       seviyesinde convertPrice ile user currency'ye çevrilir.
=============================================================== */
export type StartingPriceInput = ReadonlyArray<{
  price?: number | null;
  currency?: string | null;
}>;

export function getStartingPrice(
  prices: StartingPriceInput
): { price: number; currency: string } | null {
  if (!Array.isArray(prices) || prices.length === 0) return null;
  let best: { price: number; currency: string } | null = null;
  for (const p of prices) {
    const v = Number(p?.price);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (best === null || v < best.price) {
      best = { price: v, currency: p?.currency || "TRY" };
    }
  }
  return best;
}

// 🔥 GECE HESAPLA
export const calculateNights = (
  start: string,
  end: string
) => {
  if (!start || !end) {
    return 0;
  }

  // parseLocalDate → LOCAL midnight; UTC drift YOK
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);

  return Math.ceil(
    (e.getTime() - s.getTime()) /
    (1000 * 60 * 60 * 24)
  );
};

// 🔥 GÜNLÜK FİYAT BUL
export const getDailyPrice = (
  date: Date,
  prices: PriceRange[],
  currency: string,
  rates: Record<string, number>
) => {
  const d = normalizeDate(date);

  const found = prices.find((p) => {
    // parseLocalDate → "YYYY-MM-DD" LOCAL midnight.
    // normalizeDate gereksizleşti çünkü parseLocalDate zaten saatsiz
    // local Date üretir; davranış birebir aynı.
    const s = parseLocalDate(p.start_date);
    const e = parseLocalDate(p.end_date);

    return d >= s && d <= e;
  });

  if (!found) {
    return {
      converted: 0,
      original: 0,
      original_currency: "TRY",
    };
  }

  const original = Number(found.price || 0);

  const original_currency =
    found.currency || "TRY";

  const converted = convertPrice(
    original,
    original_currency,
    currency,
    rates
  );

  return {
    converted,
    original,
    original_currency,
  };
};

/* ===============================================================
   🛡️ ADIM 2 — VILLA_DISCOUNTS KATMANI (villa_prices'ın ÜZERİNE)
   ===============================================================
   Bu blok villa_prices/getDailyPrice'a HİÇBİR ŞEKİLDE dokunmaz —
   AYRI, İZOLE bir katmandır. calculateStayTotal içinde getDailyPrice
   çağrısından SONRA, normal (indirimsiz) fiyatın ÜZERİNE uygulanır.

   TARİH SEMANTİĞİ: villa_prices/getDailyPrice ile BİREBİR AYNI —
   kapalı interval, start_date/end_date İKİSİ DE DAHİL (`d >= s && d
   <= e`, migration 079'daki villa_discounts tarih mantığıyla tutarlı).

   ÇOKLU KAYIT GÜVENLİĞİ: aynı gece için birden fazla aktif discount
   DB'de EXCLUDE constraint (villa_discounts_no_overlap, migration 079)
   ile zaten engelleniyor. Uygulama katmanında da `.find()` kullanılır
   (getDailyPrice ile AYNI desen) — beklenmedik şekilde birden fazla
   kayıt gelse bile yalnız İLKİ kullanılır, ASLA toplanmaz/üst üste
   uygulanmaz. */
/* 🛡️ SEMANTİK DÜZELTME (bu tur) — `discount_type: "fixed"` alan adı DB'de
   ("villa_discounts.discount_type") geriye dönük uyumluluk için AYNEN
   korundu, ANCAK anlamı: "normal fiyattan düşülecek bir indirim tutarı"
   DEĞİL, "o gecenin NİHAİ/GECELİK ÖZEL FİYATI"dır. `discount_value` bu
   tipte doğrudan o gecenin son fiyatıdır — normal villa_prices fiyatının
   üzerine bir çıkarma işlemi YAPILMAZ, normal fiyatın YERİNE geçer (bkz.
   applyDiscountToDailyPrice). `discount_type: "percent"` davranışı
   DEĞİŞMEDİ — normal fiyatın yüzdesi kadar indirim uygulanmaya devam eder. */
export type DiscountRange = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency?: string | null;
};

// 🔥 O GECE İÇİN AKTİF İNDİRİMİ BUL — getDailyPrice ile BİREBİR AYNI
// tarih karşılaştırması (kapalı interval). discounts boş/undefined/null
// → null (indirim yok, mevcut davranış korunur).
export const getActiveDiscount = (
  date: Date,
  discounts: DiscountRange[] | null | undefined
): DiscountRange | null => {
  if (!Array.isArray(discounts) || discounts.length === 0) {
    return null;
  }

  const d = normalizeDate(date);

  const found = discounts.find((disc) => {
    const s = parseLocalDate(disc.start_date);
    const e = parseLocalDate(disc.end_date);

    return d >= s && d <= e;
  });

  return found ?? null;
};

/* 🔥 GÜNLÜK FİYATA İNDİRİM/ÖZEL FİYAT UYGULA — AYRI KATMAN
   (getDailyPrice'a GÖMÜLMEDİ)
   ===============================================================
   `daily` — getDailyPrice'ın ÇIKTISI (normal/indirimsiz fiyat).
   `discount` — null ise `daily` AYNEN döner (davranış BYTE-IDENTICAL).

   🛡️ SEMANTİK DÜZELTME (bu tur — ÖNEMLİ):
   FORMÜL:
     percent → normal × (1 - discount_value / 100)   [DEĞİŞMEDİ]
     fixed   → discount_value (o gecenin NİHAİ ÖZEL FİYATI — normal
               fiyattan bir miktar DÜŞÜLMEZ, doğrudan bu değere EŞİTLENİR)
   Önceki davranış `fixed` için "normal - discount_value" idi (bir
   indirim TUTARI gibi). Bu YANLIŞ yorumdu — admin fiyat giriş sistemiyle
   (villa_prices: bir tarih aralığına girilen fiyat o aralıktaki HER
   GÜNÜN nihai fiyatı olur) TUTARLI olması için `fixed` artık AYNI
   mantıkla çalışıyor: girilen değer, o tarih aralığındaki HER GECENİN
   doğrudan son fiyatı. Normal fiyattan YÜKSEK bir özel fiyat girilmesi
   de mümkün ve GEÇERLİDİR (bu bir "indirim" değil, "özel fiyat" —
   sistem bunu engellemez). Sonuç yine DAİMA Math.max(0, ...) ile clamp
   edilir (savunma amaçlı; CHECK constraint zaten discount_value>0
   zorunlu kılıyor, negatif pratikte oluşmaz).

   CURRENCY:
     - percent: currency bağımsız - doğrudan orana uygulanır
     - fixed: `discount.currency` villa'nın gecelik ORİJİNAL
       currency'siyle (`daily.original_currency`) FARKLIYSA, mevcut
       `convertPrice` (TRY pivot — cleaning/pool heating'in "raw
       hesapla, convertPrice ile çevir" deseniyle AYNI yaklaşım) ile
       önce `daily.original_currency`'e çevrilir — bu çevrilmiş değer
       DOĞRUDAN o gecenin özel fiyatı olur (ÇIKARMA YOK).
       `discount.currency` eksikse (NULL) — migration 079'daki
       `villa_discounts_currency_consistency` CHECK'i zaten 'fixed'
       tipte NULL currency'e izin vermiyor, ama savunma amaçlı burada
       da `daily.original_currency` varsayılır (conversion atlanır).

   `converted` alanı, nihai `original` üzerinden getDailyPrice'ın
   KENDİ deseniyle (convertPrice(original, original_currency, currency,
   rates)) SIFIRDAN hesaplanır — zaten çevrilmiş `daily.converted`
   üzerinde ORANSAL bir işlem YAPILMAZ (yuvarlama tutarsızlığı riski
   olmadan). */
export const applyDiscountToDailyPrice = (
  daily: { converted: number; original: number; original_currency: string },
  discount: DiscountRange | null | undefined,
  currency: string,
  rates: Record<string, number>
): { converted: number; original: number; original_currency: string } => {
  if (!discount) {
    return daily;
  }

  if (!Number.isFinite(daily.original) || daily.original <= 0) {
    return daily;
  }

  const value = Number(discount.discount_value) || 0;

  let discountedOriginal: number;

  if (discount.discount_type === "percent") {
    discountedOriginal = daily.original * (1 - value / 100);
  } else {
    // 🛡️ "fixed" = GECELİK ÖZEL FİYAT — normal fiyattan ÇIKARILMAZ,
    // o gecenin nihai fiyatı DOĞRUDAN bu değere eşitlenir (villa_prices'ın
    // "girilen fiyat o aralıktaki her günün fiyatıdır" mantığıyla AYNI).
    const discountCurrency = discount.currency || daily.original_currency;

    const valueInOriginalCurrency =
      discountCurrency === daily.original_currency
        ? value
        : convertPrice(
            value,
            discountCurrency,
            daily.original_currency,
            rates
          );

    discountedOriginal = valueInOriginalCurrency;
  }

  discountedOriginal = Math.max(0, discountedOriginal);

  return {
    converted: convertPrice(
      discountedOriginal,
      daily.original_currency,
      currency,
      rates
    ),
    original: discountedOriginal,
    original_currency: daily.original_currency,
  };
};

// 🔥 KONAKLAMA TOPLAMI
export const calculateStayTotal = (
  start: string,
  end: string,
  prices: PriceRange[],
  currency: string,
  rates: Record<string, number>,
  // 🛡️ ADIM 2 — villa_discounts katmanı. OPSİYONEL, default undefined
  // → discounts hiç verilmeyen TÜM mevcut çağrılarda (calculateGrandTotal
  // dahil) davranış BYTE-IDENTICAL kalır (getActiveDiscount boş/undefined
  // için null döner → applyDiscountToDailyPrice `daily`'i aynen döner).
  discounts?: DiscountRange[] | null
) => {
  if (!start || !end) {
    return {
      stay: 0,
      original_stay: 0,
      original_currency: "TRY",
    };
  }

  let stay = 0;

  let original_stay = 0;

  let original_currency = "TRY";

  // 🛡️ ADIM 2 — aşağıdaki "fallback" bloğu villa_prices'ın ÖNCEDEN beri
  // var olan davranışı (bkz. yorum): stay===0 olduğunda prices[0]'a
  // düşer — bu, "bu tarih aralığında HİÇBİR villa_prices satırı
  // eşleşmedi" (sezon dışı sorgu) durumunu varsayar. Discount katmanı
  // eklenince stay===0 artık BAŞKA, MEŞRU bir sebeple de oluşabilir:
  // fiyat BULUNDU ama indirim onu 0'a düşürdü (Math.max(0, ...) clamp).
  // Bu iki durumu ayırt etmek için `hadMatchingPrice` — İNDİRİMDEN ÖNCEKİ
  // `daily` üzerinden — izlenir; fallback SADECE hiçbir gece bir
  // villa_prices satırına denk gelmediğinde tetiklenir (eski davranış
  // BYTE-IDENTICAL), meşru "indirimle 0'a düşme" durumunda tetiklenmez.
  let hadMatchingPrice = false;

  // parseLocalDate → "YYYY-MM-DD" LOCAL midnight; while-loop ve
  // setDate(+1) LOCAL zincirde ilerler. UTC parse (önceki davranış)
  // TR+3 saatinde "03:00 UTC" üretip getDate()/setDate() üzerinde
  // implicit drift yaratıyordu; bu drift kaldırıldı.
  let current = parseLocalDate(start);
  const endD = parseLocalDate(end);

  while (current < endD) {

    const daily = getDailyPrice(
      current,
      prices,
      currency,
      rates
    );

    if (daily.original > 0) {
      hadMatchingPrice = true;
    }

    // 🛡️ ADIM 2 — İNDİRİM KATMANI: getDailyPrice'ın normal (indirimsiz)
    // fiyatının ÜZERİNE uygulanır; getDailyPrice'ın KENDİSİ hiçbir
    // şekilde değiştirilmedi/yeniden çağrılmadı — yalnız çıktısı
    // post-process edilir (ayrı, izole katman — gömme YOK). Discount
    // yoksa (activeDiscount null) applyDiscountToDailyPrice `daily`'i
    // AYNEN döner (BYTE-IDENTICAL).
    const activeDiscount = getActiveDiscount(current, discounts);

    const finalDaily = applyDiscountToDailyPrice(
      daily,
      activeDiscount,
      currency,
      rates
    );

    stay += finalDaily.converted;

    original_stay += finalDaily.original;

    original_currency =
      finalDaily.original_currency;

    current.setDate(
      current.getDate() + 1
    );
  }

  // fallback — YALNIZ hiçbir gece bir villa_prices satırına denk
  // gelmediyse (mevcut/eski davranış). İndirimle MEŞRU şekilde 0'a
  // düşen bir gece (hadMatchingPrice=true) burada ARTIK ELE ALINMAZ.
  if (stay === 0 && !hadMatchingPrice && prices?.length) {

    const original =
      Number(prices[0].price || 0);

    const originalCurrency =
      prices[0].currency || "TRY";

    return {
      stay: convertPrice(
        original,
        originalCurrency,
        currency,
        rates
      ),

      original_stay: original,

      original_currency:
        originalCurrency,
    };
  }

  return {
    stay,
    original_stay,
    original_currency,
  };
};

// 🔥 TEMİZLİK KURALI
export const calculateCleaningFee = (
  nights: number,
  cleaning_fee: number,
  cleaning_limit?: number
) => {
  if (!cleaning_fee) {
    return 0;
  }

  if (
    !cleaning_limit ||
    cleaning_limit === 0
  ) {
    return cleaning_fee;
  }

  return nights < cleaning_limit
    ? cleaning_fee
    : 0;
};

/* 🔥 HAVUZ ISITMA TOPLAMI (opsiyonel ek hizmet — 2. adım, İLK KULLANIM)
   ===============================================================
   selected=false → 0. fee null/undefined/0 → 0. nights<=0 → 0.
   Aksi halde nights × fee. Currency conversion BURADA yapılmaz —
   cleaning fee ile aynı desen: raw (orijinal currency) burada
   hesaplanır, convertPrice çağrısı calculateGrandTotal içinde
   (cleaning ile birebir aynı noktada) yapılır. */
export const calculatePoolHeatingFee = (
  nights: number,
  poolHeatingFee: number | null | undefined,
  selected: boolean
) => {
  if (!selected) {
    return 0;
  }

  if (!poolHeatingFee) {
    return 0;
  }

  if (!nights || nights <= 0) {
    return 0;
  }

  return nights * poolHeatingFee;
};

/* 🔥 HAVUZ ISITMA — SEZONLUK AY KISITI (Migration 076, İLK KULLANIM)
   ===============================================================
   TEK MERKEZİ KURAL: Rezervasyonun kapsadığı TÜM GECELER
   `activeMonths` içindeki bir takvim ayına denk gelmeli; tek bir
   gece bile dışarıdaysa false döner (kullanıcı tercihi — bir gece
   pasif ayda ise TÜM rezervasyon için ısıtma sunulmaz; kısmi/gece
   bazlı kısmi hesap YOK — bu, calculatePoolHeatingFee'nin
   "nights × fee tek çarpım" tasarımıyla ve migration 075'in "ek
   gece-snapshot kolonu yok" felsefesiyle tutarlı tek seçenek).

   GECE TANIMI: calculateNights ile BİREBİR AYNI — check-in DAHİL,
   check-out HARİÇ (check-out günü "gece" sayılmaz). parseLocalDate
   kullanılır — normalizeDate ile aynı LOCAL midnight semantiği,
   UTC drift YOK.

   activeMonths NULL/undefined → true (ay kısıtlaması YOK, 12 ay
   aktif — migration 076'nın NULL semantiği; mevcut ~1595 villa
   için BYTE-IDENTICAL geriye dönük davranış).
   activeMonths boş dizi [] → false (hiçbir ay aktif değil; admin
   formu normalde bu durumu üretmez, olası edge-case için güvenli
   varsayılan).
   start/end geçersiz veya start >= end → true (calculateNights'ın
   0/negatif gece durumuna denk gelir; calculatePoolHeatingFee zaten
   nights<=0 için 0 döndürdüğünden sonuç etkilenmez — burada erken
   "true" dönmek yalnız bu fonksiyonun kendi sözleşmesini basit
   tutar). */
export const isPoolHeatingActiveForRange = (
  start: string,
  end: string,
  activeMonths?: number[] | null
): boolean => {
  if (activeMonths === null || activeMonths === undefined) {
    return true;
  }

  if (!start || !end) {
    return true;
  }

  const s = parseLocalDate(start);
  const e = parseLocalDate(end);

  if (!(s.getTime() < e.getTime())) {
    return true;
  }

  const activeSet = new Set(activeMonths);

  const cursor = new Date(
    s.getFullYear(),
    s.getMonth(),
    s.getDate()
  );

  while (cursor.getTime() < e.getTime()) {
    const month = cursor.getMonth() + 1; // 1 = Ocak ... 12 = Aralık
    if (!activeSet.has(month)) {
      return false;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return true;
};

// 🔥 GENEL TOPLAM
export const calculateGrandTotal = ({
  start,
  end,
  prices,
  currency,
  rates,
  cleaning_fee = 0,
  cleaning_currency = "TRY",
  cleaning_limit = 0,
  pool_heating_fee = 0,
  pool_heating_currency = "TRY",
  pool_heating_selected = false,
  pool_heating_months = null,
  discounts = null,
}: {
  start: string;

  end: string;

  prices: PriceRange[];

  currency: string;

  rates: Record<string, number>;

  cleaning_fee?: number;

  cleaning_currency?: string;

  cleaning_limit?: number;

  /* 🛡️ Havuz Isıtma (2. adım) — hepsi OPSİYONEL, güvenli default'lar
     eskiden default vermemiş çağrılarda davranışı BYTE-IDENTICAL
     bırakır (pool_heating_selected=false → poolHeatingTotal=0). */
  pool_heating_fee?: number;

  pool_heating_currency?: string;

  pool_heating_selected?: boolean;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. OPSİYONEL, default null
     ("ay kısıtlaması yok" — eskiden bu parametreyi vermeyen TÜM
     çağrılarda davranış BYTE-IDENTICAL kalır). */
  pool_heating_months?: number[] | null;

  /* 🛡️ ADIM 2 — villa_discounts katmanı. OPSİYONEL, default null
     ("indirim yok" — eskiden bu parametreyi vermeyen TÜM çağrılarda
     davranış BYTE-IDENTICAL kalır). calculateStayTotal'a olduğu gibi
     iletilir; cleaning/pool heating hesaplarını HİÇ etkilemez. */
  discounts?: DiscountRange[] | null;
}) => {

  const nights = calculateNights(
    start,
    end
  );

  const stayResult =
    calculateStayTotal(
      start,
      end,
      prices,
      currency,
      rates,
      discounts
    );

  const stay =
    stayResult.stay;

  const original_stay =
    stayResult.original_stay;

  const original_currency =
    stayResult.original_currency;

  const rawCleaning =
    calculateCleaningFee(
      nights,
      cleaning_fee,
      cleaning_limit
    );

  // kullanıcı currency’sine çevrilen
  const cleaning = convertPrice(
    rawCleaning,
    cleaning_currency || "TRY",
    currency,
    rates
  );

  // ORJİNAL cleaning
  const original_cleaning =
    rawCleaning;

  const original_cleaning_currency =
    cleaning_currency || "TRY";

  // 🔥 HAVUZ ISITMA — cleaning ile birebir aynı desen (raw → convert).
  // pool_heating_selected=false (default) → rawPoolHeating=0 →
  // poolHeating=0 → total mevcut davranışla BYTE-IDENTICAL kalır.
  // 🛡️ Migration 076 — sezonluk ay kısıtı: pool_heating_months
  // NULL/undefined ise isPoolHeatingActiveForRange her zaman true
  // döner (geriye dönük uyumlu, davranış DEĞİŞMEZ). Yalnız villa
  // için ay kısıtlaması TANIMLIYSA VE rezervasyon aralığı bu
  // kısıtlamanın DIŞINDAYSA "selected" false'a düşürülür — TUTAR
  // hesaplanmaz (calculatePoolHeatingFee'nin imzası DEĞİŞMEDİ).
  const isPoolHeatingActive = isPoolHeatingActiveForRange(
    start,
    end,
    pool_heating_months
  );

  const rawPoolHeating =
    calculatePoolHeatingFee(
      nights,
      pool_heating_fee,
      pool_heating_selected && isPoolHeatingActive
    );

  // kullanıcı currency'sine çevrilen
  const poolHeating = convertPrice(
    rawPoolHeating,
    pool_heating_currency || "TRY",
    currency,
    rates
  );

  // ORJİNAL pool heating
  const original_pool_heating =
    rawPoolHeating;

  const original_pool_heating_currency =
    pool_heating_currency || "TRY";

  // toplam (kullanıcının gördüğü) — stayTotal + cleaningTotal + poolHeatingTotal
  const total =
    stay + cleaning + poolHeating;


  return {
    nights,

    stay,

    cleaning,

    poolHeating,

    total,

    original_stay,

    original_cleaning,

    original_pool_heating,

    original_currency,

    original_cleaning_currency,

    original_pool_heating_currency,

    currency,
  };
};

/* 🔥 KONAKLAMA BEDELİ (prepayment base) — CANONICAL.
   Ön ödeme YALNIZ konaklama bedelinden hesaplanır. Grand total
   (`total = stay + cleaning [+ poolHeating]`) içinden temizlik VE
   (varsa) havuz ısıtma ÇIKARILIR; hasar depozitosu zaten total'e
   dahil değildir (yalnız snapshot).
   accommodationBase(total, cleaning, poolHeating=0) =
     max(total - cleaning - poolHeating, 0)
   ⚠️ total, cleaning VE poolHeating AYNI para biriminde olmalı
   (üçü de display currency ya da üçü de TRY snapshot).
   🛡️ Havuz Isıtma (2. adım): poolHeatingFee OPSİYONEL, default 0 —
   mevcut 2-parametreli çağrılar BYTE-IDENTICAL kalır. */
export const accommodationBase = (
  total: number,
  cleaningFee: number,
  poolHeatingFee: number = 0
) =>
  Math.max(
    (Number(total) || 0) -
      (Number(cleaningFee) || 0) -
      (Number(poolHeatingFee) || 0),
    0
  );

// 🔥 ÖN ÖDEME — base * rate/100. Base DAİMA konaklama bedeli olmalı
// (accommodationBase ile üretilir); grand total GEÇİLMEZ.
export const calculatePrepayment = (
  total: number,
  rate: number
) => {
  if (!total || !rate) {
    return 0;
  }

  return Math.round(
    (total * rate) / 100
  );
};