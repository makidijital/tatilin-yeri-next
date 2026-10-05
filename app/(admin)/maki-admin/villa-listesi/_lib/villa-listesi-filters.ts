import { calculateGrandTotal, type DiscountRange } from "@/lib/price.engine";
import { normalizeSearchText } from "@/lib/search";

/* ===============================================================
   🏛️ ADMIN VİLLA LİSTESİ — FİLTRE KURALLARI (admin'e ait, bağımsız)
   ===============================================================
   Bu dosya YALNIZ `/maki-admin/villa-listesi` tarafından kullanılır.

   REFERANS DAVRANIŞ: public Hero Search → `/arama`
   (`app/components/search/AramaPageBody.tsx`). Aşağıdaki her kural,
   oradaki karşılığının DAVRANIŞINI birebir taklit eder; ancak kod
   BİLİNÇLİ OLARAK paylaşılmaz (mimari karar): admin listesi ileride
   public'te olmayan filtreler alabilsin diye bağımsız geliştirilir.
   Public tarafta bir kural değişirse burası OTOMATİK değişmez —
   gerektiğinde elle hizalanmalıdır.

   GENİŞLETME: yeni bir admin filtresi eklemek için
     1) `AdminVillaFilters` tipine alanı ekle,
     2) `matchesBaseFilters` içine (diğerleriyle AND) kuralı ekle,
     3) VillaListesiClient'ta state + UI + `filterSignature`'a ekle.
   Uygunluk (müsaitlik) ve fiyat kapsamı tarihe bağlı ikinci aşamadır
   (`isVisibleForDateRange`); esnek ±N gün ayrı havuzdur.

   SAF (pure): DB/ağ/React yok → birim testlenebilir, client-safe.
   =============================================================== */

/** Public Hero "Gelişmiş Arama" checkbox'ı `flexible=3` yazar
 *  (`buildHeroSearchParams`); `/arama` en fazla 3'e kırpar. */
export const ADMIN_FLEX_DAYS = 3;

/** Public Hero kişi alanının varsayılanı (HeroSearchPanel `useState(2)`). */
export const ADMIN_DEFAULT_GUESTS = 2;

export type AdminFilterLocation = {
  id: string;
  name: string;
  filter_group_name?: string | null;
};

/** Filtrelerin okuduğu minimum villa alanları. */
export type AdminFilterableVilla = {
  id: string;
  slug: string;
  title: string;
  location_id: string;
  location: string;
  guests: number | null;
  prices: Array<{
    price: number;
    currency: string;
    start_date: string;
    end_date: string;
  }>;
  discounts?: DiscountRange[];
};

export type AdminVillaFilters = {
  /** Seçili bölgelerin GENİŞLETİLMİŞ location_id kümesi; null = filtre yok. */
  locationIds: Set<string> | null;
  /** 0 = kişi filtresi yok. */
  guests: number;
  /** Villa tipi id'leri (AND). */
  categoryIds: string[];
  /** villa.id → type_id[] */
  villaCategoryMap: Record<string, string[]>;
  /** Villa özelliği id'leri (AND). */
  featureIds: string[];
  /** villa.id → feature_id[] */
  villaFeatureMap: Record<string, string[]>;
  /** Admin'e özel metin araması (title / bölge / slug / id). */
  search: string;
};

/* ---------------------------------------------------------------
   TARİH
--------------------------------------------------------------- */

/** Date → YYYY-MM-DD (local TZ; UTC drift yok). */
export function formatAdminYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `/arama` ile aynı kural: iki tarih de geçerli YYYY-MM-DD VE start < end. */
export function isAdminDateRange(start: string, end: string): boolean {
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  return ymd.test(start) && ymd.test(end) && start < end;
}

/** YMD + N gün (UTC-safe string kaydırma) — `/arama` `shiftYmd` davranışı. */
export function shiftAdminYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Esnek arama pencereleri — süre sabit, ±1..±N gün kaydırılmış
 *  (`/arama`: shifts [-3,-2,-1,1,2,3] ∩ |s| ≤ flexDays). */
export function buildAdminFlexWindows(
  start: string,
  end: string,
  flexDays: number = ADMIN_FLEX_DAYS
): Array<{ start: string; end: string }> {
  if (!isAdminDateRange(start, end) || flexDays <= 0) return [];
  return [-3, -2, -1, 1, 2, 3]
    .filter((s) => Math.abs(s) <= flexDays)
    .map((s) => ({ start: shiftAdminYmd(start, s), end: shiftAdminYmd(end, s) }))
    .filter((w) => w.start < w.end);
}

