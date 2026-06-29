"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
/* 🛡️ EXIT HARDENING — inline `supabase.from()` yerine mevcut
   menuRepository. `db` barrel client-safe (isomorphic); aynı anon
   RLS context + birebir aynı SELECT shape (id, name, slug). */
import { menuRepository } from "@/lib/db/menu.repository";
/* 🔎 Floating villa-adı arama — mevcut paylaşılan canlı arama component'i
   (debounce + searchByTitle + autocomplete dropdown). Kendi navigation
   logic'i var; burada yalnız tüketilir. */
import VillaSearchBox from "@/app/components/layout/VillaSearchBox";

import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { tr } from "date-fns/locale";

import MobileKbSafeInput from "@/app/components/ui/datepicker/MobileKbSafeInput";

import {
  Search,
  Tag,
  MapPin,
  Calendar,
  Users,
  ChevronDown,
} from "lucide-react";

import { buildHeroSearchParams } from "../_helpers/build-search-params";
import { buildHeroDateLabel } from "../_helpers/date-label";

import type { FilterOption } from "../_types/hero";

registerLocale("tr", tr);

/* ===============================================================
   🛡️ FAZ 4 — HeroSearchPanel (CLIENT — STATEFUL)
   ===============================================================
   Eski Hero.tsx > SEARCH PANEL bloğu (L599-890) BYTE-IDENTICAL
   kopyası + Hero.tsx içinde tutulan state/ref/effect/helper'lar
   self-contained Search Panel'e taşındı.

   ENCAPSULATED STATE:
     - categories, regions, guests, startDate, endDate
     - openCat, openRegion
     - categoryOptions, regionOptions
     - catRef, regRef (outside click DOM refs)

   ENCAPSULATED EFFECTS:
     - villa_types + villa_locations fetch (mount)
     - document.mousedown outside click handler

   ENCAPSULATED HELPERS:
     - toggleItem (pure, inline)
     - handleSearch (delegates to buildHeroSearchParams + router.push)
     - dateLabel (delegates to buildHeroDateLabel)

   🔎 EK — Panelin üst kenarına yarı binen ortalanmış villa-adı arama
   input'u eklendi (VillaSearchBox hero variant, kendi canlı arama +
   navigation logic'i ile). Bu input filtre submit butonundan TAMAMEN
   BAĞIMSIZ; salt görsel/UX ek. Filtre bar (CATEGORY → REGION → DATE →
   GUESTS → "Villa bul" CTA) ve handleSearch/router.push AYNEN korundu.

   ⚠️ KESIN KURAL:
     - useRouter() çağrısı bu component içinde (HEro shell'den prop
       geçmez); encapsulation tam.
     - DatePicker `portalId="hero-datepicker-portal"` AYNEN; portal
       target `<div id="hero-datepicker-portal" />` Hero shell'in
       içinde kalır.
     - Outside click `document.addEventListener("mousedown", handler)`
       + cleanup `removeEventListener` AYNEN.
     - DatePicker callback signature `(dates: any) => { const [start,
       end] = dates; ... }` — `any` tipi BYTE-IDENTICAL korundu
       (DatePicker selectsRange tipi loose). Burada typed yapmak
       potansiyel selectsRange semantic'i etkileyebilir → skip.
     - 4 alan sırası: CATEGORY → REGION → DATE → GUESTS → SEARCH AYNEN.
     - DatePicker / dropdown / outside-click davranışı AYNEN.
     - registerLocale("tr", tr) module-level çağrı korundu.
=============================================================== */

