"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Check,
  Square,
  CheckSquare,
  Share2,
  Copy,
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import AdminDateRangePicker from "@/app/components/admin/shared/AdminDateRangePicker";
/* 🛡️ Public /arama ile AYNI availability motoru — get_blocked_villa_ids
   RPC (mig 039, SECURITY DEFINER, PII-safe, anon'dan da çağrılabilir).
   Reservations(pending/confirmed) + manual_reservations + external
   (is_active) half-open [start,end) overlap birleşimi. */
import { getBlockedVillaIdsAction } from "@/lib/availability.action";

import VillaCard from "@/app/components/villa/VillaCard";
import {
  getStartingPrice,
  calculateGrandTotal,
  calculateNights,
  type DiscountRange,
} from "@/lib/price.engine";
/* 🛡️ Public /arama sorting motoru — AYNEN reuse (duplicate logic yok). */
import {
  applyPublicSort,
  parsePublicSort,
  computePageWindow,
  type PublicSort,
} from "@/lib/pagination";
import { useCurrency } from "@/app/context/CurrencyContext";
import { createSharedVillaListAction as createSharedVillaList } from "./shared-villa-list.action";
import {
  DEFAULT_EXPIRATION_KEY,
  type ExpirationKey,
} from "@/app/services/shared-villa-list.constants";
import type { SharedSearchParams } from "@/app/services/shared-villa-list.service";
/* 🏛️ Admin'e ait filtre kuralları — public `/arama` DAVRANIŞINI taklit
   eder ama kod paylaşmaz (bkz. dosya başlığı). */
import {
  ADMIN_DEFAULT_GUESTS,
  ADMIN_FLEX_DAYS,
  adminRootLocations,
  buildAdminFlexWindows,
  expandAdminRegionSelection,
  formatAdminYmd,
  isAdminDateRange,
  isVisibleForDateRange,
  matchesBaseFilters,
  type AdminVillaFilters,
} from "../_lib/villa-listesi-filters";

/* Pill select label table — frontend kullanır, server-side
   ALLOWED_EXPIRATIONS map ile zaten sınırlı (key allow-list). */
const EXPIRATION_OPTIONS: ReadonlyArray<{
  key: ExpirationKey;
  label: string;
}> = [
  { key: "1h", label: "1 Saat" },
  { key: "3h", label: "3 Saat" },
  { key: "6h", label: "6 Saat" },
  { key: "24h", label: "24 Saat" },
];

/* 🚀 RENDER PAGINATION — sayfa başına gösterilecek kart sayısı.
   YALNIZ RENDER KATMANI: veri çekme, filtreleme, arama, sıralama,
   fiyat hesabı ve seçim mantığı bu sabitten ETKİLENMEZ; hepsi
   filtrelenmiş TÜM liste üzerinde çalışmaya devam eder. Yalnız
   `.map()` edilen dilim sınırlanır. 24 = grid'in 2/3/4 kolon
   varyantlarının üçüne de tam bölünen değer. */
const RENDER_PAGE_SIZE = 24;

/* ===============================================================
   🏛️ VillaListesiClient — admin curator orchestrator
   ===============================================================
   AKIŞ:
     - Filter bar (tarih, villa tipi, bölge, özellikler, kişi, esnek ±3)
     - VillaCard grid (selection checkbox overlay)
     - Esnek sonuçlar (±3 gün) ayrı bölümde, altta — seçilebilir
     - Sticky alt bar: "X villa seçildi" + "Listeyi Paylaş" CTA
     - Modal: title/note + token üretimi + paylaşılabilir link

   ARAMA DAVRANIŞI (public Hero Search → /arama referans alınır):
     - Bölge çoklu + grup kökü genişletme, villa tipi AND, özellik AND,
       kişi ≥ (varsayılan 2), aktif & silinmemiş villalar.
     - Tarih seçiliyse: o tarihte DOLU villa ve seçilen gecelerin
       tamamında fiyatı OLMAYAN villa ana listeden çıkar.
     - Esnek ±3: ana tarihte dolu ama kaydırılmış pencerede müsait
       villalar ayrı bölümde (sayaç/sıralama/sayfalama dışı).
     - Kurallar `../_lib/villa-listesi-filters.ts` içinde, ADMIN'E AİT.

   ADMIN'E ÖZEL (public'te yok): metin arama, seçim/paylaşım,
   24'lük render sayfalaması, URL'siz local state.

   PRICING:
     - Tarih girildiyse VillaCard `stayStart/stayEnd/prices/stayDiscounts/
       cleaning_*` props alır → `calculateGrandTotal` ile indirimli total.
     - Tarih yoksa `getStartingPrice` fallback (arama page ile aynı).
     - Currency conversion `VillaCard` içinde (CurrencyContext).
   =============================================================== */

export type VillaListesiRow = {
  id: string;
  slug: string;
  title: string;
  location_id: string;
  location: string;
  price: number | null;
  currency: string | null;
  images: string[];
  badge: string | null;
  guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  cleaning_fee: number;
  cleaning_currency: string;
  cleaning_limit: number;
  prices: Array<{
    price: number;
    currency: string;
    start_date: string;
    end_date: string;
  }>;
  /** Aktif/gelecek indirim aralıkları (villa_discounts) — `/arama` ile
   *  aynı `calculateGrandTotal` `discounts` girdisi. Yoksa "indirim yok". */
  discounts?: DiscountRange[];
};

