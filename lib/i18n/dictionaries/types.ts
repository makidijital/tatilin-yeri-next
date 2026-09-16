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
};
