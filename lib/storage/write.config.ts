/* ===============================================================
   🛡️ FAZ C — STORAGE WRITE CONFIG (client-safe)
   ===============================================================
   WRITE (upload/remove) sürücüsü READ'ten (cdn.config / STORAGE_DRIVER)
   BAĞIMSIZ. Sebep: production'da read zaten r2; tek flag olsaydı
   deploy upload/remove'u anında flip ederdi. Ayrı flag'ler →
   kademeli + sıfır-canlı-etki geçiş.

   ⚠️ cdn.config'e DOKUNULMAZ (read config ayrı). Bu dosya yalnız
   write + dual-write switch'ini merkezler; index.ts (client seam) ve
   server.ts (server remove) ortak buradan okur → drift olmaz.

   ⚠️ CLIENT-SAFE: `import "server-only"` YOK; flag'ler NEXT_PUBLIC_
   (secret değil, yalnız davranış anahtarı). Hem browser hem server
   aynı build-inline değeri görür → tutarlı.

   FLAG'LER:
     NEXT_PUBLIC_STORAGE_WRITE_DRIVER  = "supabase" (default) | "r2"
     NEXT_PUBLIC_STORAGE_DUAL_WRITE    = "" (default off) | "true"/"1"/"on"

   ROLLBACK-SAFE DEFAULT:
     write tanımsız → "supabase"; dual tanımsız → off.
     → upload/remove tamamen Supabase (bugünkü davranış).
   =============================================================== */

export const STORAGE_WRITE_DRIVER = (
  process.env.NEXT_PUBLIC_STORAGE_WRITE_DRIVER || "supabase"
)
  .trim()
  .toLowerCase();

/** Write tarafı R2/S3'e mi gidiyor? (default false → Supabase). */
export function isR2WriteEnabled(): boolean {
  return STORAGE_WRITE_DRIVER === "r2" || STORAGE_WRITE_DRIVER === "s3";
}

export const STORAGE_DUAL_WRITE = (
  process.env.NEXT_PUBLIC_STORAGE_DUAL_WRITE || ""
)
  .trim()
  .toLowerCase();

/** Dual-write açık mı? (yalnız write=r2 iken anlamlı; default off). */
export function isDualWriteEnabled(): boolean {
  return (
    STORAGE_DUAL_WRITE === "true" ||
    STORAGE_DUAL_WRITE === "1" ||
    STORAGE_DUAL_WRITE === "on"
  );
}
