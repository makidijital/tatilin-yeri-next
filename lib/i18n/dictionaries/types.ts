/* ===============================================================
   🛡️ DICTIONARY TYPE — PHASE 2 (UI Translation Dictionary Core)
   ===============================================================
   Tek source-of-truth şema. TR/EN/DE dictionary'leri (tr.ts/en.ts/
   de.ts) bu tipe göre yazılır — eksik veya fazladan bir key varsa
   TypeScript derleme hatası verir (object literal + explicit type
   annotation → excess/missing property check).

   KAPSAM (bilinçli olarak dar): yalnız merkezi, tekrar eden ve
   birden çok component'te kullanılacak UI metinleri. Villa title/
   description gibi DB içeriği BURADA YOK (DB-çeviri, ayrı bir
   fazın konusu — bkz. audit raporu Bölüm D/N). Zaten onaylanmış/
   sabit ürün metinleri (örn. "Hemen Rezervasyon Yap", "Gecelik NNN₺
   indirimli") de BURADA YOK — bu fazda hiçbir component'e dokunulmadı,
   dolayısıyla o metinler şu an dictionary'den beslenmiyor.
   =============================================================== */

/* 🛡️ PHASE 10E — yatak/banyo tipi enum'larının TEK doğruluk kaynağı
   lib/villa-layout.helper.ts'tir (migration 047). BED_TYPES/BATHROOM_TYPES
   `as const` tanımlı olduğu için literal union'lar oradan TÜRETİLEBİLİYOR
   (distanceLabels'ta bu mümkün değildi — DISTANCE_OPTIONS `ReadonlyArray<string>`).
   Böylece aşağıdaki iki Record alanı derleme zamanında EKSİKSİZ olmak
   zorunda; enum'a yeni bir değer eklenirse tr/en/de.ts derleme hatası verir.
   `import type` → sıfır runtime etkisi, çevrim (circular import) riski yok
   (villa-layout.helper.ts hiçbir şey import etmiyor). */
import type { BedType, BathroomType } from "@/lib/villa-layout.helper";
/* 🛡️ PHASE 10E BATCH 5 — havuz tipi union'ı da tek canonical kaynaktan
   (lib/pool.helper.ts) türetilir; POOL_TYPE_KEYS `as const` olduğu için
   literal union elde edilir → tr/en/de.ts'te eksik key derleme hatası verir. */
import type { PoolTypeKey } from "@/lib/pool.helper";

/* ===============================================================
   🛡️ PHASE 10D — BATCH 4: CANONICAL DISTANCE TITLE UNION
   ===============================================================
   DB'deki 12 canonical mesafe title'ının (bkz. lib/distance.helper.ts
   → DISTANCE_OPTIONS/isCanonicalDistanceTitle) literal union'ı —
   YALNIZ aşağıdaki `distanceLabels` alanının exhaustiveness kontrolü
   için (tr.ts/en.ts/de.ts'te eksik/fazla key varsa derleme hatası).

   Tek runtime doğruluk kaynağı `lib/distance.helper.ts`'teki
   DISTANCE_OPTIONS'tır — bu union onunla SENKRON tutulmalı.
   DISTANCE_OPTIONS `ReadonlyArray<string>` (as const DEĞİL) olarak
   tanımlı olduğundan buradan otomatik türetilemiyor (literal daralması
   olmuyor); bu yüzden senkronizasyon runtime'da
   tests/unit/distance-label.helper.test.ts içinde doğrulanır.
   lib/distance.helper.ts Batch 4 kapsamında DEĞİŞTİRİLMEDİ. */
export type DistanceCanonicalTitle =
  | "Restoran"
  | "Market"
  | "Plaj"
  | "Deniz"
  | "Şehir Merkezi"
  | "Havaalanı (Antalya)"
  | "Havaalanı (Dalaman)"
  | "Otobüs Terminali"
  | "Sağlık Merkezi"
  | "Eczane"
  | "Benzin İstasyonu"
  | "Okul";