export type LocationOption = {
  id: string;
  name: string;
  /** Migration 050 — Hero/FilterSidebar ile aynı: dropdown yalnız grup
      köklerini (name === filter_group_name) gösterir; seçilen kök
      filtrede gruptaki tüm lokasyonlara genişler. */
  filter_group_name?: string | null;
};

export type CategoryOption = {
  id: string;
  name: string;
};

export type FeatureOption = {
  id: string;
  name: string;
};

const EMPTY_FEATURES: FeatureOption[] = [];
const EMPTY_MAP: Record<string, string[]> = {};

/** Açık dropdown dışına tıklanınca kapat (mevcut Kategori deseni). */
function useCloseOnOutside(
  open: boolean,
  ref: RefObject<HTMLDivElement | null>,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, ref, close]);
}

const toggleIn = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export default function VillaListesiClient({
  villas,
  locations,
  categories,
  villaCategoryMap,
  features = EMPTY_FEATURES,
  villaFeatureMap = EMPTY_MAP,
}: {
  villas: VillaListesiRow[];
  locations: LocationOption[];
  categories: CategoryOption[];
  /** villa.id → categoryId[] map. M:N junction precomputed server-side. */
  villaCategoryMap: Record<string, string[]>;
  /** Villa özellikleri (public Hero "Gelişmiş Arama" ile aynı tablo). */
  features?: FeatureOption[];
  /** villa.id → featureId[] map. */
  villaFeatureMap?: Record<string, string[]>;
}) {
  /* ---------------- FILTER STATE ----------------
     dateRange: react-datepicker selectsRange ile [Date|null, Date|null].
     start/end string'leri derive edilir; VillaCard'a pricing context
     ve share payload için YYYY-MM-DD format'ında geçirilir.
     guests: input string (boş "" → 0 = filtre yok). Varsayılan 2
       (public Hero kişi alanı varsayılanı).
     regionIds / categoryIds / featureIds: çoklu seçim (boş = tümü). */
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [startDateObj, endDateObj] = dateRange;
  const [guests, setGuests] = useState<string>(String(ADMIN_DEFAULT_GUESTS));
  /* 🛡️ Bölge — public Hero gibi ÇOKLU seçim (önce tekli idi). */
  const [regionIds, setRegionIds] = useState<string[]>([]);
  /* 🛡️ Villa tipi — çoklu, AND (public /arama ile aynı). */
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  /* 🛡️ Villa özellikleri — çoklu, AND (public "Gelişmiş Arama"). */
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  /* 🛡️ Esnek ±3 gün (public "Gelişmiş Arama" checkbox'ı). */
  const [flexible, setFlexible] = useState(false);

  /* Checkbox dropdown'lar aç/kapa + outside-click ref'leri. */
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const [featureOpen, setFeatureOpen] = useState(false);
  const featureRef = useRef<HTMLDivElement | null>(null);
  const closeCat = useMemo(() => () => setCatOpen(false), []);
  const closeRegion = useMemo(() => () => setRegionOpen(false), []);
  const closeFeature = useMemo(() => () => setFeatureOpen(false), []);
  useCloseOnOutside(catOpen, catRef, closeCat);
  useCloseOnOutside(regionOpen, regionRef, closeRegion);
  useCloseOnOutside(featureOpen, featureRef, closeFeature);

  const toggleCategory = (id: string) =>
    setCategoryIds((prev) => toggleIn(prev, id));
  const toggleRegion = (id: string) =>
    setRegionIds((prev) => toggleIn(prev, id));
  const toggleFeature = (id: string) =>
    setFeatureIds((prev) => toggleIn(prev, id));

  /* 🛡️ SORT — public /arama allow-list (smart | price-asc/desc |
     capacity-asc/desc). Default "smart" = mevcut server sırası (sort_order
     ASC, created_at DESC) AYNEN. */
  const [sort, setSort] = useState<PublicSort>("smart");
  /* Public ile aynı currency davranışı (yeni logic yok): CurrencyContext'ten
     currency + rates. Provider yoksa default (TRY, {}) → graceful, public ilk
     ziyaret fallback'iyle aynı. */
  const { currency, rates } = useCurrency();

  /* 🛡️ Client-side UI search — rezervasyonlar ekranı paritesi (ADMIN'E
     ÖZEL). Title / location adı / slug / id; diğer filtrelerle AND. */
  const [search, setSearch] = useState<string>("");

  /* Date → YYYY-MM-DD string (local, TZ-drift'siz). */
  const start = useMemo(
    () => (startDateObj ? formatAdminYmd(startDateObj) : ""),
    [startDateObj]
  );
  const end = useMemo(
    () => (endDateObj ? formatAdminYmd(endDateObj) : ""),
    [endDateObj]
  );

  /* ---------------- SELECTION ---------------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---------------- SHARE MODAL ---------------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [expirationKey, setExpirationKey] = useState<ExpirationKey>(
    DEFAULT_EXPIRATION_KEY
  );
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  /* ---------------- COMPUTED FILTER ---------------- */
  const guestsNum = (() => {
    const n = Number(guests);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  })();
  /* `/arama` ile aynı: iki tarih geçerli VE start < end. */
  const hasDateRange = isAdminDateRange(start, end);
  const rangeKey = hasDateRange ? `${start}|${end}` : "";

  /* ---------------- AVAILABILITY (public /arama paritesi) ----------------
     Tarih aralığı seçiliyse o aralıkta DOLU villa id'lerini getir
     (getBlockedVillaIds → get_blocked_villa_ids RPC).
     - Sonuç hangi aralık için alındığıyla (`key`) birlikte saklanır;
       yalnız GÜNCEL aralığa ait sonuç kullanılır → tarih değişince eski
       yanıt yanlış aralığa uygulanmaz. `cancelled` unmount/yeniden
       çalıştırmada eski yazımı durdurur.
     - FAIL-SOFT: hata → boş Set (helper ile aynı tutum). */
  const [blockedState, setBlockedState] = useState<{
    key: string;
    set: Set<string>;
  }>({ key: "", set: new Set() });

  useEffect(() => {
    if (!rangeKey) return;
    let cancelled = false;
    const candidateIds = villas.map((v) => v.id);
    (async () => {
      let set: Set<string>;
      try {
        set = new Set(await getBlockedVillaIdsAction(start, end, candidateIds));
      } catch {
        set = new Set(); // fail-soft
      }
      if (!cancelled) setBlockedState({ key: rangeKey, set });
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeKey, start, end, villas]);

  /* Seçili aralığın müsaitlik yanıtı henüz gelmedi → dolu villaların bir
     anlığına "müsait" görünüp seçilebilmesini önlemek için ana liste
     yanıt gelene kadar boş tutulur (public /arama SSR'da bu ara durum
     zaten yok). Hata da yanıt sayılır (fail-soft boş Set). */
  const availabilityPending = !!rangeKey && blockedState.key !== rangeKey;

  const blockedSet = useMemo(
    () =>
      rangeKey && blockedState.key === rangeKey
        ? blockedState.set
        : new Set<string>(),
    [rangeKey, blockedState]
  );

  /* ---------------- ESNEK ±3 GÜN (public /arama paritesi) ----------------
     Havuz: ana tarihte DOLU villalar. Her kaydırılmış pencere (süre sabit)
     için aynı availability action'ı; en az birinde müsait olan villa
     "esnek" sayılır. Ana start/end HİÇBİR YERDE değişmez (kart, paylaşım). */
  const flexKey = flexible && rangeKey ? `${rangeKey}|${ADMIN_FLEX_DAYS}` : "";
  const [flexState, setFlexState] = useState<{
    key: string;
    available: Set<string>;
  }>({ key: "", available: new Set() });

  useEffect(() => {
    if (!flexKey || blockedState.key !== rangeKey) return;
    const poolIds = Array.from(blockedState.set);
    let cancelled = false;
    (async () => {
      const available = new Set<string>();
      if (poolIds.length > 0) {
        const windows = buildAdminFlexWindows(start, end, ADMIN_FLEX_DAYS);
        const results = await Promise.all(
          windows.map((w) =>
            getBlockedVillaIdsAction(w.start, w.end, poolIds)
              .then((ids) => new Set(ids))
              .catch(() => null)
          )
        );
        for (const id of poolIds) {
          if (results.some((bs) => bs !== null && !bs.has(id))) {
            available.add(id);
          }
        }
      }
      if (!cancelled) setFlexState({ key: flexKey, available });
    })();
    return () => {
      cancelled = true;
    };
  }, [flexKey, rangeKey, blockedState, start, end]);

  /* 🛡️ Migration 050 — dropdown yalnız grup kökleri (name === group). */
  const rootLocations = useMemo(
    () => adminRootLocations(locations),
    [locations]
  );

  /* Seçilen bölgeler → filtrelenecek location_id kümesi (grup genişletme). */
  const expandedLocationIds = useMemo(
    () => expandAdminRegionSelection(regionIds, locations),
    [regionIds, locations]
  );

  /* Aşama 1 — tarihten bağımsız filtreler (public: DB sorgusu). */
  const baseFiltered = useMemo(() => {
    const f: AdminVillaFilters = {
      locationIds: expandedLocationIds,
      guests: guestsNum,
      categoryIds,
      villaCategoryMap,
      featureIds,
      villaFeatureMap,
      search,
    };
    return villas.filter((v) => matchesBaseFilters(v, f));
  }, [
    villas,
    expandedLocationIds,
    guestsNum,
    categoryIds,
    villaCategoryMap,
    featureIds,
    villaFeatureMap,
    search,
  ]);

  /* Aşama 2 — tarih seçiliyse: dolu değil + fiyat kapsamı tam. */
  const filtered = useMemo(
    () =>
      !hasDateRange
        ? baseFiltered
        : availabilityPending
          ? []
          : baseFiltered.filter((v) =>
              isVisibleForDateRange(v, start, end, blockedSet)
            ),
    [baseFiltered, hasDateRange, availabilityPending, start, end, blockedSet]
  );

  /* Esnek sonuçlar — ana listeden AYRI (sayaç/sıralama/sayfalama dışı). */
  const flexibleVillas = useMemo(() => {
    if (!flexKey || flexState.key !== flexKey) return [];
    return baseFiltered.filter(
      (v) => blockedSet.has(v.id) && flexState.available.has(v.id)
    );
  }, [flexKey, flexState, baseFiltered, blockedSet]);

  /* ---------------- SORT STAGE (public /arama reuse) ----------------
     `filtered` (availability + tüm filtreler) SONRASI, render ÖNCESİ temiz
     bir sıralama. Pipeline'a dokunulmaz; yalnız sıra değişir.
     - smart → no-op (applyPublicSort referansı aynen döner = server sırası).
     - capacity-asc/desc → public ile aynı: `guests` alanı.
     - price-asc/desc → public ile aynı motor:
         tarih var  → calculateGrandTotal().total (stay+cleaning, grand total)
         tarih yok  → getStartingPrice(prices) (base/starting fallback)
       Sonuç `_sortPrice` ile applyPublicSort'a verilir (public stay-total
       override deseniyle birebir). */
  const sortedFiltered = useMemo(() => {
    if (sort === "smart") return filtered;

    const isPrice = sort === "price-asc" || sort === "price-desc";
    if (!isPrice) {
      // Kapasite — applyPublicSort `guests` kullanır.
      return applyPublicSort(filtered, sort, { userCurrency: currency, rates });
    }

    const nights = hasDateRange ? calculateNights(start, end) : 0;
    const input = filtered.map((v) => {
      let sp: number | null = null;
      if (hasDateRange && nights > 0 && v.prices.length > 0) {
        const r = calculateGrandTotal({
          start,
          end,
          prices: v.prices,
          currency,
          rates,
          cleaning_fee: v.cleaning_fee,
          cleaning_currency: v.cleaning_currency,
          cleaning_limit: v.cleaning_limit,
          /* `/arama` ile aynı: kart indirimli toplamı gösterdiği için
             sıralama anahtarı da aynı indirimlerle hesaplanır. */
          discounts: v.discounts ?? [],
        });
        sp =
          typeof r.total === "number" &&
          Number.isFinite(r.total) &&
          r.total > 0
            ? r.total
            : null;
      } else {
        const base = getStartingPrice(v.prices);
        sp = base && base.price > 0 ? base.price : null;
      }
      return { ...v, _sortPrice: sp };
    });

    return applyPublicSort(input, sort, { userCurrency: currency, rates });
  }, [filtered, sort, hasDateRange, start, end, currency, rates]);

  /* ---------------- RENDER PAGINATION (yalnız görüntüleme) ----------------
     🚀 TEK AMAÇ: aynı anda mount edilen `VillaCard` sayısını sınırlamak.
     Bu blok pipeline'ın EN SONUNA eklenir — `filtered` ve `sortedFiltered`
     olduğu gibi kalır ve aşağıdaki davranışların HEPSİ filtrelenmiş TÜM
     liste üzerinde çalışmaya devam eder:
       • "Tümünü seç" (`selectAllFiltered` → `filtered`, sayfadan bağımsız)
       • seçim Set'i (sayfa değişince korunur)
       • sayaç (`filtered.length`)
       • arama / bölge / kategori / misafir / tarih-müsaitlik filtreleri
       • sıralama (fiyat/kapasite dahil) ve fiyat/kur hesapları
       • "Listeyi Paylaş" (seçili id'lerle çalışır, render'la değil)
     Yalnız `pageItems` render edilir.

     STATE: local `useState`. URL'e DOKUNULMAZ — bu sayfada filtreler de
     URL'de tutulmuyor (`useSearchParams`/`router` hiç kullanılmıyor);
     sayfayı URL'e yazmak refresh'te "filtre yok ama sayfa 40" tutarsızlığı
     üretirdi. En düşük riskli yöntem local state. */
  const [page, setPage] = useState(1);

  /* Sonuç kümesini değiştiren HER girdide 1. sayfaya dön — aksi halde
     filtre daraltılınca boş ekran kalırdı. (Mevcut iki admin pagination
     deseniyle aynı kural.)

     React'in "prop değişince state'i ayarla" deseni (render sırasında
     senkron ayar) kullanılır; `useEffect` + `setState` kullanılmaz —
     projenin `set-state-in-effect` lint kuralı ve cascading render
     maliyeti böylece devreye girmez. `blockedSet` imzaya GEREKMEZ:
     müsaitlik yalnız `start`/`end` değişince yeniden çözülür ve o
     değişim imzada zaten var. */
  const filterSignature = [
    search,
    regionIds.join(","),
    categoryIds.join(","),
    featureIds.join(","),
    guests,
    start,
    end,
    flexible ? "flex" : "",
    sort,
  ].join("|");
  const [prevFilterSignature, setPrevFilterSignature] =
    useState(filterSignature);
  if (prevFilterSignature !== filterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(sortedFiltered.length / RENDER_PAGE_SIZE)
  );
  /* Clamp — liste daralırsa mevcut sayfa aralık dışında kalmasın. */
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = sortedFiltered.slice(
    (safePage - 1) * RENDER_PAGE_SIZE,
    safePage * RENDER_PAGE_SIZE
  );

  /* ---------------- HANDLERS ---------------- */
  function gotoPage(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((v) => v.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openShareModal() {
    setShareUrl(null);
    setShareError(null);
    setModalOpen(true);
  }

  async function handleSubmitShare() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setShareError(null);

    const searchParams: SharedSearchParams = {};
    if (hasDateRange) {
      searchParams.start = start;
      searchParams.end = end;
    }
    if (guestsNum > 0) searchParams.guests = guestsNum;
    if (regionIds.length) searchParams.regions = regionIds;
    if (categoryIds.length) searchParams.categories = categoryIds;

    const res = await createSharedVillaList({
      villaIds: Array.from(selected),
      searchParams,
      title: title || undefined,
      note: note || undefined,
      expirationKey,
    });

    setSubmitting(false);

    if (!res.ok) {
      setShareError(res.error);
      return;
    }
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    setShareUrl(`${origin}/liste/${res.token}`);
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* fallback: silently ignored — kullanıcı manuel kopyalayabilir */
    }
  }

  function closeModal() {
    setModalOpen(false);
    setTitle("");
    setNote("");
    setExpirationKey(DEFAULT_EXPIRATION_KEY);
    setShareUrl(null);
    setShareError(null);
  }

  /* Tek kart render'ı — ana grid ve esnek bölüm AYNI seçim overlay'ini
     kullanır. Esnek villada fiyat prop'ları bastırılır (public /arama ile
     aynı); VillaCard "±3 gün içinde müsait" gösterir. */
  function renderCuratorCard(v: VillaListesiRow, isFlex: boolean) {
    const withPricing = hasDateRange && !isFlex;
    const isSelected = selected.has(v.id);
    /* Starting price fallback (arama page ile aynı pattern). */
    const fallback = (() => {
      const rawPrice = Number(v.price);
      if (Number.isFinite(rawPrice) && rawPrice > 0) {
        return { price: rawPrice, currency: v.currency || "TRY" };
      }
      const sp = getStartingPrice(v.prices);
      return sp ? sp : null;
    })();
    return (
      <div key={v.id} className="relative">
        {/* Selection checkbox overlay — z-30, Link tıklamasından önce yakalar. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSelect(v.id);
          }}
          aria-pressed={isSelected}
          aria-label={
            isSelected ? "Seçimi kaldır" : "Listeye ekle"
          }
          className={
            "absolute top-3 left-3 z-30 " +
            "w-9 h-9 rounded-full flex items-center justify-center " +
            "backdrop-blur-md ring-1 ring-inset " +
            "transition-colors duration-200 " +
            (isSelected
              ? "bg-emerald-500 ring-emerald-500 text-white"
              : "bg-white/70 ring-white/40 text-stone-700 hover:bg-white")
          }
        >
          {isSelected ? (
            <CheckSquare size={16} strokeWidth={2} />
          ) : (
            <Square size={16} strokeWidth={2} />
          )}
        </button>

        {/* Seçim halkası — VillaCard'ı sarmalar.
            rounded-[20px] curation variant outer radius ile uyumlu. */}
        <div
          className={
            "rounded-[20px] transition-shadow duration-200 " +
            (isSelected
              ? "ring-4 ring-emerald-200/70 ring-offset-2 ring-offset-[var(--admin-bg,#fafafa)]"
              : "")
          }
        >
          <VillaCard
            id={v.id}
            slug={v.slug}
            title={v.title}
            location={v.location}
            price={fallback?.price ?? undefined}
            currency={fallback?.currency || "TRY"}
            images={v.images}
            badge={v.badge ?? undefined}
            bedrooms={v.bedrooms || 1}
            bathrooms={v.bathrooms || 1}
            guests={v.guests || 2}
            stayStart={hasDateRange ? start : undefined}
            stayEnd={hasDateRange ? end : undefined}
            prices={withPricing ? v.prices : undefined}
            stayDiscounts={withPricing ? v.discounts : undefined}
            cleaningFee={withPricing ? v.cleaning_fee : undefined}
            cleaningCurrency={
              withPricing ? v.cleaning_currency : undefined
            }
            cleaningLimit={
              withPricing ? v.cleaning_limit : undefined
            }
            isFlexible={isFlex}
            variant="curation"
          />
        </div>
      </div>
    );
  }

  /* ---------------- RENDER ---------------- */
  return (
    <div className="space-y-6 pb-32">
      {/* ════════ SEARCH BAR ════════
          Rezervasyonlar ekranı paritesi (admin-pill-search).
          Mevcut dropdown filtreleriyle AND mantığı; URL'e dokunmaz. */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Mülk adı, bölge, slug veya ID ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2">
          {filtered.length} villa
        </span>
        {/* 🛡️ SIRALAMA — public /arama allow-list. Filtre grid'i (4 kolon)
           byte-identical kalsın diye search bar'a eklendi. */}
        <select
          value={sort}
          onChange={(e) => setSort(parsePublicSort(e.target.value))}
          className="input ml-auto w-auto"
          aria-label="Sıralama"
        >
          <option value="smart">Varsayılan</option>
          <option value="capacity-asc">Kapasite (artan)</option>
          <option value="capacity-desc">Kapasite (azalan)</option>
          <option value="price-asc">Fiyat (artan)</option>
          <option value="price-desc">Fiyat (azalan)</option>
        </select>
      </div>

      {/* ════════ FILTER BAR ════════ */}
      <section className="admin-card-flat p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {/* 📅 Tek calendar date-range — react-datepicker selectsRange.
              FilterSidebar / Hero ile aynı kütüphane + pattern. Kullanıcı
              önce girişe, sonra çıkışa tıklar; tek range oluşur. */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
              Konaklama Tarihi
            </label>
            <AdminDateRangePicker
              startDate={startDateObj}
              endDate={endDateObj}
              onChange={setDateRange}
              placeholderText="Giriş – Çıkış Tarihi"
              minDate={new Date()}
              ariaLabel="Konaklama tarihi aralığı"
            />
          </div>

          {/* 🏷️ Villa tipi — MULTI-SELECT (AND, public /arama ile aynı). */}
          <MultiSelectDropdown
            label="Kategori"
            allLabel="Tüm kategoriler"
            countLabel={(n) => `${n} kategori seçili`}
            options={categories}
            selectedIds={categoryIds}
            onToggle={toggleCategory}
            open={catOpen}
            setOpen={setCatOpen}
            containerRef={catRef}
          />

          {/* 📍 Bölge — MULTI-SELECT (public Hero gibi). Yalnız grup
              kökleri listelenir; kök seçimi gruptaki tüm alt bölgeleri
              kapsar (Migration 050). */}
          <MultiSelectDropdown
            label="Bölge"
            allLabel="Tüm bölgeler"
            countLabel={(n) => `${n} bölge seçili`}
            options={rootLocations}
            selectedIds={regionIds}
            onToggle={toggleRegion}
            open={regionOpen}
            setOpen={setRegionOpen}
            containerRef={regionRef}
          />

          {/* ✨ Villa özellikleri — MULTI-SELECT (AND, public "Gelişmiş
              Arama" ile aynı). */}
          <MultiSelectDropdown
            label="Özellikler"
            allLabel="Tüm özellikler"
            countLabel={(n) => `${n} özellik seçili`}
            options={features}
            selectedIds={featureIds}
            onToggle={toggleFeature}
            open={featureOpen}
            setOpen={setFeatureOpen}
            containerRef={featureRef}
            emptyLabel="Özellik bulunamadı"
          />

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
              Kişi
            </label>
            <input
              type="number"
              min={1}
              placeholder="örn. 4"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* 🔁 Esnek tarih — public "Gelişmiş Arama" ile aynı ±3 gün. */}
        <label className="mt-4 inline-flex items-start gap-2 text-[12.5px] text-[var(--admin-text)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={flexible}
            onChange={(e) => setFlexible(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Sonuçlarda {ADMIN_FLEX_DAYS} gün önceki ve sonraki villaları da göster
            <span className="block text-[11.5px] text-[var(--admin-muted-2)]">
              Yalnız tarih seçiliyken çalışır; bu villalar listenin altında
              ayrı gösterilir.
            </span>
          </span>
        </label>

        <p className="mt-3 text-[11.5px] text-[var(--admin-muted-2)]">
          Tarih seçilirse o tarihte dolu olan ve seçilen gecelerin
          tamamında fiyatı tanımlı olmayan villalar listelenmez; kartlarda
          indirim dahil toplam fiyat gösterilir. Tarih boşsa &ldquo;gece
          başlangıç fiyatı&rdquo; gösterilir.
        </p>
        <div className="mt-4 flex items-center justify-between text-[13px] text-[var(--admin-muted)]">
          <span>
            <strong className="text-[var(--admin-text)]">
              {filtered.length}
            </strong>{" "}
            villa listelendi
            <span className="text-[var(--admin-muted-2)] mx-1.5">/</span>
            <span className="text-[var(--admin-muted-2)]">
              toplam {villas.length}
            </span>
            {selected.size > 0 ? (
              <>
                {" "}
                · <strong className="text-emerald-700">{selected.size}</strong>{" "}
                seçili
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
              className="
                text-[12px] font-medium text-[var(--admin-muted)]
                hover:text-[var(--admin-text)]
                disabled:opacity-40 disabled:cursor-not-allowed
                px-2 py-1 rounded
              "
            >
              Tümünü seç
            </button>
            <span aria-hidden className="text-[var(--admin-muted-2)]">·</span>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selected.size === 0}
              className="
                text-[12px] font-medium text-[var(--admin-muted)]
                hover:text-[var(--admin-text)]
                disabled:opacity-40 disabled:cursor-not-allowed
                px-2 py-1 rounded
              "
            >
              Temizle
            </button>
          </div>
        </div>
      </section>

      {/* ════════ GRID ════════ */}
      {villas.length === 0 ? (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)] space-y-2">
          <p className="font-medium text-[var(--admin-text)]">
            Aktif mülk bulunamadı.
          </p>
          <p className="text-[12.5px]">
            Veri çekilemediyse server log&apos;a (
            <code>[villa-listesi.fetch]</code>) bakın; aksi halde
            mülk yönetiminden bir mülk ekleyin ve aktifleştirin.
          </p>
        </div>
      ) : availabilityPending ? (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)]">
          <p className="text-[13px]">Müsaitlik kontrol ediliyor…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)] space-y-2">
          <p className="font-medium text-[var(--admin-text)]">
            Filtreye uyan mülk yok.
          </p>
          <p className="text-[12.5px]">
            Toplam {villas.length} aktif villa var. Filtreleri gevşetin.
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-5 md:gap-x-6 gap-y-10">
          {/* 🚀 `pageItems` = sortedFiltered'ın yalnız görünen dilimi.
             Kart içeriği, prop'ları ve seçim overlay'i AYNEN. */}
          {pageItems.map((v) => renderCuratorCard(v, false))}
        </div>
        {totalPages > 1 && (
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            onGoto={gotoPage}
          />
        )}
        </>
      )}

      {/* ════════ ESNEK SONUÇLAR (±3 gün) ════════
          Public /arama ile aynı: ana listeden AYRI, altta; sayaç, sıralama,
          sayfalama ve "Tümünü seç" dışında. Kartlar seçilebilir; paylaşımda
          ana tarih aynen kullanılır (bu villalar o tarihte DOLU). */}
      {flexibleVillas.length > 0 && (
        <section className="space-y-4">
          <div className="admin-card-flat px-5 py-4">
            <p className="text-[13.5px] font-medium text-[var(--admin-text)]">
              ±{ADMIN_FLEX_DAYS} gün içinde müsait ({flexibleVillas.length})
            </p>
            <p className="text-[12px] text-[var(--admin-muted-2)] mt-0.5">
              Seçilen tarihte dolu, ancak {ADMIN_FLEX_DAYS} gün önce veya
              sonra aynı süre için müsait olan villalar. Listeye eklerseniz
              müşteri bunları seçilen tarihle görür.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-5 md:gap-x-6 gap-y-10">
            {flexibleVillas.map((v) => renderCuratorCard(v, true))}
          </div>
        </section>
      )}

      {/* ════════ STICKY ACTION BAR ════════ */}
      {selected.size > 0 && (
        <div
          className="
            fixed bottom-5 left-1/2 -translate-x-1/2 z-40
            flex items-center gap-4
            rounded-full bg-white border border-[var(--admin-border)]
            shadow-[0_12px_30px_-12px_rgb(15_23_42/0.18)]
            px-5 py-3
          "
        >
          <span className="text-[13.5px] text-[var(--admin-text)] font-medium">
            <strong className="text-emerald-700">{selected.size}</strong>{" "}
            villa seçildi
          </span>
          <button
            type="button"
            onClick={openShareModal}
            className="
              inline-flex items-center gap-2
              rounded-full bg-emerald-600 hover:bg-emerald-700
              text-white text-[13.5px] font-semibold
              px-4 py-2 transition-colors
            "
          >
            <Share2 size={14} />
            Listeyi Paylaş
          </button>
        </div>
      )}

      {/* ════════ SHARE MODAL ════════ */}
      {modalOpen && (
        <div
          className="
            fixed inset-0 z-50 bg-black/40 backdrop-blur-sm
            flex items-center justify-center p-4
          "
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="
              w-full max-w-md
              rounded-2xl bg-white border border-[var(--admin-border)]
              shadow-xl p-6 space-y-4
            "
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[20px] text-[var(--admin-text)] tracking-[-0.01em]">
                  Listeyi paylaş
                </h3>
                <p className="text-[12.5px] text-[var(--admin-muted-2)] mt-1">
                  {selected.size} villa içeren özel bir bağlantı üretilecek.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-[var(--admin-muted-2)] hover:text-[var(--admin-text)] p-1"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            {!shareUrl ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
                    Başlık (opsiyonel)
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Antalya 4 kişi sıcak villa seçkisi"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="input"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
                    Not (opsiyonel)
                  </label>
                  <textarea
                    placeholder="Müşteriye kısa bir mesaj…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="input !rounded-xl !p-3 h-24 resize-none text-[13.5px]"
                    maxLength={500}
                  />
                </div>

                {/* 🕒 LINK SÜRESİ — pill segmented control.
                    Frontend opaque key (1h/3h/6h/24h) gönderir;
                    backend ALLOWED_EXPIRATIONS map ile saate çevirir
                    (arbitrary TTL koruması). */}
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
                    Link Süresi
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Link süresi"
                    className="
                      grid grid-cols-4 gap-1
                      rounded-xl border border-[var(--admin-border)]
                      bg-[var(--admin-bg-soft)] p-1
                    "
                  >
                    {EXPIRATION_OPTIONS.map((opt) => {
                      const isActive = expirationKey === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => setExpirationKey(opt.key)}
                          className={
                            "rounded-lg px-3 py-2 text-[12.5px] font-medium " +
                            "transition-colors duration-150 " +
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 " +
                            (isActive
                              ? "bg-white text-[var(--admin-text)] shadow-sm border border-[var(--admin-border)]"
                              : "text-[var(--admin-muted)] hover:text-[var(--admin-text)]")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--admin-muted-2)]">
                    Paylaşılan link seçilen süre sonunda otomatik silinir.
                  </p>
                </div>

                {shareError && (
                  <p className="text-[12.5px] text-red-600">{shareError}</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="
                      text-[13.5px] font-medium text-[var(--admin-muted)]
                      hover:text-[var(--admin-text)]
                      px-4 py-2 rounded-lg
                    "
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitShare}
                    disabled={submitting}
                    className="
                      inline-flex items-center gap-2
                      rounded-lg bg-emerald-600 hover:bg-emerald-700
                      text-white text-[13.5px] font-semibold
                      px-4 py-2 transition-colors
                      disabled:opacity-60 disabled:cursor-not-allowed
                    "
                  >
                    {submitting ? "Oluşturuluyor…" : "Bağlantı oluştur"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-[12px] uppercase tracking-wide text-emerald-700 font-medium flex items-center gap-1.5">
                    <Check size={12} /> Bağlantı hazır
                  </p>
                  <p className="text-[12.5px] text-emerald-900 mt-1">
                    Müşterinize aşağıdaki bağlantıyı gönderin.
                  </p>
                </div>

                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="input font-mono !text-[12px]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="
                      inline-flex items-center gap-1.5 shrink-0
                      rounded-lg border border-[var(--admin-border)]
                      bg-white hover:bg-[var(--admin-bg-soft)]
                      text-[13px] font-medium text-[var(--admin-text)]
                      px-3
                    "
                  >
                    <Copy size={13} />
                    Kopyala
                  </button>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      text-[13.5px] font-medium text-[var(--admin-muted)]
                      hover:text-[var(--admin-text)]
                      px-4 py-2 rounded-lg
                    "
                  >
                    Önizle
                  </a>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="
                      rounded-lg bg-[var(--admin-text)] hover:bg-black
                      text-white text-[13.5px] font-semibold
                      px-4 py-2 transition-colors
                    "
                  >
                    Tamam
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===============================================================
   PaginationBar — önceki/sonraki + numaralı sayfa pillarları
   ===============================================================
   Görünüm ve sınıflar `VillaOperationsList.tsx:319` (/maki-admin/villas)
   ile BİREBİR — admin tasarım dili (`--admin-*` token'ları + aktif
   sayfa `--brand-coral` pill). Sayfa penceresi algoritması
   `lib/pagination.ts` → `computePageWindow` (mevcut ortak helper;
   yeni algoritma YAZILMADI).
=============================================================== */
function PaginationBar({
  page,
  totalPages,
  onGoto,
}: {
  page: number;
  totalPages: number;
  onGoto: (next: number) => void;
}) {
  const pages = computePageWindow(page, totalPages);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      role="navigation"
      aria-label="Sayfa gezinme"
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
    >
      <button
        type="button"
        onClick={() => onGoto(page - 1)}
        disabled={prevDisabled}
        className="
          inline-flex items-center gap-1
          px-3 py-1.5 rounded-lg
          text-[12.5px] font-medium
          text-[var(--admin-muted)]
          hover:text-[var(--admin-text)]
          hover:bg-[var(--admin-bg-soft)]
          transition-colors motion-reduce:transition-none
          disabled:opacity-40 disabled:cursor-not-allowed
          disabled:hover:bg-transparent
        "
      >
        <ChevronLeft size={14} />
        Önceki
      </button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 py-1.5 text-[12.5px] text-[var(--admin-muted-2)]"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onGoto(p)}
            aria-current={p === page ? "page" : undefined}
            className={
              "inline-flex items-center justify-center min-w-[32px] " +
              "px-2.5 py-1.5 rounded-lg " +
              "text-[12.5px] font-medium tabular-nums " +
              "transition-colors motion-reduce:transition-none " +
              (p === page
                ? "bg-[var(--brand-coral)] text-white"
                : "text-[var(--admin-muted)] hover:text-[var(--admin-text)] hover:bg-[var(--admin-bg-soft)]")
            }
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onGoto(page + 1)}
        disabled={nextDisabled}
        className="
          inline-flex items-center gap-1
          px-3 py-1.5 rounded-lg
          text-[12.5px] font-medium
          text-[var(--admin-muted)]
          hover:text-[var(--admin-text)]
          hover:bg-[var(--admin-bg-soft)]
          transition-colors motion-reduce:transition-none
          disabled:opacity-40 disabled:cursor-not-allowed
          disabled:hover:bg-transparent
        "
      >
        Sonraki
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}

/* ===============================================================
   MultiSelectDropdown — kompakt checkbox dropdown
   ===============================================================
   Önceki "Kategori" dropdown'unun BİREBİR görünüm/davranışı (aynı
   sınıflar, aynı outside-click kapanışı); Bölge ve Özellikler de aynı
   bileşeni kullanır. Boş seçim = tümü.
=============================================================== */
function MultiSelectDropdown({
  label,
  allLabel,
  countLabel,
  options,
  selectedIds,
  onToggle,
  open,
  setOpen,
  containerRef,
  emptyLabel,
}: {
  label: string;
  allLabel: string;
  countLabel: (n: number) => string;
  options: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  open: boolean;
  setOpen: (updater: (o: boolean) => boolean) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
        {label}
      </label>
      <div className={"relative " + (open ? "z-50" : "z-40")} ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="input w-full flex items-center justify-between gap-2 text-left"
        >
          <span
            className={
              selectedIds.length === 0 ? "text-[var(--admin-muted-2)]" : ""
            }
          >
            {selectedIds.length === 0
              ? allLabel
              : countLabel(selectedIds.length)}
          </span>
          <ChevronDown
            size={14}
            className="text-[var(--admin-muted-2)] shrink-0"
          />
        </button>
        {open && (
          <ul
            role="listbox"
            aria-label={label}
            className="absolute z-40 mt-1 left-0 right-0 max-h-64 overflow-auto rounded-lg border border-[var(--color-stone-200)] bg-white shadow-[0_12px_28px_-12px_rgb(27_26_23/0.22)] py-1"
          >
            {options.length === 0 && emptyLabel ? (
              <li className="px-3 py-1.5 text-[13px] text-[var(--admin-muted-2)]">
                {emptyLabel}
              </li>
            ) : (
              options.map((o) => {
                const checked = selectedIds.includes(o.id);
                return (
                  <li key={o.id}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(o.id)}
                      />
                      <span className="truncate">{o.name}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
