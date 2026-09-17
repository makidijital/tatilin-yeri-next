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

/** 1..12 — `home.months` sözlüğünün exhaustiveness anahtarı. */
export type MonthNumber =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

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
    /* 🛡️ PHASE 10G — VillaCardBookingModal.tsx (villa detay "Benzer
       Villalar" kartlarından açılır). */
    perNightSuffix: string;
    dateLabel: string;
    modalEyebrow: string;
    modalAriaLabel: string;
    modalLoadingAriaLabel: string;
    modalLoading: string;
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
    /* 🛡️ PHASE 10G — VillaVideoModal.tsx */
    closeVideoAriaLabel: string;
    otherVideosAriaLabel: string;
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
    /* 🛡️ PHASE 10G — TR villa detay sayfasının (kiralik-villa/[slug])
       BUGÜNKÜ hardcoded section metinleri. TR değerleri o dosyadaki
       literal'lerle BİREBİR aynıdır (byte-identical TR davranışı). */
    aboutTitle: string;
    seasonPricesTitle: string;
    calendarTitle: string;
    distancesEyebrow: string;
    distancesTitle: string;
    distancesSubtitle: string;
    distancesEmpty: string;
    featuresTitle: string;
    featuresEmpty: string;
    priceIncludesTitle: string;
    rulesTitle: string;
    checkInOutTitle: string;
    checkInLabel: string;
    checkOutLabel: string;
    similarVillasTitle: string;
    /* 🛡️ PHASE 10G — CollapsibleDescription.tsx */
    readMore: string;
    readLess: string;
    tourismCertificate: string;
    /** template: {n} */
    documentNumber: string;
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
  /* 🛡️ PHASE 10G — VillaDetailTabs.tsx (sekme etiketleri + nav aria). */
  villaTabs: {
    navAriaLabel: string;
    prices: string;
    availability: string;
    location: string;
    features: string;
  };
  /* 🛡️ PHASE 10G — VillaMapModal.tsx. `embedLanguage` Google Maps embed
     URL'indeki `hl=` parametresidir (UI metni DEĞİL, dil kodu). */
  map: {
    openMap: string;
    directions: string;
    directionsUnavailableTitle: string;
    /** template: {title} */
    modalAriaLabel: string;
    modalAriaLabelFallback: string;
    closeAriaLabel: string;
    whereTitle: string;
    poweredByGoogle: string;
    noLocation: string;
    embedLanguage: string;
  };
  /* 🛡️ PHASE 10G — ShortStayFeeNotice.tsx. */
  shortStay: {
    /** template: {n} */
    ariaLabel: string;
    /** template: {n} */
    body: string;
    hint: string;
  };
  /* 🛡️ PHASE 10G — FavoriteButton.tsx. */
  favorites: {
    add: string;
    remove: string;
    saved: string;
    save: string;
  };
  /* 🛡️ PHASE 10G — VillaReviewsSection.tsx. */
  reviews: {
    eyebrow: string;
    title: string;
    outOfFive: string;
    /** template: {n} */
    countLabel: string;
    empty: string;
    featuredAriaLabel: string;
    featuredBadge: string;
    formOpen: string;
    formClose: string;
    /** template: {value} */
    ratingAriaLabel: string;
    ratingPickerAriaLabel: string;
    /** template: {n} */
    starAriaLabel: string;
    formTitle: string;
    formSubtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    ratingLabel: string;
    commentLabel: string;
    commentPlaceholder: string;
    /** template: {n} */
    minChars: string;
    successMessage: string;
    submitting: string;
    submit: string;
  };
  /* 🛡️ PHASE 10G — VillaCard.tsx (villa detay "Benzer Villalar" bölümü
     bu kartı EN/DE'de de render eder). TR değerleri component'in
     BUGÜNKÜ hardcoded metinleriyle BİREBİR aynıdır. */
  card: {
    villaAlt: string;
    imageComing: string;
    noLocation: string;
    priceOnRequest: string;
    startingFromUpper: string;
    startingFromLower: string;
    total: string;
    nightly: string;
    /** template: {n} */
    nights: string;
    cleaningIncluded: string;
    cleaningIncludedSuffix: string;
    /** template: {n} */
    reviewCount: string;
    /** template: {value}, {count} */
    ratingAriaLabel: string;
    availabilityCta: string;
    availabilityAriaLabel: string;
    bedroom: string;
    bathroom: string;
    person: string;
    /** template: {n} */
    guestsAriaLabel: string;
    /** template: {n} */
    bedroomsAriaLabel: string;
    /** template: {n} */
    bathroomsAriaLabel: string;
    /** template: {n} */
    guestsValue: string;
    /** template: {n} */
    bedroomsValue: string;
    /** template: {n} */
    bathroomsValue: string;
    /** template: {percent} */
    discountBadge: string;
    /** template: {percent} */
    discountBadgeAriaLabel: string;
    /** template: {amount} */
    nightlySavings: string;
    bookNow: string;
    bookNowAriaLabel: string;
    /** template: {n} */
    reserveNights: string;
    flexibleTitle: string;
    flexibleSubtitle: string;
  };
  /* ===============================================================
     🛡️ PHASE 11 — ANA SAYFA (homepage) UI METİNLERİ
     ===============================================================
     Yalnız STATİK UI metni. Admin'in girdiği içerik (hero_*,
     settings_translations) ve DB içeriği (villa adı, bölge adı,
     villa tipi adı, SSS soru/cevap) BURADA YOKTUR — onlar kendi
     çeviri kaynaklarından gelir.

     `hero.*` alanları ADMIN BOŞ BIRAKIRSA kullanılan varsayılanlardır
     (lib/hero.helpers.ts > HERO_DEFAULTS / HERO_CTA_DEFAULTS ile TR'de
     BİREBİR aynı değerler).
     =============================================================== */
  home: {
    hero: {
      badge: string;
      /** `\n` ile çok satırlı olabilir (Hero ilk satırı beyaz render eder). */
      title: string;
      subtitle: string;
      primaryCtaText: string;
      secondaryCtaText: string;
      /** Hero arka plan görselinin alt metni (başlık boşsa kullanılır). */
      imageAlt: string;
    };
    search: {
      dateLabel: string;
      datePlaceholder: string;
      typeLabel: string;
      villaType: string;
      /** template: {n} */
      typesSelected: string;
      regionLabel: string;
      allRegions: string;
      /** template: {n} */
      regionsSelected: string;
      guestsLabel: string;
      /** template: {n} — kişi sayısı dropdown seçenekleri (1..10) */
      guestsOption: string;
      optionsLoading: string;
      advanced: string;
      flexibleHint: string;
      submit: string;
    };
    advantages: {
      sectionAriaLabel: string;
      experienceTitle: string;
      experienceDescription: string;
      priceTitle: string;
      priceDescription: string;
      trustTitle: string;
      trustDescription: string;
    };
    discount: {
      title: string;
      carouselAriaLabel: string;
    };
    villaTypes: {
      sectionAriaLabel: string;
      title: string;
      subtitle: string;
      carouselAriaLabel: string;
      /** template: {count} */
      countBadge: string;
    };
    villas: {
      title: string;
      ctaAll: string;
      emptyEyebrow: string;
      emptyTitle: string;
      emptyBody: string;
    };
    regions: {
      sectionAriaLabel: string;
      title: string;
      subtitle: string;
      carouselAriaLabel: string;
      ctaAll: string;
    };
    shortGaps: {
      title: string;
      subtitle: string;
      carouselAriaLabel: string;
      badge: string;
      /** template: {n} */
      nightsLabel: string;
    };
    faq: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    reviews: {
      sectionAriaLabel: string;
      eyebrow: string;
      title: string;
      subtitle: string;
      /** Uzun yorumu genişleten buton. */
      readMore: string;
      readLess: string;
      /** İsim rail'inin aria-label'ı. */
      navigationLabel: string;
      /** template: {name} — rail butonu aria-label'ı. */
      showReview: string;
    };
    /** Yatay kaydırmalı bölümlerin (HorizontalCarousel) ok butonları.
     *  Yalnız accessibility metni — görsel davranış DEĞİŞMEZ. */
    carousel: {
      previous: string;
      next: string;
    };
    seo: {
      /** WebSite JSON-LD `description` alanı. */
      websiteDescription: string;
    };
    /** Ay adları (1=Ocak … 12=Aralık). ShortGaps kart başlıkları.
     *  `lib/short-gaps.helpers.ts > MONTH_NAMES_TR` ile TR'de BİREBİR. */
    months: Record<MonthNumber, string>;
  };
};
