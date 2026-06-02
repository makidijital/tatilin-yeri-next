import type {
  AdminAuditAction,
  AdminGatewayContext,
  GatewayResult,
} from "./admin-gateway.types";

/* ===============================================================
   🛡️ FAZ 41 — ADMIN GATEWAY INTERFACE
   ===============================================================
   Service-role privileged operations için tek boundary. Tüketici
   modüller `getSupabaseAdmin()` import etmez; gateway üzerinden
   geçer. Audit log fire-forget.

   ⚠️ KESIN KURAL:
     - Pure I/O contract: query + (best-effort) audit.
     - Throw mesajları, console tag'leri, Result envelope CALLER
       tarafında kalır. Gateway sessiz GatewayResult döner;
       caller mevcut domain mesaj/throw'unu sürdürür.
     - `audit` çağrısı opsiyonel — read operations için kullanılmaz.

   ⚠️ DESIGN:
     - Generic table CRUD verb'leri (insertRow/updateRow/deleteRow/
       findRows) — sub-domain için ayrı bir gateway gerekirse
       SupabaseAdminGateway'ı extend ederiz.
     - `audit(action, entry)` fire-forget; caller await etmez.
     - `runRaw(fn)` — geçici escape hatch (kompleks RPC chain'leri
       için). Audit kapsama altı YOK; sadece migration kolaylığı
       için. Yeni call site eklenmez; mevcut kalanlar için.
=============================================================== */

export interface AdminGateway {
  /** Tablo INSERT — service-role context. */
  insertRow(
    table: string,
    payload: Record<string, unknown>
  ): Promise<GatewayResult<unknown>>;

  /** Tablo UPDATE — service-role context. */
  updateRow(
    table: string,
    id: string,
    payload: Record<string, unknown>
  ): Promise<GatewayResult<unknown>>;

  /** Tablo DELETE — service-role context. */
  deleteRow(
    table: string,
    id: string
  ): Promise<GatewayResult<unknown>>;

  /** Tablo SELECT (generic) — caller column projection geçirir. */
  findRows(
    table: string,
    select: string,
    predicates?: Record<string, unknown>
  ): Promise<GatewayResult<unknown[]>>;

  /** Audit log entry — fire-forget; throw etmez, await edilebilir
   *  ama mevcut caller akışına dahil edilmez (best-effort). */
  audit(
    action: AdminAuditAction | string,
    payload: {
      context?: AdminGatewayContext;
      entityType?: string | null;
      entityId?: string | null;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<void>;

  /** Escape hatch — geçici. Mevcut kompleks RPC chain'leri için.
   *  Yeni kod kullanmaz; FAZ 6'da inventory üzerinden kaldırma
   *  hedeflenir. */
  runRaw<T>(fn: (admin: unknown) => Promise<T>): Promise<T>;
}