export type Dictionary = {
  common: {
    search: string;
    close: string;
    cancel: string;
    save: string;
    continue: string;
    back: string;
    next: string;
    previous: string;
    loading: string;
    error: string;
    success: string;
    viewAll: string;
    /* 🛡️ PHASE 10B — MobileBookingCta.tsx */
    checkAvailability: string;
    perNight: string;
    /* 🛡️ PHASE 10C — TopBar dil değiştirici (aria-label/erişilebilirlik) */
    language: string;
  };
  header: {
    home: string;
    villas: string;
    regions: string;
    villaTypes: string;
    blog: string;
    contact: string;
    offer: string;
    favorites: string;
    support: string;
    menuOpen: string;
    menuClose: string;
  };
  footer: {
    explore: string;
    villas: string;
    regions: string;
    allCategories: string;
    allRegions: string;
    exploreAllRegions: string;
    phone: string;
    email: string;
    address: string;
    checkReservation: string;
    webDevelopment: string;
  };
  booking: {
    reservation: string;
    checkIn: string;
    checkOut: string;
    guests: string;
    accommodation: string;
    total: string;
    prepayment: string;
    remainingPayment: string;
    cleaningFee: string;
    poolHeating: string;
    discount: string;
    discountedTotal: string;
    nights: string;
    /* 🛡️ PHASE 10B — BookingSidebar/BookingSummary/BookingMinStayWarning/
       BookingCalendar/useBookingEngine/MobileBookingCta UI stringleri.
       Yukarıdaki 13 anahtar (Phase 2) DEĞİŞMEDİ — bunlar EKLEME. */
    sidebarEyebrow: string;
    sidebarTitle: string;
    sidebarSubtitle: string;
    checkInPillLabel: string;
    checkOutPillLabel: string;
    selectDatePlaceholder: string;
    guestsLabel: string;
    /** template: {adults}, {children} */
    guestsSummary: string;
    adultsLabel: string;
    childrenLabel: string;
    confirm: string;
    gapOverrideNotice: string;
    bookNow: string;
    feeAutoCalculated: string;
    installmentEyebrow: string;
    payNowPerk: string;
    payAtCheckinPerk: string;
    minStayWarningTitle: string;
    /** template: {n} */
    minStayWarningBody: string;
    /** template: {n} */
    minStayWarningSelected: string;
    /** template: {n} */
    accommodationAmountLabel: string;
    /* 🛡️ PHASE 10B — BookingSummary.tsx "Kısa Süreli Konaklama Ücreti"
       satırı. `booking.cleaningFee` ("Temizlik Ücreti") ile KASITLI
       olarak AYRI tutuldu — component'in bugünkü gerçek metni farklı;
       mevcut `cleaningFee` anahtarı/değeri DEĞİŞTİRİLMEDİ. */
    shortStayFeeLabel: string;
    poolHeatingFeeLabel: string;
    poolHeatingPerNightSuffix: string;
    /** template: {n} */
    poolHeatingNightsMultiplier: string;
    /** template: {rate} */
    prepaymentAmountLabel: string;
    dueAtCheckinLabel: string;
    depositLabel: string;
    depositNote: string;
    reservationErrorSelectDate: string;
    /** template: {n} */
    reservationErrorMinStay: string;
    /** template: {n} */
    reservationErrorOrphanGap: string;
    conflictError: string;
    calendarToday: string;
    mobileCtaAriaLabel: string;
  };
  filters: {
    filter: string;
    date: string;
    guestCount: string;
    region: string;
    villaType: string;
    apply: string;
    clear: string;
  };
  /* 🛡️ PHASE 10B — AvailabilityInlineCalendar + BookingCalendar
     (legend/nav/hafta günleri) ortak anahtarları. */
  availability: {
    /** Pzt/Sal/Çar/Per/Cum/Cmt/Paz sırasıyla — 7 eleman sabit. */
    weekdayShort: readonly [
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ];
    prevMonth: string;
    nextMonth: string;
    legendConfirmed: string;
    legendConfirmedTitle: string;
    legendPending: string;
    legendPendingTitle: string;
    legendAvailable: string;
    legendAvailableTitle: string;
  };
  /* 🛡️ PHASE 10B — Gallery.tsx UI stringleri. */
  gallery: {
    noImages: string;
    playVideo: string;
    /** template: {title} */
    playVideoAriaLabelWithTitle: string;
    playVideoAriaLabel: string;
    /** template: {count} */
    viewAllPhotos: string;
    /** template: {count} */
    viewAllPhotosAriaLabel: string;
    /** template: {title} */
    coverPhotoAlt: string;
    /** template: {title}, {index} */
    photoAlt: string;
    /** template: {title}, {index}, {total} */
    photoAltWithTotal: string;
    /** template: {index} */
    photoAriaLabel: string;
  };
  /* 🛡️ PHASE 10B — PriceList.tsx UI stringleri. */
  price: {
    noPriceInfo: string;
    nightly: string;
    /** template: {percent} */
    discountedBadgeWithPercent: string;
    discountedBadge: string;
    infoAriaLabel: string;
    /** template: {n} */
    minNights: string;
    /** template: {amount} */
    damageDeposit: string;
  };
  /* 🛡️ PHASE 10B — EN/DE villa detail sayfası, TR page.tsx'in özel
     "Villa bulunamadı" bloğunun ve boş açıklama fallback'inin
     locale-aware karşılığı. */
  villa: {
    notFoundTitle: string;
    notFoundBody: string;
    notFoundCta: string;
    descriptionEmpty: string;
  };
  /* 🛡️ PHASE 10D — BATCH 4: LocationStep canonical mesafe başlıklarının
     (yalnız TITLE — mesafe DEĞERİ "5 km"/"500 m" ASLA buraya girmez)
     EN/DE public karşılıkları. BİLİNÇLİ kapsam genişletmesi: bu
     dosyanın üst yorumu "DB içeriği BURADA YOK" der — ancak bu 12
     başlık serbest DB metni DEĞİL, sabit/canonical bir enum'dur
     (DISTANCE_OPTIONS). Batch 4 görev tanımının AÇIK talimatı üzerine
     eklendi. Key'ler DB'deki TR canonical title'ların KENDİSİ. Legacy/
     custom (canonical OLMAYAN) title'lar bu haritaya HİÇ girmez —
     getTranslatedDistanceLabel() (lib/distance-label.helper.ts) onları
     olduğu gibi döner, dictionary'de aranmaz. */
  distanceLabels: Record<DistanceCanonicalTitle, string>;
  /* 🛡️ PHASE 10E — Konaklama Düzeni (migration 047) ENUM etiketleri.
     distanceLabels ile AYNI gerekçe: bunlar serbest DB metni DEĞİL,
     kapalı küme enum'lardır. Oda/banyo ADLARI buraya GİRMEZ (villa
     bazlı serbest metin → villa_translations, migration 083). */
  bedTypeLabels: Record<BedType, string>;
  bathroomTypeLabels: Record<BathroomType, string>;
  /* 🛡️ PHASE 10E — AccommodationLayout component'inin UI metinleri.
     `{n}` şablonları formatDictionaryString() ile doldurulur
     (lib/i18n/format-dictionary-string.ts — mevcut desen).
     TR değerleri component'in BUGÜNKÜ hardcoded metinleriyle BİREBİR
     aynıdır (byte-identical TR davranışı). */
  accommodation: {
    sectionTitle: string;
    noDetail: string;
    /** template: {n} */
    bedroomFallback: string;
    /** template: {n} */
    bathroomFallback: string;
  };
  /* 🛡️ PHASE 10E BATCH 5 — havuz tipi etiketleri. bedTypeLabels ile AYNI
     gerekçe: kapalı küme canonical enum (serbest DB metni DEĞİL).
     Key'ler lib/pool.helper.ts'teki PoolTypeKey ile type-safe bağlı. */
  /* 🛡️ PHASE 10F — Konaklama düzeni ODA/BANYO ADLARI.
     Villa bazlı admin çevirisi KALDIRILDI; adlar artık yalnız bu
     sözlükten çözülür. Key'ler AccommodationLayoutStep'in sunduğu
     canonical TR adlardır (lib/villa-layout.helper.ts →
     BEDROOM_NAME_SUGGESTIONS) + numarasız temel biçimler.
     Numaralı adlar ("3. Yatak Odası") ayrıca desteklenir: mevcut
     `accommodation.bedroomFallback`/`bathroomFallback` şablonlarıyla
     üretilir — yeni şablon EKLENMEDİ.
     Sözlükte olmayan serbest adlar (örn. "Deniz Manzaralı Süit")
     olduğu gibi döner (doğal TR fallback). */
  roomNameLabels: Record<string, string>;
  poolTypeLabels: Record<PoolTypeKey, string>;
  /* 🛡️ PHASE 10E BATCH 5 — havuz bölümünün UI metinleri. TR değerleri
     kiralik-villa/[slug] sayfasının BUGÜNKÜ hardcoded metinleriyle
     BİREBİR aynıdır (byte-identical TR davranışı). */
  pool: {
    sectionTitle: string;
    width: string;
    length: string;
    depth: string;
    noDimensions: string;
  };
};
