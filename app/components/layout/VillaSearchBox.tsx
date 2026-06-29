"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

/* 🛡️ EXIT HARDENING — canlı arama sorgusu villaRepository.searchByTitle
   (client-safe barrel; aynı anon RLS + birebir aynı SELECT/filter/ilike/
   limit). */
import { villaRepository } from "@/lib/db/villa.repository";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";

/* ===============================================================
   🛡️ VILLA SEARCH BOX — paylaşılan canlı arama (header + hero)
   ===============================================================
   Önceden Header.tsx içinde INLINE idi (desktop + mobile, paylaşılan
   state). Hero'ya taşınabilmesi için DUPLIKASYON OLMADAN buraya
   çıkarıldı. State + debounce effect + outside-click + getImage +
   dropdown JSX BİREBİR korundu (davranış değişmedi).

   variant:
     - "desktop" → header sağ pill (md:flex)
     - "mobile"  → header strip input (md:hidden)
     - "hero"    → Hero içi premium glassmorphism, full-width box
   onResultNavigate: sonuç tıklanınca ekstra callback (header mobile
     drawer'ı kapatmak için setOpen(false) geçer).
   =============================================================== */

type Variant = "desktop" | "mobile" | "hero";

export default function VillaSearchBox({
  variant = "desktop",
  placeholder = "Villa ara...",
  onResultNavigate,
}: {
  variant?: Variant;
  placeholder?: string;
  onResultNavigate?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);

  /* 🛡️ LIVE SEARCH — debounce + memory-leak guard (Header'dan birebir).
     `cancelled` flag: debounce geç tetiklemesi veya response gelmeden
     unmount olursa setState çağrılmaması için. */
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      const data = await villaRepository.searchByTitle(search, 5);
      if (cancelled) return;
      setResults(data || []);
      setLoading(false);
      setOpenSearch(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search]);

  useEffect(() => {
    const handleClick = () => setOpenSearch(false);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const getImage = (villa: any) => {
    if (!villa.villa_images?.length) return "/placeholder.jpg";
    const sorted = villa.villa_images.sort((a: any, b: any) => {
      if (a.is_cover) return -1;
      if (b.is_cover) return 1;
      return a.sort_order - b.sort_order;
    });
    /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından
       URL; legacy FULL URL pass-through, relative path → URL. */
    return resolveVillaImageUrl(sorted[0]?.image_url) || "/placeholder.jpg";
  };

  /* ── Variant presentation (yalnız stiller; mantık ortak) ───────── */
  const containerClass =
    variant === "hero"
      ? "relative flex items-center gap-3 w-full max-w-xl rounded-3xl px-6 py-4 bg-gradient-to-b from-white/82 to-white/64 backdrop-blur-xl border border-[var(--color-champagne-500)]/25 shadow-[0_26px_60px_-22px_rgba(11,31,58,0.45),0_10px_26px_-14px_rgba(2, 170, 229,0.20),inset_0_1px_0_rgba(255,255,255,0.65)] transition-[box-shadow,border-color] duration-300 motion-reduce:transition-none focus-within:border-[var(--color-champagne-500)]/55 focus-within:shadow-[0_30px_66px_-20px_rgba(11,31,58,0.5),0_0_0_4px_rgba(2, 170, 229,0.14),0_10px_26px_-12px_rgba(2, 170, 229,0.32),inset_0_1px_0_rgba(255,255,255,0.7)]"
      : variant === "mobile"
        ? "relative flex items-center bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] rounded-full px-3 py-1.5 flex-1 min-w-0 max-w-[160px]"
        : "relative flex items-center rounded-full border bg-[var(--color-sand-50)] border-[var(--color-stone-100)] text-[var(--color-stone-700)] px-4 py-2 transition-colors duration-300 motion-reduce:transition-none";

  const iconSize = variant === "hero" ? 19 : variant === "mobile" ? 14 : 15;

  /* Hero'da amber accent (daha belirgin concierge hissi); header
     variant'larında nötr stone-400 KORUNUR. */
  const iconClass =
    variant === "hero"
      ? "text-[var(--brand-coral)] shrink-0"
      : "text-[var(--color-stone-400)] shrink-0";

  const inputClass =
    variant === "hero"
      ? "!bg-transparent !border-0 !shadow-none outline-none w-full px-1 text-[15px] tracking-[0.01em] !text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] placeholder:font-normal placeholder:tracking-[0.02em]"
      : variant === "mobile"
        ? "!bg-transparent !border-0 !shadow-none outline-none text-[13px] pl-2 w-full min-w-0"
        : "!bg-transparent !border-0 !shadow-none outline-none text-[13.5px] px-2 w-32 focus:w-48 transition-all !text-[var(--color-stone-900)] placeholder-[var(--color-stone-400)]";

  const dropdownClass =
    variant === "hero"
      ? "absolute top-full mt-3 left-0 w-full bg-white/98 backdrop-blur-xl rounded-2xl border border-[var(--color-champagne-500)]/15 shadow-[0_30px_70px_-22px_rgba(11,31,58,0.45),0_10px_28px_-14px_rgba(11,31,58,0.18)] z-50 overflow-hidden"
      : variant === "mobile"
        ? "absolute top-full mt-2 right-0 w-[260px] sm:w-[300px] bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-50 overflow-hidden"
        : "absolute top-full mt-3 left-0 w-96 bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-50 overflow-hidden";

  const handleResultClick = () => {
    setOpenSearch(false);
    setSearch("");
    onResultNavigate?.();
  };

  return (
    <div className={containerClass} onClick={(e) => e.stopPropagation()}>
      <Search
        size={iconSize}
        className={iconClass}
        strokeWidth={variant === "hero" ? 2.25 : 2}
        aria-hidden
      />

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpenSearch(true)}
        placeholder={placeholder}
        className={inputClass}
      />

      {openSearch && search && (
        <div className={dropdownClass}>
          {loading && (
            <div className="p-4 text-sm text-[var(--color-stone-500)] flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-[var(--brand-coral)] border-t-transparent rounded-full animate-spin" />
              Aranıyor...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="p-5 text-center text-sm text-[var(--color-stone-400)]">
              <p className="font-medium text-[var(--color-stone-600)]">
                Sonuç bulunamadı
              </p>
              <p className="text-xs mt-1">
                Farklı bir arama denemeye ne dersin?
              </p>
            </div>
          )}

          {!loading &&
            results.map((villa) => (
              <Link
                key={villa.id}
                href={`/kiralik-villa/${villa.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-sand-50)] transition border-b border-[var(--color-stone-100)] last:border-b-0"
                onClick={handleResultClick}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImage(villa)}
                  alt=""
                  className="w-14 h-12 object-cover rounded-lg ring-1 ring-[var(--color-stone-100)]"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13.5px] font-medium text-[var(--color-stone-900)] truncate">
                    {villa.title}
                  </span>
                  <span className="text-[11px] text-[var(--color-stone-400)] tracking-[0.05em] uppercase">
                    Villayı görüntüle →
                  </span>
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
