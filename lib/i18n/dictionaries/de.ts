/* ===============================================================
   🛡️ DICTIONARY — DE
   ===============================================================
   Doğal Almanca çeviri. TR ile birebir aynı key yapısı — eksik/
   fazla key TypeScript derleme hatası verir (bkz. ./types.ts).
   Bu fazda hiçbir public route DE göstermiyor; bu dosya yalnız
   dictionary altyapısının bir parçası.
   =============================================================== */
import type { Dictionary } from "./types";

export const de: Dictionary = {
  common: {
    search: "Suchen",
    close: "Schließen",
    cancel: "Abbrechen",
    save: "Speichern",
    continue: "Weiter",
    back: "Zurück",
    next: "Weiter",
    previous: "Zurück",
    loading: "Wird geladen",
    error: "Ein Fehler ist aufgetreten",
    success: "Erfolgreich",
    viewAll: "Alle anzeigen",
  },
  header: {
    home: "Startseite",
    villas: "Villen",
    regions: "Regionen",
    villaTypes: "Villentypen",
    blog: "Blog",
    contact: "Kontakt",
    offer: "Angebot anfordern",
    favorites: "Favoriten",
    support: "Support",
    menuOpen: "Menü öffnen",
    menuClose: "Menü schließen",
  },
  footer: {
    explore: "Entdecken",
    villas: "Villen",
    regions: "Regionen",
    allCategories: "Alle Kategorien",
    allRegions: "Alle Regionen",
    exploreAllRegions: "Alle Regionen entdecken",
    phone: "Telefon",
    email: "E-Mail",
    address: "Adresse",
    checkReservation: "Reservierung prüfen",
    webDevelopment: "Webentwicklung",
  },
  booking: {
    reservation: "Reservierung",
    checkIn: "Anreise",
    checkOut: "Abreise",
    guests: "Gäste",
    accommodation: "Unterkunftsbetrag",
    total: "Gesamtbetrag",
    prepayment: "Anzahlung",
    remainingPayment: "Restzahlung",
    cleaningFee: "Reinigungsgebühr",
    poolHeating: "Poolheizung",
    discount: "Rabatt",
    discountedTotal: "Rabattierter Betrag",
    nights: "Nächte",
  },
  filters: {
    filter: "Filtern",
    date: "Datum",
    guestCount: "Gästeanzahl",
    region: "Region",
    villaType: "Villentyp",
    apply: "Anwenden",
    clear: "Zurücksetzen",
  },
};
