import SettingsNav from "./_components/SettingsNav";

/* ===============================================================
   🛡️ ADMIN > SETTINGS LAYOUT — modüler experience
   ===============================================================
   Mevcut /maki-admin/settings/page.tsx (1497 satır) DOKUNULMADI;
   içerikleriyle birlikte sticky nav'ın "Tümü (Klasik)" linkinde
   intact. Yeni alt route'lar (genel/iletisim/seo/rezervasyon/...)
   nav'daki diğer linklerle açılır.

   Layout SSR-safe server component; SettingsNav client island
   (usePathname kullanır).
   =============================================================== */

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] xl:grid-cols-[240px_1fr] gap-6 lg:gap-10">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
