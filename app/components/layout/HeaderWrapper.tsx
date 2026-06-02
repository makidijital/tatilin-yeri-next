import Header from "./Header";
import { getMenu } from "@/app/services/menu.service";
import { getPublicSettings } from "@/app/services/settings.service";
import { resolveAssetUrl } from "@/lib/storage.helpers";

export default async function HeaderWrapper() {
  /* ===============================================================
     🔥 SITE LOGO
     ===============================================================
     settings.site_logo varsa header'a aktarılır.
     Boş ise Header default text wordmark fallback gösterir.
     🛡️ Aşama A — resolveAssetUrl: FULL URL (legacy) pass-through;
        relative path (yeni) runtime'da getPublicUrl ile URL'e çevrilir.
     =============================================================== */
  let siteLogo: string | null = null;
  try {
    const settings = await getPublicSettings();
    siteLogo = resolveAssetUrl(settings?.site_logo) || null;
  } catch {
    siteLogo = null;
  }

  try {
    const menu = await getMenu();

    // 🔥 güvenlik: boş gelirse array yap
    return <Header menu={menu || []} siteLogo={siteLogo} />;
  } catch (err) {
    console.error("❌ HeaderWrapper menu error:", err);

    // 🔥 fallback
    return <Header menu={[]} siteLogo={siteLogo} />;
  }
}
