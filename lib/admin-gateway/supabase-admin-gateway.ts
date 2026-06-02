import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

import type { AdminGateway } from "./admin-gateway.provider";
import type {
  AdminAuditAction,
  AdminGatewayContext,
  GatewayResult,
} from "./admin-gateway.types";
import { adminAuditRepository } from "./audit.repository";

/* ===============================================================
   🛡️ FAZ 41 — SUPABASE ADMIN GATEWAY (Implementation)
   ===============================================================
   AdminGateway interface'inin Supabase service-role impl'i.
   Service-role client'ı (`getSupabaseAdmin()`) yalnız BU dosyada
   tüketilir; diğer tüm tüketiciler gateway üzerinden geçer.

   ⚠️ KESIN KURAL:
     - Gateway sessiz: throw etmez; GatewayResult döner.
     - Audit best-effort fire-forget (await edilmez normalde).
     - Predicate destek: minimal — `.eq(key, val)` set. Daha
       karmaşık filter için `findRows` yerine `runRaw` escape.
     - `runRaw<T>` admin client'ı ham geçirir; sadece migration
       sürecinde geçici kullanılır.
=============================================================== */

export const supabaseAdminGateway: AdminGateway = {
  async insertRow(table, payload) {
    try {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from(table)
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) {
        return { ok: false, error: error.message || "" };
      }
      return { ok: true, value: data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      };
    }
  },

  async updateRow(table, id, payload) {
    try {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from(table)
        .update(payload)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        return { ok: false, error: error.message || "" };
      }
      return { ok: true, value: data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      };
    }
  },

  async deleteRow(table, id) {
    try {
      const admin = getSupabaseAdmin();
      const { error } = await admin.from(table).delete().eq("id", id);
      if (error) {
        return { ok: false, error: error.message || "" };
      }
      return { ok: true, value: null };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      };
    }
  },

  async findRows(table, select, predicates) {
    try {
      const admin = getSupabaseAdmin();
      let query = admin.from(table).select(select);
      if (predicates) {
        for (const [key, val] of Object.entries(predicates)) {
          query = query.eq(key, val);
        }
      }
      const { data, error } = await query;
      if (error) {
        return { ok: false, error: error.message || "" };
      }
      return { ok: true, value: (data as unknown[]) || [] };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      };
    }
  },

  async audit(action, payload) {
    /* Best-effort fire-forget; caller `void adminGateway.audit(...)`
       pattern'i ile bloklamaz. Audit fail asla ana akışı bozmaz.

       IMPLICIT ADMIN CONTEXT:
         Caller `context.adminUserId` vermediyse gateway'in kendisi
         `getCurrentAdmin()` ile lookup yapar. Bu sayede service
         signature'ları DEĞIŞMEZ; caller migration sıfır.
         Lookup fail → admin_user_id null (audit kaydı yine düşer). */
    let adminUserId: string | null =
      payload.context?.adminUserId ?? null;
    if (
      adminUserId === null &&
      payload.context?.adminUserId === undefined
    ) {
      try {
        const { getCurrentAdmin } = await import("@/lib/admin-auth");
        const admin = await getCurrentAdmin();
        adminUserId = admin?.id ?? null;
      } catch {
        adminUserId = null;
      }
    }

    await adminAuditRepository.insert({
      admin_user_id: adminUserId,
      action,
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      before_data: payload.before ?? null,
      after_data: payload.after ?? null,
      metadata: payload.metadata ?? null,
      ip: payload.context?.ip ?? null,
      user_agent: payload.context?.userAgent ?? null,
    });
  },

  async runRaw<T>(fn: (admin: unknown) => Promise<T>): Promise<T> {
    const admin = getSupabaseAdmin();
    return fn(admin);
  },
};

/* Kullanım örneği (caller'da fire-forget audit):

   import { adminGateway } from "@/lib/admin-gateway";

   const result = await adminGateway.updateRow("villa", id, {
     is_active: true,
   });
   // Caller mevcut error mesajını kendisi üretir.

   // Audit fire-forget (await yok, caller akışını bloklamaz):
   void adminGateway.audit("villa.visibility_toggle", {
     context: { adminUserId, ip, userAgent },
     entityType: "villa",
     entityId: id,
     after: { is_active: true },
   });
*/

export { adminAuditRepository };
export type {
  AdminAuditAction,
  AdminGatewayContext,
  GatewayResult,
};
