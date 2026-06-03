"use client";

/* ===============================================================
   🛡️ /arama — PREMIUM FILTER SIDEBAR (CLIENT ISLAND)
   ===============================================================
   Bu component PURE UI. Hiçbir Supabase/business semantic ÜRETMEZ.
   Tek source-of-truth: URL query params. (Server component page.tsx
   bu paramları okur ve aynı supabase query'sini kullanır.)

   URL CONTRACT (DEĞİŞMEZ — Hero.tsx ile birebir aynı):
     - categories   : string[]   (virgülle ayrılmış villa_types.id)
     - regions      : string[]   (virgülle ayrılmış villa_locations.id)
     - start, end   : YYYY-MM-DD (lokal — Hero.formatDate ile aynı)
     - guests       : number     (toplam kişi sayısı)

   YENİ SEMANTIC YOK:
     - "Çocuk Sayısı" UI'da iki ayrı counter (Yetişkin + Çocuk)
       olarak gösterilir, ama URL'e SADECE toplam `guests` yazılır.
       (URL'den geri okurken: yetişkin = guests, çocuk = 0 default
        — kabul edilebilir UX kompromisi.)

   LAYOUT:
     - Desktop  : inline sticky aside
     - Mobile   : bottom-anchored slide-over (body scroll lock + ESC
                  + outside click + reduced-motion safe)

   PERFORMANS:
     - Tek client island. Server component'a hydration yükü minimal.
     - Filtreler local draft state; ENTER veya "Filtrele" CTA URL'e
       push eder → SSR re-render. Instant rerender flicker'i yok.
     - useTransition ile router.push pending state izlenir
       (apply CTA disabled feedback).
   =============================================================== */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { tr } from "date-fns/locale";

import MobileKbSafeInput from "@/app/components/ui/datepicker/MobileKbSafeInput";

import {
  Calendar,
  ChevronDown,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
  X,
} from "lucide-react";

registerLocale("tr", tr);

/* ---------------- Types ---------------- */

/* 🛡️ Option: id (UUID — canonical sidebar state) + opsiyonel slug
   (URL serialization için preferred token). slug null ise URL'e
   UUID düşer; backward-compat korunur. */
type Option = {
  id: string;
  name: string;
  slug?: string | null;
  /** Migration 050 — sidebar gösterim kürasyonu (yalnız regionOptions). */
  show_in_filter?: boolean | null;
  filter_group_name?: string | null;
};

type InitialFilters = {
  regions: string[];
  categories: string[];
  start: string | null;
  end: string | null;
  guests: number;
};

/* ===============================================================
   🛡️ MODE CONTRACT — Single component, two consumer contexts
   ===============================================================
     mode="search"   → /arama'da (default). "Filtrele" CTA URL'i
                       günceller ve aynı sayfa SSR re-render olur.
                       "Temizle" → /arama'ya boş paramla push (reload).
                       Mobile CTA → "X sonucu göster".

     mode="redirect" → /kiralik-villalar (archive/discovery) gibi
                       NON-SEARCH sayfalarda kullanılır. UI birebir
                       aynı; tek fark "Filtrele" /arama?... URL'ine
                       PUSH ediyor (kullanıcı sayfayı terk eder).
                       "Temizle" → sadece local draft state'i sıfırlar
                       (kullanıcı bulunduğu sayfada kalır). Mobile CTA
                       → "Villa Bul" (sonuç sayısı bilinmiyor).

   Bu prop sayesinde filter UI hem search-result hem archive context'inde
   reuse edilebilir; component duplication yok, filter state logic tek
   source-of-truth, URL contract birebir aynı.
=============================================================== */
export type FilterSidebarMode = "search" | "redirect";

type Props = {
  regionOptions: Option[];
  categoryOptions: Option[];
  initial: InitialFilters;
  /** Sonuç sayısı — mobile CTA üzerinde "X villa göster" için.
   *  Sadece mode="search" durumunda anlamlı. */
  resultCount?: number;
  /** Default "search". Detay için "MODE CONTRACT" bloğuna bak. */
  mode?: FilterSidebarMode;
};

/* ---------------- Helpers ---------------- */

