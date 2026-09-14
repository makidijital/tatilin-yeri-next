/* ===============================================================
   🛡️ DICTIONARY — EN
   ===============================================================
   Doğal İngilizce çeviri. TR ile birebir aynı key yapısı — eksik/
   fazla key TypeScript derleme hatası verir (bkz. ./types.ts).
   Bu fazda hiçbir public route EN göstermiyor; bu dosya yalnız
   dictionary altyapısının bir parçası.
   =============================================================== */
import type { Dictionary } from "./types";

export const en: Dictionary = {
  common: {
    search: "Search",
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    continue: "Continue",
    back: "Back",
    next: "Next",
    previous: "Previous",
    loading: "Loading",
    error: "Something went wrong",
    success: "Success",
    viewAll: "View All",
  },
  header: {
    home: "Home",
    villas: "Villas",
    regions: "Regions",
    villaTypes: "Villa Types",
    blog: "Blog",
    contact: "Contact",
    offer: "Get a Quote",
    favorites: "Favorites",
    support: "Support",
    menuOpen: "Open menu",
    menuClose: "Close menu",
  },
  footer: {
    explore: "Explore",
    villas: "Villas",
    regions: "Regions",
    allCategories: "All categories",
    allRegions: "All regions",
    exploreAllRegions: "Explore all regions",
    phone: "Phone",
    email: "Email",
    address: "Address",
    checkReservation: "Check Reservation",
    webDevelopment: "Web Development",
  },
  booking: {
    reservation: "Reservation",
    checkIn: "Check-in",
    checkOut: "Check-out",
    guests: "Guests",
    accommodation: "Accommodation Total",
    total: "Total Amount",
    prepayment: "Prepayment",
    remainingPayment: "Remaining Payment",
    cleaningFee: "Cleaning Fee",
    poolHeating: "Pool Heating",
    discount: "Discount",
    discountedTotal: "Discounted Total",
    nights: "Nights",
  },
  filters: {
    filter: "Filter",
    date: "Date",
    guestCount: "Guest Count",
    region: "Region",
    villaType: "Villa Type",
    apply: "Apply",
    clear: "Clear",
  },
};
