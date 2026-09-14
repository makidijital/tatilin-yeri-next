/* ===============================================================
   🛡️ DICTIONARY — TR (kaynak dil / source-of-truth)
   ===============================================================
   Bu dosyadaki değerler mevcut public UI'da zaten kullanılan gerçek
   Türkçe metinlerle uyumludur (örn. "Teklif Al" — Header.tsx,
   "Keşfet"/"Rezervasyon Sorgula" — Footer.tsx, "İndirimli Tutar" —
   BookingSummary.tsx/ReservationForm.tsx). Bu fazda yalnız Header
   ve Footer bu dictionary'ye bağlandı (bkz. Phase 2 raporu); diğer
   key'ler gelecek fazlar için hazır içerik olarak burada duruyor,
   henüz hiçbir component onları okumuyor.
   =============================================================== */
import type { Dictionary } from "./types";

export const tr: Dictionary = {
  common: {
    search: "Ara",
    close: "Kapat",
    cancel: "Vazgeç",
    save: "Kaydet",
    continue: "Devam Et",
    back: "Geri",
    next: "İleri",
    previous: "Önceki",
    loading: "Yükleniyor",
    error: "Bir hata oluştu",
    success: "Başarılı",
    viewAll: "Tümünü Gör",
  },
  header: {
    home: "Anasayfa",
    villas: "Villalar",
    regions: "Bölgeler",
    villaTypes: "Villa Tipleri",
    blog: "Blog",
    contact: "İletişim",
    offer: "Teklif Al",
    favorites: "Favorilerim",
    support: "Destek",
    menuOpen: "Menüyü aç",
    menuClose: "Menüyü kapat",
  },
  footer: {
    explore: "Keşfet",
    villas: "Villalar",
    regions: "Bölgeler",
    allCategories: "Tüm kategoriler",
    allRegions: "Tüm bölgeler",
    exploreAllRegions: "Tüm bölgeleri keşfet",
    phone: "Telefon",
    email: "E-posta",
    address: "Adres",
    checkReservation: "Rezervasyon Sorgula",
    webDevelopment: "Web Geliştirme",
  },
  booking: {
    reservation: "Rezervasyon",
    checkIn: "Giriş Tarihi",
    checkOut: "Çıkış Tarihi",
    guests: "Misafir Sayısı",
    accommodation: "Konaklama Tutarı",
    total: "Toplam Tutar",
    prepayment: "Ön Ödeme",
    remainingPayment: "Kalan Ödeme",
    cleaningFee: "Temizlik Ücreti",
    poolHeating: "Havuz Isıtma",
    discount: "İndirim",
    discountedTotal: "İndirimli Tutar",
    nights: "Gece",
  },
  filters: {
    filter: "Filtrele",
    date: "Tarih",
    guestCount: "Misafir Sayısı",
    region: "Bölge",
    villaType: "Villa Tipi",
    apply: "Uygula",
    clear: "Temizle",
  },
};