/* ---------------------------------------------------------------
   BÖLGE (Migration 050 grup mantığı)
--------------------------------------------------------------- */

/** Dropdown yalnız grup kökleri: name === filter_group_name. */
export function adminRootLocations<T extends AdminFilterLocation>(
  locations: T[]
): T[] {
  return locations.filter((l) => {
    const g = (l.filter_group_name ?? "").toString().trim();
    return g.length > 0 && l.name === g;
  });
}

/** Çoklu bölge seçimi → filtrelenecek location_id kümesi.
 *  `/arama` `expandedRegions` ile aynı: grup kökü seçildiyse o gruba ait
 *  TÜM lokasyonlar; kök olmayan seçim yalnız kendisi. Boş seçim → null. */
export function expandAdminRegionSelection(
  regionIds: string[],
  locations: AdminFilterLocation[]
): Set<string> | null {
  if (regionIds.length === 0) return null;
  const byId = new Map(locations.map((l) => [l.id, l]));
  const out = new Set<string>();
  for (const id of regionIds) {
    const loc = byId.get(id);
    const group = (loc?.filter_group_name ?? "").toString().trim();
    const isGroupRoot = !!loc && !!group && loc.name === group;
    if (isGroupRoot) {
      for (const o of locations) {
        if ((o.filter_group_name ?? "").toString().trim() === group) {
          out.add(o.id);
        }
      }
    } else {
      out.add(id);
    }
  }
  return out;
}

/* ---------------------------------------------------------------
   TEMEL FİLTRELER (tarihten bağımsız)
--------------------------------------------------------------- */

/** Villa, seçili id'lerin HEPSİNE sahip mi (AND)? `/arama` tip/özellik
 *  semantiği: villa başına unique eşleşen id sayısı === seçim sayısı. */
function hasAll(owned: string[] | undefined, required: string[]): boolean {
  if (required.length === 0) return true;
  if (!owned || owned.length === 0) return false;
  const set = new Set(owned);
  return required.every((id) => set.has(id));
}

/** Tarihten bağımsız tüm filtreler (AND). `/arama`'daki DB sorgusu
 *  (`findSearchResults`: bölge + kişi + tip∩özellik) + admin metin araması.
 *  Aktif/silinmiş kuralı veri kaynağında uygulanır
 *  (`findActiveCuratorCards`: is_active = true AND deleted_at IS NULL). */
export function matchesBaseFilters(
  v: AdminFilterableVilla,
  f: AdminVillaFilters
): boolean {
  if (f.locationIds && !f.locationIds.has(v.location_id)) return false;
  if (f.guests > 0 && (v.guests ?? 0) < f.guests) return false;
  if (!hasAll(f.villaCategoryMap[v.id], f.categoryIds)) return false;
  if (!hasAll(f.villaFeatureMap[v.id], f.featureIds)) return false;

  const q = normalizeSearchText(f.search);
  if (q) {
    const haystack = normalizeSearchText(
      `${v.title || ""} ${v.location || ""} ${v.slug || ""} ${v.id || ""}`
    );
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/* ---------------------------------------------------------------
   TARİHE BAĞLI KURALLAR
--------------------------------------------------------------- */

/** Seçilen aralığın TÜM gecelerinde fiyatı var mı? `/arama` ile aynı
 *  ölçüt: fiyat motorunun `priceAvailable` alanı (TRY + {TRY:1} yalnız
 *  zorunlu parametre; kapsam kurdan/indirimden bağımsız). */
export function hasAdminPriceCoverage(
  v: AdminFilterableVilla,
  start: string,
  end: string
): boolean {
  return calculateGrandTotal({
    start,
    end,
    prices: v.prices,
    currency: "TRY",
    rates: { TRY: 1 },
    discounts: v.discounts ?? [],
  }).priceAvailable;
}

/** Tarihli aramada ana listeye girme şartı: dolu değil + fiyat kapsamı tam. */
export function isVisibleForDateRange(
  v: AdminFilterableVilla,
  start: string,
  end: string,
  blocked: Set<string>
): boolean {
  return !blocked.has(v.id) && hasAdminPriceCoverage(v, start, end);
}
