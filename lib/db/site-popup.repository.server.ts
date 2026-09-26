import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";
import type { SitePopupRow } from "@/lib/site-popup";

/* ===============================================================
   🛡️ SITE POPUP REPOSITORY (server-only) — migration 095
   ===============================================================
   Tek satırlık `site_popup` tablosu (id = 1). Tablo adı ve satır
   kimliği SABİT; çağırandan gelmez. `update` yalnız servis
   katmanının isimle kurduğu alan listesini alır (keyfi obje
   passthrough YOK — bkz. site-popup.service.ts).
   =============================================================== */

const TABLE = "site_popup";
const SINGLETON_ID = 1;

export type SitePopupWritable = Pick<
  SitePopupRow,
  | "is_enabled"
  | "image_path"
  | "title"
  | "description"
  | "highlight_text"
  | "button_text"
  | "button_url"
  | "show_button"
  | "display_scope"
  | "dismiss_duration"
  | "starts_at"
  | "ends_at"
  | "updated_at"
> & { stats: string[] };

export const sitePopupRepository = {
  async find() {
    return dbAdmin
      .from<SitePopupRow>(TABLE)
      .select("*")
      .eq("id", SINGLETON_ID)
      .maybeSingle();
  },

  async update(values: SitePopupWritable) {
    return dbAdmin
      .from<SitePopupRow>(TABLE)
      .update(values as unknown as Record<string, unknown>)
      .eq("id", SINGLETON_ID)
      .select("*")
      .maybeSingle();
  },
};
