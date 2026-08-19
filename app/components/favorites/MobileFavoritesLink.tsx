"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

import { useFavorites } from "@/hooks/use-favorites";

/* ===============================================================
   🛡️ MOBILE FAVORITES MENU ENTRY (island)
   ===============================================================
   Mobil hamburger drawer'ında tam-genişlik "Favorilerim" satırı +
   dinamik favori sayısı. MEVCUT altyapıyı yeniden kullanır:
     - route: `/favoriler` (mevcut)
     - hook : `useFavorites()` (count + isHydrated) — HeaderFavorites
              Link ile AYNI; yeni state/sistem/API/localStorage YOK.

   SSR SAFETY: count yalnız isHydrated sonrası render edilir → server +
   ilk client render birebir (badge yok) → hidrasyon mismatch yok.

   onNavigate: tıklanınca mobil menüyü kapatmak için parent callback
   (Header `setOpen(false)`). Zaten `/favoriler`'deyken pathname
   değişmese bile menü kapanır. Yeni navigation sistemi yazılmaz.

   NOT: yalnız mobil drawer'da kullanılır; desktop favori ikonu
   (HeaderFavoritesLink) ve VillaCard FavoriteButton DOKUNULMAZ.
   =============================================================== */

export default function MobileFavoritesLink({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { count, isHydrated } = useFavorites();
  const showCount = isHydrated && count > 0;

  return (
    <Link
      href="/favoriler"
      onClick={onNavigate}
      aria-label={showCount ? `Favorilerim (${count})` : "Favorilerim"}
      className="
        inline-flex items-center justify-between gap-2
        w-full !py-3 px-4 rounded-full
        border border-[var(--color-stone-200)]
        text-[13px] font-medium text-[var(--color-stone-700)]
        hover:border-[var(--brand-coral)]
        hover:text-[var(--color-stone-900)]
        hover:bg-[var(--brand-coral-tint)]
        transition-colors motion-reduce:transition-none
      "
    >
      <span className="inline-flex items-center gap-2">
        <Heart
          size={15}
          fill={showCount ? "currentColor" : "none"}
          className={showCount ? "text-[var(--brand-coral)]" : ""}
          strokeWidth={1.75}
          aria-hidden
        />
        Favorilerim
      </span>

      {showCount && (
        <span
          aria-hidden
          className="
            min-w-[20px] h-[20px] px-[6px]
            rounded-full
            text-[11px] font-medium tabular-nums leading-none
            inline-flex items-center justify-center
            bg-[var(--brand-coral)] text-white
          "
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
