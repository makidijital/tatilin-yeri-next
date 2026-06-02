"use client";

/* ===============================================================
   🛡️ FAZ 33 — ADMIN REVIEW LIST (client island)
   ===============================================================
   /maki-admin/reviews moderation listesi.

   AKSIYONLAR:
     - Onayla → approveVillaReview (is_approved=true, approved_at=now)
     - Öne çıkar → toggleFeaturedReview (villa başına 1 tane;
       DB partial unique index zaten enforce eder)
     - Sil → deleteVillaReview (destructive useConfirm sonrası)

   🛡️ FAZ 33B — CLIENT-SIDE FETCH
   ─────────────────────────────────────────────────────────────
   Veri tarayıcıda fetch edilir; supabase client otomatik olarak
   admin'in JWT session'ını ekler → RLS `authenticated` role policy
   devreye girer → pending + approved hepsi görünür.

   Server fetch denenirse anon role uygulanır ve villa_reviews'in
   public SELECT policy'si `is_approved=true` koşuluyla pending
   yorumları gizler. Service-role kullanılmaz; mevcut admin auth
   pattern (client'ta Supabase session) reuse edilir.

   POST-MUTATION:
     - useNotify ile premium toast
     - revalidateVillaReviews → public sayfa cache invalidate
     - Optimistic local update (server roundtrip beklenmez)
     - Counter strip + liste her durumda authoritative refetch ile
       senkron tutulur

   UX:
     - Luxury stacked-list (reservation panel hissi)
     - Rounded-2xl card, soft shadow on hover
     - Star rating premium typography
     - Comment preview truncate
     - Status badge (Bekliyor / Yayında / Öne çıkan)
     - Mobile: actions flex-wrap; min 768px tek satır
     - İlk yükleme skeleton + premium counter strip dataset bağımlı
   =============================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Star,
  Trash2,
  CalendarRange,
  Sparkles,
  Inbox,
} from "lucide-react";

import {
  approveVillaReview,
  deleteVillaReview,
  getVillaReviewsForAdmin,
  toggleFeaturedReview,
  type VillaReviewAdmin,
} from "@/app/services/villa-review.service";
import { revalidateVillaReviews } from "@/app/services/revalidate.actions";
import { logActivity } from "@/lib/activity-log.client";
import { formatDateTr } from "@/lib/date-format";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

export default function ReviewAdminList() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [data, setData] = useState<VillaReviewAdmin[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  /* 🛡️ FAZ 33B — initial fetch loading state; mutation sırasında
     ayrı `busyId` per-row spinner zaten var. */
  const [loading, setLoading] = useState(true);

  /* Authoritative refetch — mount + her mutation sonrası çağrılır.
     Tarayıcı supabase oturumu authenticated → pending + approved gelir. */
  const refresh = useCallback(async () => {
    const fresh = await getVillaReviewsForAdmin();
    setData(fresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getVillaReviewsForAdmin();
        if (!cancelled) setData(fresh);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Counter strip: data değiştikçe yeniden hesaplanır. */
  const { pendingCount, approvedCount } = useMemo(() => {
    let p = 0;
    let a = 0;
    for (const r of data) {
      if (r.is_approved) a++;
      else p++;
    }
    return { pendingCount: p, approvedCount: a };
  }, [data]);

  /* ---------------- HANDLERS ---------------- */

  const handleApprove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    const res = await approveVillaReview(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Onaylanamadı", {
        id: `review-approve-${id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Yorum onaylandı", { id: `review-approve-${id}` });
    /* 🛡️ FAZ 55F — AUDIT LOG (fail-safe).
       BEFORE snapshot: list state'inden review row'unu al. */
    const reviewBefore = data.find((r) => r.id === id);
    if (reviewBefore) {
      logActivity({
        action: "review.approved",
        entity_type: "review",
        entity_id: id,
        entity_title:
          reviewBefore.villa_title
            ? `${reviewBefore.villa_title} · ${reviewBefore.guest_name}`
            : reviewBefore.guest_name,
        before_data: {
          is_approved: reviewBefore.is_approved,
          approved_at: reviewBefore.approved_at,
          rating: reviewBefore.rating,
          villa_id: reviewBefore.villa_id,
        },
        after_data: {
          is_approved: true,
          approved_at: new Date().toISOString(),
          rating: reviewBefore.rating,
          villa_id: reviewBefore.villa_id,
        },
      }).catch(() => {});
    }
    /* Optimistic update — UI hızlı yansır, sonra authoritative refresh. */
    setData((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, is_approved: true, approved_at: new Date().toISOString() }
          : r
      )
    );
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
  };

  const handleToggleFeatured = async (id: string) => {
    if (busyId) return;
    /* Snapshot eski state — toast mesajını doğru anlatmak için
       (toggle sonrası `data` artık yeni state'e güncellenecek). */
    const prevFeatured = data.find((r) => r.id === id)?.is_featured ?? false;

    setBusyId(id);
    const res = await toggleFeaturedReview(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Öne çıkarılamadı", {
        id: `review-feature-${id}`,
        description: res.error,
      });
      return;
    }
    /* Toggle başarılı — local state'i optimistic update et:
       toggled review villa_id'sini bul; aynı villa'nın diğer
       featured'larını temizle; bunu invert et. */
    setData((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target) return prev;
      const willBeFeatured = !target.is_featured;
      return prev.map((r) => {
        if (r.id === id) {
          return { ...r, is_featured: willBeFeatured };
        }
        if (willBeFeatured && r.villa_id === target.villa_id) {
          return { ...r, is_featured: false };
        }
        return r;
      });
    });
    toast.success(
      prevFeatured ? "Öne çıkarma kaldırıldı" : "Yorum öne çıkarıldı",
      { id: `review-feature-${id}` }
    );
    /* 🛡️ FAZ 55F — AUDIT LOG (fail-safe).
       Action yön bilgisi explicit: featured / unfeatured. */
    const reviewBefore = data.find((r) => r.id === id);
    if (reviewBefore) {
      logActivity({
        action: prevFeatured ? "review.unfeatured" : "review.featured",
        entity_type: "review",
        entity_id: id,
        entity_title:
          reviewBefore.villa_title
            ? `${reviewBefore.villa_title} · ${reviewBefore.guest_name}`
            : reviewBefore.guest_name,
        before_data: { is_featured: prevFeatured, villa_id: reviewBefore.villa_id },
        after_data: { is_featured: !prevFeatured, villa_id: reviewBefore.villa_id },
      }).catch(() => {});
    }
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
  };

  const handleDelete = async (id: string) => {
    if (busyId) return;
    const ok = await confirm({
      title: "Yorum silinsin mi?",
      description:
        "Bu yorum kalıcı olarak kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;

    /* 🛡️ FAZ 55F — BEFORE snapshot (audit için), DELETE öncesi al. */
    const reviewBefore = data.find((r) => r.id === id);
    setBusyId(id);
    const res = await deleteVillaReview(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `review-delete-${id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Yorum silindi", { id: `review-delete-${id}` });
    /* AUDIT LOG (fail-safe). */
    if (reviewBefore) {
      logActivity({
        action: "review.deleted",
        entity_type: "review",
        entity_id: id,
        entity_title:
          reviewBefore.villa_title
            ? `${reviewBefore.villa_title} · ${reviewBefore.guest_name}`
            : reviewBefore.guest_name,
        before_data: {
          id: reviewBefore.id,
          villa_id: reviewBefore.villa_id,
          villa_title: reviewBefore.villa_title,
          guest_name: reviewBefore.guest_name,
          rating: reviewBefore.rating,
          comment: reviewBefore.comment,
          is_approved: reviewBefore.is_approved,
          is_featured: reviewBefore.is_featured,
        },
      }).catch(() => {});
    }
    setData((prev) => prev.filter((r) => r.id !== id));
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
  };

  /* ---------------- COUNTER STRIP ----------------
     Veri data'ya bağlı — server'da yoktu, client'a taşındı. */
  const counterStrip = (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="
          inline-flex items-center gap-2.5
          rounded-2xl border border-[var(--color-stone-100)]
          bg-white
          px-4 py-2.5
          text-sm
        "
      >
        <span
          className="
            w-7 h-7 rounded-full
            bg-amber-50 border border-amber-100
            flex items-center justify-center
            text-amber-700
          "
          aria-hidden
        >
          <Star size={13} />
        </span>
        <span className="text-[var(--color-stone-500)]">Bekleyen</span>
        <span className="font-display text-[16px] text-[var(--color-stone-900)] tabular-nums">
          {pendingCount}
        </span>
      </div>
      <div
        className="
          inline-flex items-center gap-2.5
          rounded-2xl border border-[var(--color-stone-100)]
          bg-white
          px-4 py-2.5
          text-sm
        "
      >
        <span
          className="
            w-7 h-7 rounded-full
            bg-emerald-50 border border-emerald-100
            flex items-center justify-center
            text-emerald-700
          "
          aria-hidden
        >
          <Star size={13} />
        </span>
        <span className="text-[var(--color-stone-500)]">Yayında</span>
        <span className="font-display text-[16px] text-[var(--color-stone-900)] tabular-nums">
          {approvedCount}
        </span>
      </div>
    </div>
  );

  /* ---------------- LOADING SKELETON ---------------- */
  if (loading && data.length === 0) {
    return (
      <div className="space-y-5">
        {counterStrip}
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="admin-card p-4 md:p-5 animate-pulse"
            >
              <div className="h-4 w-1/3 bg-[var(--admin-bg-soft)] rounded mb-3" />
              <div className="h-3 w-2/3 bg-[var(--admin-bg-soft)] rounded mb-2" />
              <div className="h-3 w-1/2 bg-[var(--admin-bg-soft)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------- EMPTY STATE ---------------- */
  if (data.length === 0) {
    return (
      <div className="space-y-5">
        {counterStrip}
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Inbox size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz yorum yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Misafirlerden yeni yorumlar geldikçe bu sayfada listelenir.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------- LIST ---------------- */
  return (
    <div className="space-y-5">
      {counterStrip}
      <div className="flex flex-col gap-3">
        {data.map((r) => (
          <ReviewRow
            key={r.id}
            review={r}
            busy={busyId === r.id}
            onApprove={() => handleApprove(r.id)}
            onToggleFeatured={() => handleToggleFeatured(r.id)}
            onDelete={() => handleDelete(r.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ===============================================================
   ROW CARD
   ===============================================================
   Reservation list / villa stacked-list paterni ile birebir feel.
   admin-card class reuse; left content + right action toolbar.
=============================================================== */
function ReviewRow({
  review,
  busy,
  onApprove,
  onToggleFeatured,
  onDelete,
}: {
  review: VillaReviewAdmin;
  busy: boolean;
  onApprove: () => void;
  onToggleFeatured: () => void;
  onDelete: () => void;
}) {
  const statusBadge = review.is_featured ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
      <Sparkles size={10} />
      Öne çıkan
    </span>
  ) : review.is_approved ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
      />
      Yayında
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-50 text-stone-700 border border-stone-200 shrink-0">
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full bg-stone-400"
      />
      Bekliyor
    </span>
  );

  return (
    <article className="admin-card p-4 md:p-5 flex items-start gap-3 md:gap-4">
      {/* Avatar / star ring */}
      <div
        className="
          shrink-0 w-11 h-11 md:w-12 md:h-12
          rounded-full
          bg-[var(--color-sand-50)]
          border border-[var(--color-stone-100)]
          flex items-center justify-center
          text-[var(--color-champagne-700)]
        "
        aria-hidden
      >
        <Star size={16} fill="currentColor" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* HEADER ROW */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-[16px] md:text-[17px] text-[var(--admin-text)] tracking-[-0.015em] leading-tight truncate">
                {review.guest_name}
              </h3>
              {statusBadge}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-[12px] text-[var(--admin-muted-2)]">
              <span className="truncate">
                {review.villa_title || "—"}
              </span>
              <span className="text-[var(--admin-border-strong)]">·</span>
              <StarRow value={review.rating} />
              {review.created_at && (
                <>
                  <span className="text-[var(--admin-border-strong)]">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <CalendarRange size={11} aria-hidden />
                    {formatDateTr(review.created_at)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* COMMENT PREVIEW (line-clamp-3) */}
        <p
          className="
            text-[13.5px] text-[var(--admin-text)] leading-[1.65]
            whitespace-pre-line
          "
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {review.comment}
        </p>

        {/* ACTION TOOLBAR */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {!review.is_approved && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="admin-btn-primary disabled:opacity-50"
            >
              <Check size={13} />
              Onayla
            </button>
          )}

          {review.is_approved && (
            <button
              type="button"
              onClick={onToggleFeatured}
              disabled={busy}
              className={
                "admin-btn-ghost disabled:opacity-50 " +
                (review.is_featured
                  ? "!text-amber-700 !border-amber-200 hover:!bg-amber-50"
                  : "")
              }
              title={
                review.is_featured
                  ? "Öne çıkarmayı kaldır"
                  : "Bu yorumu öne çıkar (villa başına 1)"
              }
            >
              <Sparkles size={13} />
              {review.is_featured ? "Öne çıkan" : "Öne çıkar"}
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="admin-btn-ghost !text-red-600 !border-red-200 hover:!bg-red-50 disabled:opacity-50"
            aria-label="Yorum sil"
            title="Yorumu sil"
          >
            <Trash2 size={13} />
            Sil
          </button>
        </div>
      </div>
    </article>
  );
}

/* ===============================================================
   STAR ROW — read-only, kompakt
   ===============================================================
   5 yıldız üzerinden filled count. Tabular display; admin liste
   içinde inline kullanılır.
=============================================================== */
function StarRow({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={`${filled} yıldız`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          fill={i <= filled ? "currentColor" : "none"}
          className={i <= filled ? "" : "text-[var(--admin-border-strong)]"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}