export default function HeroSearchPanel() {
  const router = useRouter();

  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [guests, setGuests] = useState(1);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [openCat, setOpenCat] = useState(false);
  const [openRegion, setOpenRegion] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<FilterOption[]>([]);

  const catRef = useRef<HTMLDivElement>(null);
  const regRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchFilters = async () => {
      const { data: types } = await menuRepository.findAllVillaTypes();
      const { data: locations } =
        await menuRepository.findAllVillaLocations();
      if (types) setCategoryOptions(types);
      /* 🛡️ Migration 050 — Hero bölge dropdown'ı yalnız ANA BÖLGELERİ
         (grup kökü: name === filter_group_name) gösterir. Alt bölgeler
         gizlenir; detay seçimi /arama sidebar'ında. Resolver/URL/SEO
         değişmez — kullanıcı "Kalkan" seçince grup-kökü genişletmesi
         sayesinde tüm alt bölge villaları gelmeye devam eder. */
      if (locations) {
        setRegionOptions(
          locations.filter((l) => {
            const g = (l.filter_group_name ?? "").toString().trim();
            return g.length > 0 && l.name === g;
          })
        );
      }
    };
    fetchFilters();
  }, []);

  // Outside click for dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node))
        setOpenCat(false);
      if (regRef.current && !regRef.current.contains(e.target as Node))
        setOpenRegion(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleItem = (
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    if (list.includes(value)) setList(list.filter((i) => i !== value));
    else setList([...list, value]);
  };

  const handleSearch = () => {
    const query = buildHeroSearchParams({
      categories,
      regions,
      startDate,
      endDate,
      guests,
      categoryOptions,
      regionOptions,
    });
    router.push(`/arama?${query}`);
  };

  const dateLabel = buildHeroDateLabel(startDate, endDate);

  return (
    /* ═══════════════════════════════════════════════════════
        🛡️ FAZ 39B — FLOATING SEARCH PANEL (premium glass)
        ═══════════════════════════════════════════════════════
        Mevcut state + handlers AYNEN korundu. Visual:
          - Daha kuvvetli layered shadow stack
          - Daha geniş radius (28px)
          - İnce top highlight (white inner ring)
          - Coral CTA gradient + elevated shadow
        ═══════════════════════════════════════════════════════ */
    <div className="relative mt-12 md:mt-16">
      {/* ═══════════════════════════════════════════════════════
          🔎 FLOATING VILLA-ADI ARAMA — panelin üst kenarına yarı
          binen, ortalanmış premium pill. Mevcut VillaSearchBox
          (hero variant) → canlı arama + autocomplete + navigation.
          Filtre alanları / filtre logic'i ile SIFIR etkileşim.
          ═══════════════════════════════════════════════════════ */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-7 z-40 w-[min(90vw,400px)]">
        <VillaSearchBox variant="hero" placeholder="Villa adı ile ara..." />
      </div>

      <div
        className="
          relative isolate z-30
          bg-gradient-to-b from-white/92 to-white/[0.85] backdrop-blur-2xl
          border-[3px] border-[var(--color-stone-900)]
          rounded-2xl
          shadow-[0_36px_90px_-28px_rgba(11,31,58,0.42),0_12px_30px_-16px_rgba(2, 170, 229,0.16),inset_0_1px_0_rgba(255,255,255,0.7)]
          px-2 md:px-2.5 pb-2 md:pb-2.5 pt-10 md:pt-11
          gap-1.5 md:gap-2
          flex flex-col md:flex-row items-stretch
          text-left
        "
      >
      {/* Inner highlight — premium top edge */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0 rounded-2xl
          ring-1 ring-inset ring-white/50
        "
      />
      {/* CATEGORY */}
      <div ref={catRef} className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            setOpenCat(!openCat);
            setOpenRegion(false);
          }}
          className="
            w-full px-4 py-3 rounded-xl
            bg-white/40 border border-white/50
            hover:bg-white/75 hover:border-[var(--color-champagne-500)]/35
            transition flex items-center gap-3 text-left
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--color-champagne-500)]/30
          "
        >
          <span
            className="
              w-9 h-9 rounded-xl shrink-0
              bg-[var(--color-champagne-50)]
              flex items-center justify-center
              text-[var(--color-champagne-600)]
            "
            aria-hidden
          >
            <Tag size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
              Tip
            </div>
            <div className="text-[14px] font-medium text-[var(--color-stone-900)] truncate">
              {categories.length
                ? `${categories.length} villa tipi seçildi`
                : "Villa tipi"}
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-[var(--color-stone-400)] transition ${
              openCat ? "rotate-180" : ""
            }`}
          />
        </button>

        {openCat && (
          <div className="absolute top-full mt-2 left-0 w-full md:w-72 min-w-[16rem] max-w-[calc(100vw-2.5rem)] bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] p-2 z-[60] max-h-72 overflow-auto">
            {categoryOptions.length === 0 && (
              <div className="text-sm text-[var(--color-stone-400)] p-3">
                Yükleniyor…
              </div>
            )}
            {categoryOptions.map((item) => {
              const checked = categories.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    checked
                      ? "bg-[var(--brand-coral-tint)] text-[var(--color-stone-900)]"
                      : "hover:bg-[var(--color-champagne-50)] text-[var(--color-stone-700)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleItem(item.id, categories, setCategories)
                    }
                    className="!w-4 !h-4 !rounded"
                    style={{ accentColor: "var(--brand-coral)" }}
                  />
                  {item.name}
                </label>
              );
            })}
          </div>
        )}
      </div>


      {/* REGION */}
      <div ref={regRef} className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            setOpenRegion(!openRegion);
            setOpenCat(false);
          }}
          className="
            w-full px-4 py-3 rounded-xl
            bg-white/40 border border-white/50
            hover:bg-white/75 hover:border-[var(--color-champagne-500)]/35
            transition flex items-center gap-3 text-left
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--color-champagne-500)]/30
          "
        >
          <span
            className="
              w-9 h-9 rounded-xl shrink-0
              bg-[var(--color-champagne-50)]
              flex items-center justify-center
              text-[var(--color-champagne-600)]
            "
            aria-hidden
          >
            <MapPin size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
              Bölge
            </div>
            <div className="text-[14px] font-medium text-[var(--color-stone-900)] truncate">
              {regions.length
                ? `${regions.length} bölge seçildi`
                : "Tüm bölgeler"}
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-[var(--color-stone-400)] transition ${
              openRegion ? "rotate-180" : ""
            }`}
          />
        </button>

        {openRegion && (
          <div className="absolute top-full mt-2 left-0 md:left-auto md:right-0 w-full md:w-72 min-w-[16rem] max-w-[calc(100vw-2.5rem)] bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] p-2 z-[60] max-h-72 overflow-auto">
            {regionOptions.length === 0 && (
              <div className="text-sm text-[var(--color-stone-400)] p-3">
                Yükleniyor…
              </div>
            )}
            {regionOptions.map((item) => {
              const checked = regions.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    checked
                      ? "bg-[var(--brand-coral-tint)] text-[var(--color-stone-900)]"
                      : "hover:bg-[var(--color-champagne-50)] text-[var(--color-stone-700)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleItem(item.id, regions, setRegions)
                    }
                    className="!w-4 !h-4 !rounded"
                    style={{ accentColor: "var(--brand-coral)" }}
                  />
                  {item.name}
                </label>
              );
            })}
          </div>
        )}
      </div>


      {/* DATE */}
      <div className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white/40 border border-white/50 hover:bg-white/75 hover:border-[var(--color-champagne-500)]/35 transition flex items-center gap-3">
        <span
          className="
            w-9 h-9 rounded-xl shrink-0
            bg-[var(--brand-coral-tint)]
            flex items-center justify-center
            text-[var(--brand-coral)]
          "
          aria-hidden
        >
          <Calendar size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
            Tarih
          </div>
          <DatePicker
            selected={startDate}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(dates: any) => {
              const [start, end] = dates;
              setStartDate(start);
              setEndDate(end);
            }}
            startDate={startDate}
            endDate={endDate}
            selectsRange
            locale="tr"
            dateFormat="dd.MM.yyyy"
            minDate={new Date()}
            placeholderText="Tarih seç"
            className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none w-full text-[14px] font-medium !text-[var(--color-stone-900)] placeholder-[var(--color-stone-400)] cursor-pointer"
            value={dateLabel === "Tarih seç" ? "" : dateLabel}
            popperPlacement="bottom-start"
            popperClassName="!z-[60]"
            portalId="hero-datepicker-portal"
            /* 🛡️ Mobil sanal klavye baskılama — customInput içinde
               inputMode="none". Takvim popper'ı, value display,
               selectsRange, onChange, dateFormat, locale, minDate,
               placeholderText AYNEN korunur. Desktop davranışı
               değişmez. Detay: MobileKbSafeInput.tsx başlığı. */
            customInput={<MobileKbSafeInput />}
          />
        </div>
      </div>


      {/* GUESTS */}
      <div className="px-4 py-3 rounded-xl bg-white/40 border border-white/50 hover:bg-white/75 hover:border-[var(--color-champagne-500)]/35 transition flex items-center gap-3">
        <span
          className="
            w-9 h-9 rounded-xl shrink-0
            bg-[var(--brand-coral-tint)]
            flex items-center justify-center
            text-[var(--brand-coral)]
          "
          aria-hidden
        >
          <Users size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
            Kişi
          </div>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none text-[14px] font-medium !text-[var(--color-stone-900)] cursor-pointer"
            style={{ backgroundImage: "none", paddingRight: 0 }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => (
              <option key={g} value={g}>
                {g} kişi
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SEARCH CTA — filtre submit (handleSearch → /arama). Turkuaz
         gradient + multi-stop shadow stack → premium concierge button.
         Floating villa-adı input'tan BAĞIMSIZ; filtre akışını tetikler. */}
      <button
        onClick={handleSearch}
        className="
          group inline-flex items-center justify-center gap-2
          !rounded-xl !px-7 md:!px-8 !py-4
          mt-1.5 md:mt-0 md:ml-1.5
          text-white font-medium text-[14px] tracking-[0.02em]
          bg-gradient-to-br from-[#1fb2ec] via-[var(--brand-coral)] to-[var(--brand-coral-deep)]
          shadow-[0_20px_44px_-12px_rgba(2, 170, 229,0.55),0_8px_20px_-8px_rgba(11,31,58,0.28),inset_0_1px_0_rgba(255,255,255,0.28)]
          hover:shadow-[0_26px_54px_-12px_rgba(2, 170, 229,0.65),0_10px_24px_-8px_rgba(11,31,58,0.34),inset_0_1px_0_rgba(255,255,255,0.34)]
          hover:-translate-y-[1px]
          transition-[transform,box-shadow] duration-300
          motion-reduce:transition-none motion-reduce:hover:translate-y-0
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--brand-coral)]/50
          focus-visible:ring-offset-2 focus-visible:ring-offset-white
        "
      >
        <Search
          size={16}
          className="
            transition-transform duration-300
            motion-reduce:transition-none
            group-hover:scale-110
          "
          aria-hidden
        />
        <span>Villa bul</span>
      </button>

      </div>
    </div>
  );
}
