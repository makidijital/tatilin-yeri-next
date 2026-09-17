"use client";

/* ===============================================================
   🛡️ PHASE 12B — ADMIN DİL SEÇİCİ (topbar)
   ===============================================================
   Mevcut admin tasarım diline BAĞLI kalır: yeni CSS/token/komponent
   kütüphanesi eklenmez, `admin-btn-ghost` (globals.css) yeniden
   kullanılır. Native `<select>` tercih edildi — outside-click /
   focus-trap / portal gerektirmez, klavye ve ekran okuyucu
   desteği tarayıcıdan gelir (NotificationBell'in custom dropdown
   davranışına DOKUNULMAZ).

   Etiket `common.language` ("Dil" / "Language" / "Sprache") — MEVCUT
   public key; yeni/duplicate key AÇILMADI.
   =============================================================== */

import { useAdminLocale } from "./AdminLocaleProvider";

const OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "tr", label: "🇹🇷 TR" },
  { value: "en", label: "🇬🇧 EN" },
  { value: "de", label: "🇩🇪 DE" },
];

export function AdminLocaleSwitcher() {
  const { locale, setLocale, dictionary } = useAdminLocale();
  const label = dictionary.common.language;

  return (
    <select
      data-admin-locale-switcher
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      aria-label={label}
      title={label}
      className="admin-btn-ghost !px-2.5 !py-1.5 !text-[13px] !gap-1 cursor-pointer"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