const formatDateForUrl = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/* Grup içi kısa etiket:
     - name === group               → "Tüm {group}"  (üst bölge)
     - name "X / Y" formatında ise  → "/" sonrası ("Y")
     - aksi halde                   → name */
const regionShortLabel = (name: string, group: string): string => {
  if (name === group) return `Tüm ${group}`;
  if (name.includes("/")) {
    const tail = name.split("/").pop()?.trim();
    if (tail) return tail;
  }
  return name;
};

const parseDateFromUrl = (s: string | null): Date | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
};

/* ===============================================================
   COMPONENT
   =============================================================== */
export default function FilterSidebar({
  regionOptions,
  categoryOptions,
  initial,
  resultCount = 0,
  mode = "search",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isRedirect = mode === "redirect";

  /* ---------------- DRAFT STATE ----------------
     URL = canonical truth; draft = unapplied UI değişiklikleri. */
  const [regions, setRegions] = useState<string[]>(initial.regions);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [startDate, setStartDate] = useState<Date | null>(
    parseDateFromUrl(initial.start)
  );
  const [endDate, setEndDate] = useState<Date | null>(
    parseDateFromUrl(initial.end)
  );
  /* 🛡️ TEK GUESTS STATE — Airbnb Luxe tarzı minimal booking UX.
     URL contract ?guests=N AYNEN korunur. Daha önce adults + children
     ayrımı vardı; UI sadeleştirildi → tek integer state. Business
     logic (.gte("guests", n)) byte-identical. */
  const [guestCount, setGuestCount] = useState<number>(
    Math.max(1, initial.guests || 1)
  );

  /* Sayfa /arama?regions=... gibi yeni bir URL'le yeniden render
     edildiğinde props.initial değişir → draft'ı senkronize et. */
  useEffect(() => {
    setRegions(initial.regions);
    setCategories(initial.categories);
    setStartDate(parseDateFromUrl(initial.start));
    setEndDate(parseDateFromUrl(initial.end));
    setGuestCount(Math.max(1, initial.guests || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial.regions.join(","),
    initial.categories.join(","),
    initial.start,
    initial.end,
    initial.guests,
  ]);

  /* ---------------- BÖLGE GRUP AÇ/KAPA STATE ----------------
     Migration 050: bölgeler filter_group_name altında gruplanır.
     openGroups[group] explicit toggle; tanımsızsa grup içinde seçili
     bölge varsa varsayılan AÇIK. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  /* Görünür bölgeleri (show_in_filter=true) gruba göre kümele.
     regionOptions tam liste kalır (URL resolve için); burada YALNIZ
     gösterim curation uygulanır. */
  const regionGroups = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const o of regionOptions) {
      if (!o.show_in_filter) continue;
      const group = (o.filter_group_name || "").trim() || o.name;
      const arr = map.get(group);
      if (arr) arr.push(o);
      else map.set(group, [o]);
    }
    /* Grup içinde: "Tüm X" (name === group) önce, sonra alfabetik. */
    const collator = new Intl.Collator("tr");
    const groups = Array.from(map.entries()).map(([group, items]) => ({
      group,
      items: items.sort((a, b) => {
        if (a.name === group) return -1;
        if (b.name === group) return 1;
        return collator.compare(a.name, b.name);
      }),
    }));
    groups.sort((a, b) => collator.compare(a.group, b.group));
    return groups;
  }, [regionOptions]);

  /* ---------------- MOBILE DRAWER STATE ---------------- */
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Body scroll lock + ESC close. */
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  /* Drawer açıldığında ilk focusable elemana focus ver. */
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const t = window.setTimeout(() => {
      const el = drawerRef.current?.querySelector<HTMLElement>(
        "[data-drawer-initial-focus]"
      );
      el?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [mobileOpen]);

  /* ---------------- HANDLERS ---------------- */

  /* 🛡️ ID → preferred URL token (slug varsa, yoksa UUID).
     State içinde categories[] = UUID array (toggle/includes/count
     mantığı UUID üzerinde stable); URL serialize'da slug'a çeviriyoruz.
     Server tarafı her iki formatı da accept eder (backward-compat). */
  const idToToken = (id: string, opts: Option[]) => {
    const o = opts.find((x) => x.id === id);
    return (o?.slug && o.slug.trim()) || id;
  };

  const buildHref = () => {
    const params = new URLSearchParams();
    if (categories.length) {
      const tokens = categories.map((id) => idToToken(id, categoryOptions));
      /* 🛡️ CANONICAL PARAM: `villa-turleri` (SEO-friendly TR).
         Server tarafı eski `categories` paramını da hâlâ accept eder. */
      params.set("villa-turleri", tokens.join(","));
    }
    if (regions.length) {
      const tokens = regions.map((id) => idToToken(id, regionOptions));
      /* 🛡️ CANONICAL PARAM: `bolgeler` (SEO-friendly TR).
         Server tarafı eski `regions` paramını da hâlâ accept eder. */
      params.set("bolgeler", tokens.join(","));
    }
    if (startDate) params.set("start", formatDateForUrl(startDate));
    if (endDate) params.set("end", formatDateForUrl(endDate));
    /* URL contract aynen: guests > 1 ise param yazılır
       (1 default → URL'e koymadan minimize ediyoruz). */
    if (guestCount > 1) params.set("guests", String(guestCount));
    const qs = params.toString();
    return qs ? `/arama?${qs}` : "/arama";
  };

  const applyFilters = () => {
    const href = buildHref();
    startTransition(() => {
      router.push(href);
    });
    setMobileOpen(false);
  };

  const resetFilters = () => {
    setRegions([]);
    setCategories([]);
    setStartDate(null);
    setEndDate(null);
    setGuestCount(1);
    /* 🛡️ MODE-aware reset:
         - search   → /arama'ya boş paramla push (mevcut davranış).
         - redirect → sadece local draft state'i sıfırla; kullanıcı
                      bulunduğu sayfada (örn. /kiralik-villalar) kalır. */
    if (isRedirect) {
      return;
    }
    startTransition(() => {
      router.push("/arama");
    });
  };

  const toggleInList = (
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    if (list.includes(value)) setList(list.filter((x) => x !== value));
    else setList([...list, value]);
  };

  /* 🛡️ GRUP-FARKINDA BÖLGE TOGGLE (yalnız UI seçim state'i)
     ===============================================================
     "Tüm X" (grup kökü, name === group) ile alt bölgeler MUTUALLY
     EXCLUSIVE:
       - Grup kökü işaretlenirse → aynı gruptaki alt seçimler temizlenir.
       - Bir alt bölge işaretlenirse → grup kökü kaldırılır.
       - Birden çok alt bölge serbestçe birlikte seçilebilir.
       - Kaldırma (uncheck) her zaman yalnız ilgili id'yi çıkarır.
     URL/resolver DEĞİŞMEZ; yalnızca `regions` id seti düzenlenir. */
  const toggleRegion = (opt: Option, group: string) => {
    const isRoot = opt.name === group;
    const groupItems =
      regionGroups.find((g) => g.group === group)?.items ?? [];
    const rootId = groupItems.find((it) => it.name === group)?.id;

    setRegions((prev) => {
      if (prev.includes(opt.id)) {
        /* Uncheck → yalnız bu id'yi çıkar. */
        return prev.filter((x) => x !== opt.id);
      }
      if (isRoot) {
        /* Grup kökü seçildi → gruptaki tüm alt id'leri çıkar, kökü ekle. */
        const subIds = new Set(
          groupItems.filter((it) => it.name !== group).map((it) => it.id)
        );
        return [...prev.filter((x) => !subIds.has(x)), opt.id];
      }
      /* Alt bölge seçildi → varsa grup kökünü çıkar, alt bölgeyi ekle. */
      const base = rootId ? prev.filter((x) => x !== rootId) : prev;
      return [...base, opt.id];
    });
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (regions.length) n += 1;
    if (categories.length) n += 1;
    if (startDate) n += 1;
    if (guestCount > 1) n += 1;
    return n;
  }, [regions.length, categories.length, startDate, guestCount]);

  /* ===============================================================
     RENDER
     =============================================================== */

  /* Tek panel JSX'i — hem desktop (inline aside) hem mobile (drawer
     içinde) aynı içeriği render eder. */
  const panel = (
    /* 🛡️ min-h-0: nested flex zincirinde panel'in 0'a kadar küçülmesine
       izin ver. Defaultta `min-height: auto` → çocuk içeriğin intrinsic
       boyu; bu durumda scroll area'nın `flex-1` semantic'i ve aşağıdaki
       `overflow-y-auto` çalışmaz. min-h-0 ile panel parent'ı (card)
       max-h içinde header + scroll + footer distribution'ı doğru
       hesaplar. */
    <div className="flex flex-col h-full min-h-0">
      {/* HEADER — desktop'ta minimal eyebrow, mobile'da X button */}
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-[var(--color-stone-100)]">
        <div>
          <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-500)]">
            <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
            Filtrele
          </p>
          <h2 className="font-display text-[26px] md:text-[28px] text-[var(--color-stone-900)] mt-2 tracking-[-0.025em] leading-tight">
            Aramayı daralt.
          </h2>
        </div>

        {/* Mobile only — close */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Filtreleri kapat"
          className="md:hidden -mr-1 w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <X size={18} />
        </button>
      </div>

      {/* SCROLL AREA — drawer içinde sticky CTA için flex-1 */}
      {/*
        🛡️ FUNNEL ORDER — production-grade booking UX:
          1) Villa Tipi  (kullanıcı önce "nasıl bir villa" diye düşünür)
          2) Bölge       (sonra "nerede")
          3) Tarih       (sonra "ne zaman")
          4) Misafir     (en son "kaç kişi")
        Cross-group semantic AND; her grup içinde OR (multi-select).
      */}
      {/* 🛡️ flex-1 + min-h-0 + overflow-y-auto: canonical "internal
         scroll in flex parent" pattern. min-h-0 olmadan flex item'ın
         min-height defaultu intrinsic content'tir → scroll area
         içeriği kadar büyür → overflow-y-auto hiç tetiklenmez →
         checkbox listesi card'ın rounded border'ından taşar. */}
      <div className="flex-1 min-h-0 overflow-y-auto py-6 space-y-8 pr-1 -mr-1">
        {/* ============ 1) VİLLA TİPİ ============ */}
        <FilterGroup
          icon={<Tag size={14} className="text-[var(--color-champagne-500)]" />}
          label="Villa Tipi"
          summary={
            categories.length === 0
              ? "Tümü"
              : `${categories.length} seçili`
          }
        >
          {categoryOptions.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-400)]">
              Tip yok.
            </p>
          ) : (
            <ul className="space-y-1">
              {categoryOptions.map((opt, i) => {
                const checked = categories.includes(opt.id);
                return (
                  <li key={opt.id}>
                    <label
                      className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-xl cursor-pointer transition-colors motion-reduce:transition-none ${
                        checked
                          ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                          : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                      }`}
                    >
                      <input
                        {...(i === 0 ? { "data-drawer-initial-focus": "" } : {})}
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleInList(opt.id, categories, setCategories)
                        }
                        className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                      />
                      <span className="truncate">{opt.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </FilterGroup>

        {/* ============ 2) BÖLGE ============ */}
        <FilterGroup
          icon={<MapPin size={14} className="text-[var(--color-champagne-500)]" />}
          label="Bölge"
          summary={
            regions.length === 0
              ? "Tüm bölgeler"
              : `${regions.length} seçili`
          }
        >
          {regionGroups.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-400)]">
              Bölge yok.
            </p>
          ) : (
            <div className="space-y-1.5">
              {regionGroups.map((g) => {
                const selectedCount = g.items.filter((it) =>
                  regions.includes(it.id)
                ).length;
                /* Explicit toggle yoksa: seçili bölge varsa açık. */
                const isOpen =
                  openGroups[g.group] ?? selectedCount > 0;
                return (
                  <div
                    key={g.group}
                    className="rounded-xl border border-[var(--color-stone-100)] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((s) => ({
                          ...s,
                          [g.group]: !isOpen,
                        }))
                      }
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-[14px] text-[var(--color-stone-800)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
                    >
                      <span className="flex items-center gap-2 font-medium truncate">
                        <ChevronDown
                          size={14}
                          className={`text-[var(--color-stone-400)] shrink-0 transition-transform motion-reduce:transition-none ${
                            isOpen ? "" : "-rotate-90"
                          }`}
                        />
                        <span className="truncate">{g.group}</span>
                      </span>
                      {selectedCount > 0 && (
                        <span className="text-[11px] tabular-nums text-[var(--color-stone-400)] shrink-0">
                          {selectedCount} seçili
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <ul className="space-y-1 px-1.5 pb-1.5">
                        {g.items.map((opt) => {
                          const checked = regions.includes(opt.id);
                          return (
                            <li key={opt.id}>
                              <label
                                className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-lg cursor-pointer transition-colors motion-reduce:transition-none ${
                                  checked
                                    ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                                    : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRegion(opt, g.group)}
                                  className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                                />
                                <span className="truncate">
                                  {regionShortLabel(opt.name, g.group)}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </FilterGroup>

        {/* ============ 3) TARİH ============ */}
        <FilterGroup
          icon={
            <Calendar
              size={14}
              className="text-[var(--color-champagne-500)]"
            />
          }
          label="Tarih"
          summary={
            startDate && endDate
              ? `${startDate.toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                })} – ${endDate.toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                })}`
              : startDate
              ? startDate.toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                })
              : "Tarih seç"
          }
        >
          <div className="rounded-xl border border-[var(--color-stone-100)] bg-white px-3 py-3 flex items-center gap-3">
            <DatePicker
              selected={startDate}
              onChange={(dates: any) => {
                const [start, end] = dates as [Date | null, Date | null];
                setStartDate(start);
                setEndDate(end);
              }}
              startDate={startDate}
              endDate={endDate}
              selectsRange
              locale="tr"
              dateFormat="dd.MM.yyyy"
              minDate={new Date()}
              placeholderText="Giriş – Çıkış"
              /* 🛡️ Kart içinde input'ta görünen tarih metni — SADECE
                 display override. State (selected/startDate/endDate),
                 onChange, URL (formatDateForUrl), filter querysi ve
                 calendar internal'ı (dateFormat/selectsRange/locale/
                 minDate) DOKUNULMADI. Summary (L565-580) ile birebir
                 aynı format: tr-TR + day numeric + month short →
                 "4 Haz – 11 Haz". Separator en-dash, placeholder ile
                 tutarlı. */
              value={
                startDate && endDate
                  ? `${startDate.toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                    })} – ${endDate.toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                    })}`
                  : startDate
                  ? startDate.toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                    })
                  : ""
              }
              className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none w-full text-[14px] font-medium !text-[var(--color-stone-900)] placeholder-[var(--color-stone-400)] cursor-pointer outline-none"
              /* 🛡️ Mobil klavye baskılama — customInput içinde
                 inputMode="none". Display override için verilen
                 value prop, react-datepicker tarafından customInput'a
                 forward edilir; render değişmez. */
              customInput={<MobileKbSafeInput />}
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
                aria-label="Tarihi temizle"
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[var(--color-stone-500)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </FilterGroup>

        {/* ============ 4) KİŞİ SAYISI ============
            Tek sade counter — Airbnb Luxe tarzı minimal booking UX.
            URL contract: ?guests=N (1 default → param yazılmaz). */}
        <FilterGroup
          icon={
            <Users size={14} className="text-[var(--color-champagne-500)]" />
          }
          label="Kişi Sayısı"
          summary={
            guestCount > 1 ? `${guestCount} kişi` : "1 kişi"
          }
        >
          <div className="space-y-3">
            <CounterRow
              label="Kişi"
              hint="Toplam kapasite"
              value={guestCount}
              min={1}
              max={20}
              onChange={setGuestCount}
            />
            <p className="text-[11px] tracking-[0.04em] text-[var(--color-stone-400)] pt-1 leading-relaxed">
              <span className="tabular-nums">{guestCount}</span>+ kişi
              kapasitesi olan villalar gösterilir.
            </p>
          </div>
        </FilterGroup>
      </div>

      {/* STICKY FOOTER — Filtrele + Temizle */}
      <div className="pt-5 border-t border-[var(--color-stone-100)] flex items-center gap-3">
        <button
          type="button"
          onClick={resetFilters}
          disabled={activeFilterCount === 0 || isPending}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-full border border-[var(--color-stone-200)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <RotateCcw size={13} />
          Temizle
        </button>
        <button
          type="button"
          onClick={applyFilters}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[13px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Search size={14} />
          <span>
            {isPending
              ? "Aranıyor…"
              : isRedirect
              ? "Villa Bul"
              : mobileOpen
              ? `${resultCount} sonucu göster`
              : "Filtrele"}
          </span>
        </button>
      </div>
    </div>
  );

  /* =============== RENDER ROOT =============== */

  return (
    <>
      {/* MOBILE TRIGGER — list üstünde sticky değil (header altında) */}
      <div className="md:hidden mb-8">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-full inline-flex items-center justify-between gap-4 px-5 py-4 rounded-2xl bg-white border border-[var(--color-stone-100)] text-left hover:border-[var(--color-stone-200)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
        >
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] flex items-center justify-center">
              <SlidersHorizontal
                size={15}
                className="text-[var(--color-stone-700)]"
              />
            </span>
            <span>
              <span className="block text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                Filtrele
              </span>
              <span className="block text-[14px] font-medium text-[var(--color-stone-900)] mt-0.5">
                Bölge, tarih, kişi…
              </span>
            </span>
          </span>
          {activeFilterCount > 0 ? (
            <span className="text-[11px] tracking-[0.12em] uppercase font-semibold tabular-nums px-2.5 py-1 rounded-full bg-[var(--color-stone-900)] text-white">
              {activeFilterCount}
            </span>
          ) : (
            <ChevronDown
              size={16}
              className="text-[var(--color-stone-400)]"
            />
          )}
        </button>
      </div>

      {/* DESKTOP — inline sticky aside */}
      <aside className="hidden md:block">
        <div className="sticky top-28">
          {/* 🛡️ overflow-hidden: card max-h ile boy capping yapıyor.
             İç panel/scroll-area min-h-0 ile doğru shrink etse de,
             defansif clip border'ın rounded köşelerinin altında bir
             1px overflow'un bile görünmesini engeller. Sticky scope
             ve max-h davranışı dokunulmadı. */}
          <div className="bg-white border border-[var(--color-stone-100)] rounded-2xl p-6 max-h-[calc(100vh-9rem)] flex flex-col overflow-hidden">
            {panel}
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER — full-bleed slide-over */}
      <div
        className={`md:hidden fixed inset-0 z-[100] ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Filtreler"
      >
        {/* Backdrop */}
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-[var(--color-stone-900)]/40 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Panel — slide from bottom */}
        <div
          ref={drawerRef}
          className={`absolute inset-x-0 bottom-0 h-[92vh] bg-white rounded-t-3xl shadow-[0_-24px_64px_-16px_rgb(27_26_23/0.22)] transition-transform duration-300 motion-reduce:transition-none ${
            mobileOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          {/* Drag indicator */}
          <div className="flex items-center justify-center pt-3 pb-1">
            <span
              aria-hidden="true"
              className="w-10 h-1 rounded-full bg-[var(--color-stone-200)]"
            />
          </div>
          <div className="px-5 pt-2 pb-5 h-[calc(92vh-1.25rem)]">{panel}</div>
        </div>
      </div>
    </>
  );
}

/* ===============================================================
   SUB-COMPONENTS
   =============================================================== */

function FilterGroup({
  icon,
  label,
  summary,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase font-semibold text-[var(--color-stone-700)]">
          {icon}
          {label}
        </h3>
        <span className="text-[11px] tracking-[0.06em] text-[var(--color-stone-400)] truncate max-w-[55%] text-right">
          {summary}
        </span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function CounterRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium text-[var(--color-stone-900)]">
          {label}
        </p>
        <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.02em]">
          {hint}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => canDec && onChange(value - 1)}
          disabled={!canDec}
          aria-label={`${label} azalt`}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-700)] flex items-center justify-center hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Minus size={13} />
        </button>
        <span className="tabular-nums text-[14px] font-medium text-[var(--color-stone-900)] w-5 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => canInc && onChange(value + 1)}
          disabled={!canInc}
          aria-label={`${label} arttır`}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-700)] flex items-center justify-center hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
