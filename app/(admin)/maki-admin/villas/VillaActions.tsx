"use client";

/* ===============================================================
   🛡️ ADMIN — VILLA CARD ACTIONS (client island)
   ===============================================================
   Server-rendered villa list card'ı içine yerleştirilen client
   wrapper. Aktif/pasif toggle + soft delete.
   - Toggle: setVillaActive(id, bool)
   - Delete: ConfirmDialog (destructive variant) → softDeleteVilla
   - Notification: useNotify
   - router.refresh() ile server component'i yeniden çağırır
   =============================================================== */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power, Trash2 } from "lucide-react";

/* 🛡️ FAZ 2 frontend purge — direct service import KALDIRILDI.
   Eskiden:
     import { setVillaActive, softDeleteVilla } from "@/app/services/villa-admin.service";
   villa-admin.service barrel `hard-delete.service` ve `private-token.service`
   re-export ediyor; her ikisi `admin-gateway/server` (server-only) zinciri
   pulluyor → client bundle'a sızıntı. Şimdi:
     - PATCH /api/admin/villas/[id]/active   → setVillaActive delege
     - POST  /api/admin/villas/[id]/soft-delete → softDeleteVilla delege */
import { adminFetch } from "@/lib/admin-fetch";
import { revalidateVillas } from "@/app/services/revalidate.actions";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";

export function VillaActions({
  villaId,
  villaTitle,
  initialActive,
}: {
  villaId: string;
  villaTitle: string;
  initialActive: boolean;
}) {
  const toast = useNotify();
  const confirm = useConfirm();
  const router = useRouter();

  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);

  const handleToggle = async () => {
    if (pending) return;
    setPending(true);
    const next = !active;
    /* 🛡️ FAZ 2 — adminFetch PATCH /api/admin/villas/[id]/active.
       Route içinde setVillaActive(id, next) service delege; aynı return
       shape { ok, error } caller'a iletilir. */
    let res: { ok: boolean; error?: string };
    try {
      const apiRes = await adminFetch(
        `/api/admin/villas/${encodeURIComponent(villaId)}/active`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: next }),
        }
      );
      const json = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      res =
        apiRes.ok && json.ok
          ? { ok: true }
          : { ok: false, error: json.error || `HTTP ${apiRes.status}` };
    } catch (err) {
      res = {
        ok: false,
        error: err instanceof Error ? err.message : "İstek başarısız",
      };
    }
    setPending(false);
    if (!res.ok) {
      toast.error("Durum güncellenemedi", {
        id: `villa-active-${villaId}`,
        description: res.error,
      });
      return;
    }
    setActive(next);
    toast.success(next ? "Villa aktif" : "Villa pasifleştirildi", {
      id: `villa-active-${villaId}`,
    });
    /* 🛡️ FAZ 55J-1 — AUDIT LOG (fail-safe).
       Yön bilgisi explicit: villa.published / villa.unpublished.
       Tek alan diff (is_active). */
    logActivity({
      action: next ? "villa.published" : "villa.unpublished",
      entity_type: "villa",
      entity_id: villaId,
      entity_title: villaTitle,
      before_data: { is_active: !next },
      after_data: { is_active: next },
    }).catch(() => {});
    revalidateVillas().catch(() => {});
    router.refresh();
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Villa silinsin mi?",
      description:
        `"${villaTitle}" admin görünümünden tamamen kaldırılır. ` +
        "Mevcut rezervasyon kayıtları korunur. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;

    /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villas/[id]/soft-delete.
       Route içinde softDeleteVilla(id) service delege; aynı { ok, error }
       shape. */
    let res: { ok: boolean; error?: string };
    try {
      const apiRes = await adminFetch(
        `/api/admin/villas/${encodeURIComponent(villaId)}/soft-delete`,
        { method: "POST" }
      );
      const json = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      res =
        apiRes.ok && json.ok
          ? { ok: true }
          : { ok: false, error: json.error || `HTTP ${apiRes.status}` };
    } catch (err) {
      res = {
        ok: false,
        error: err instanceof Error ? err.message : "İstek başarısız",
      };
    }
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `villa-delete-${villaId}`,
        description: res.error,
      });
      return;
    }
    toast.success("Villa silindi", {
      id: `villa-delete-${villaId}`,
    });
    /* 🛡️ FAZ 55J-1 — AUDIT LOG (fail-safe). Soft delete. */
    logActivity({
      action: "villa.deleted",
      entity_type: "villa",
      entity_id: villaId,
      entity_title: villaTitle,
      before_data: { id: villaId, title: villaTitle, is_active: active },
    }).catch(() => {});
    revalidateVillas().catch(() => {});
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className={
          "admin-btn-ghost flex-1 disabled:opacity-50 " +
          (active
            ? ""
            : "!text-amber-700 !border-amber-200 hover:!bg-amber-50")
        }
        aria-label={active ? "Villayı pasifleştir" : "Villayı aktifleştir"}
        title={
          active
            ? "Pasifleştir — public görünmez, admin görür"
            : "Aktifleştir — public görünür"
        }
      >
        <Power size={13} />
        {active ? "Pasifleştir" : "Aktifleştir"}
      </button>

      <button
        type="button"
        onClick={handleDelete}
        className="admin-btn-ghost shrink-0 !text-red-600 !border-red-200 hover:!bg-red-50"
        aria-label="Villa sil"
        title="Villayı sil"
      >
        <Trash2 size={13} />
      </button>
    </>
  );
}
