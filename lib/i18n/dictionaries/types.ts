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
};
