"use client";

/* ===============================================================
   🛡️ FAZ 33 — VILLA REVIEWS SECTION (public)
   ===============================================================
   Villa detay sayfasındaki guest yorum bölümü.

   PROPS:
     - villaId          → form submission target
     - reviews          → approved review listesi (cached, server-side)
     - stats            → { count, average } (cached, server-side)

   RENDER:
     1) HEADER — eyebrow + "Misafir Yorumları" + avg rating + count
     2) FEATURED CARD (varsa) — premium öne çıkan yorum
     3) REVIEW LIST — diğer yorumlar
     4) FORM — name + stars + comment + submit

   FORM:
     - Client-side validation (min 2 name / min 10 comment / 1..5 star)
     - Submit: createVillaReview server-callable service
     - Success: "Yorumunuz inceleme sonrası yayınlanacaktır." inline
     - Error: kırmızı inline message
     - Loading state submit button'da

   DESIGN:
     - rounded-2xl, soft shadow on hover
     - warm neutral palette (sand/stone/champagne)
     - elegant Star icons (lucide)
     - premium spacing
     - NO ecommerce review widget feel
   =============================================================== */

import { useMemo, useState } from "react";
import {
  Star,
  ShieldCheck,
  Quote,
  Sparkles,
  MessageSquarePlus,
  ChevronDown,
} from "lucide-react";

import {
  createVillaReview,
  type VillaReviewPublic,
  type VillaReviewStats,
} from "@/app/services/villa-review.service";
import { formatDateTr } from "@/lib/date-format";

const MIN_NAME_LEN = 2;
const MIN_COMMENT_LEN = 10;
const MAX_COMMENT_LEN = 1500;

export default function VillaReviewsSection({
  villaId,
  reviews,
  stats,
}: {
  villaId: string;
  reviews: VillaReviewPublic[];
  stats: VillaReviewStats;
}) {
  /* Featured review header'ın altında yer alır; diğerleri liste içinde. */
  const { featured, rest } = useMemo(() => {
    const featuredIdx = reviews.findIndex((r) => r.is_featured);
    if (featuredIdx === -1) {
      return { featured: null as VillaReviewPublic | null, rest: reviews };
    }
    return {
      featured: reviews[featuredIdx],
      rest: reviews.filter((_, i) => i !== featuredIdx),
    };
  }, [reviews]);

  return (
    <section className="space-y-8">
      {/* ════════════════════════════════════════════════════
          HEADER
          ════════════════════════════════════════════════════ */}
      <header>
        <p className="eyebrow mb-3 flex items-center gap-2">
          <Star size={11} /> Yorumlar
        </p>
        <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
          Misafir Yorumları
        </h2>

        {stats.count > 0 ? (
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="inline-flex items-baseline gap-2">
              <span
                className="font-display text-[32px] md:text-[40px] text-[var(--color-stone-900)] tracking-[-0.02em] tabular-nums"
              >
                {stats.average.toFixed(1)}
              </span>
              <span className="text-[var(--color-stone-500)] text-sm">/ 5</span>
            </div>
            <StarRow value={stats.average} size={16} />
            <span className="text-[13.5px] text-[var(--color-stone-500)] tabular-nums">
              {stats.count} misafir yorumu
            </span>
          </div>
        ) : (
          <p className="text-[var(--color-stone-500)] mt-4 text-sm">
            Henüz onaylanmış yorum yok. İlk yorumu siz bırakabilirsiniz.
          </p>
        )}
      </header>

      {/* ════════════════════════════════════════════════════
          FEATURED REVIEW (varsa)
          ════════════════════════════════════════════════════ */}
      {featured && (
        <article
          className="
            relative rounded-2xl
            bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
            p-6 md:p-8
            shadow-soft
          "
        >
          <span
            className="
              absolute top-4 right-4
              inline-flex items-center gap-1.5
              text-[10.5px] tracking-[0.18em] uppercase font-medium
              text-[var(--color-champagne-700)]
            "
            aria-label="Öne çıkan yorum"
          >
            <Sparkles size={11} />
            Öne çıkan
          </span>
          <Quote
            size={28}
            className="text-[var(--color-champagne-500)] opacity-50"
            aria-hidden
          />
          <p
            className="
              mt-3 text-[16px] md:text-[17px] leading-[1.75]
              text-[var(--color-stone-700)] italic
              whitespace-pre-line
            "
          >
            {featured.comment}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar name={featured.guest_name} />
              <div>
                <p className="font-display text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em]">
                  {featured.guest_name}
                </p>
                {featured.created_at && (
                  <p className="text-[11.5px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
                    {formatDateTr(featured.created_at)}
                  </p>
                )}
              </div>
            </div>
            <StarRow value={featured.rating} size={14} />
          </div>
        </article>
      )}

      {/* ════════════════════════════════════════════════════
          REVIEW LIST
          ════════════════════════════════════════════════════ */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rest.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          FORM — accordion (default kapalı)
          ════════════════════════════════════════════════════
          UX: form default kapalı; "Yorum Yap" CTA görünür.
          Tıklayınca form expand olur, tekrar tıklayınca toggle.
          Submit logic / form state / API / validation YALNIZ
          ReviewForm içinde — accordion sadece visibility layer'ı. */}
      <ReviewFormAccordion villaId={villaId} />
    </section>
  );
}

/* ===============================================================
   📝 REVIEW FORM ACCORDION — visibility wrapper
   ===============================================================
   Default kapalı: premium CTA pill ("Yorum Yap").
   Açık: aynı CTA "Formu Kapat" olur; form altında render edilir.

   Submit / state / API / validation logic DOKUNULMADI — wrapper
   yalnız mount/unmount kontrolü yapar. Form içindeki tüm state
   (name, rating, comment, status) ReviewForm component'ine
   ait — accordion remount'ta state sıfırlanır (ekstra kontrol
   gerekmez; mevcut UX kabulü).
   =============================================================== */
function ReviewFormAccordion({ villaId }: { villaId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="
          group inline-flex items-center gap-2.5
          rounded-full border border-[var(--color-stone-200)]
          bg-white px-5 py-2.5
          text-[13.5px] font-medium text-[var(--color-stone-800)]
          shadow-soft
          hover:border-[var(--color-champagne-300)]
          hover:text-[var(--color-stone-900)]
          transition-colors motion-reduce:transition-none
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--color-champagne-300)]
        "
      >
        <MessageSquarePlus
          size={14}
          className="text-[var(--color-champagne-600)]"
          aria-hidden
        />
        {isOpen ? "Formu Kapat" : "Yorum Yap"}
        <ChevronDown
          size={14}
          aria-hidden
          className={
            "text-[var(--color-stone-400)] transition-transform duration-200 motion-reduce:transition-none " +
            (isOpen ? "rotate-180" : "rotate-0")
          }
        />
      </button>
      {isOpen && <ReviewForm villaId={villaId} />}
    </div>
  );
}

/* ===============================================================
   AVATAR — guest name initials
   ===============================================================
   "İlhan Demir" → "İD". Sand/champagne ring; premium hospitality
   hissi (avatar foto YOK; veri tutulmuyor). */
function Avatar({ name }: { name: string }) {
  const initials = useMemo(() => {
    const parts = String(name || "")
      .trim()
      .split(/\s+/);
    if (parts.length === 0) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);

  return (
    <span
      className="
        w-10 h-10 rounded-full
        bg-[var(--color-sand-100)]
        border border-[var(--color-stone-100)]
        flex items-center justify-center
        font-display text-[14px] text-[var(--color-champagne-700)]
        tracking-[-0.01em]
      "
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ===============================================================
   REVIEW CARD — list item
   =============================================================== */
function ReviewCard({ review }: { review: VillaReviewPublic }) {
  return (
    <article
      className="
        rounded-2xl bg-white border border-[var(--color-stone-100)]
        p-5 md:p-6
        hover:border-[var(--color-champagne-300)]
        hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
        transition-colors motion-reduce:transition-none
        flex flex-col gap-3
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={review.guest_name} />
          <div className="min-w-0">
            <p className="font-display text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
              {review.guest_name}
            </p>
            {review.created_at && (
              <p className="text-[11.5px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
                {formatDateTr(review.created_at)}
              </p>
            )}
          </div>
        </div>
        <StarRow value={review.rating} size={13} />
      </div>

      <p
        className="
          text-[14.5px] text-[var(--color-stone-700)]
          leading-[1.7] whitespace-pre-line
        "
      >
        {review.comment}
      </p>
    </article>
  );
}

/* ===============================================================
   STAR ROW — display
   =============================================================== */
function StarRow({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={`${value.toFixed(1)} / 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= rounded ? "currentColor" : "none"}
          className={
            i <= rounded ? "" : "text-[var(--color-stone-300)]"
          }
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

/* ===============================================================
   STAR PICKER — form input
   ===============================================================
   1..5 yıldız; hover preview. ARIA: radiogroup.
=============================================================== */
function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const displayed = hover ?? value;

  return (
    <div
      role="radiogroup"
      aria-label="Puanınız"
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= displayed;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            disabled={disabled}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            className={
              "p-1 rounded-md transition-colors motion-reduce:transition-none " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-300)] " +
              "disabled:opacity-50 disabled:cursor-not-allowed " +
              (filled ? "text-amber-500" : "text-[var(--color-stone-300)]")
            }
            aria-label={`${i} yıldız`}
          >
            <Star size={22} fill={filled ? "currentColor" : "none"} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/* ===============================================================
   REVIEW FORM
   ===============================================================
   Inline status feedback (toast yok — public toast provider yok).
   Submit success sonrası form resetlenir.
=============================================================== */
type FormStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function ReviewForm({ villaId }: { villaId: string }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const trimmedName = name.trim();
  const trimmedComment = comment.trim();

  const isLoading = status.kind === "loading";
  const isReady =
    trimmedName.length >= MIN_NAME_LEN &&
    trimmedComment.length >= MIN_COMMENT_LEN &&
    rating >= 1 &&
    rating <= 5 &&
    !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setStatus({ kind: "loading" });
    const res = await createVillaReview({
      villa_id: villaId,
      guest_name: trimmedName,
      rating,
      comment: trimmedComment,
    });

    if (!res.ok) {
      setStatus({ kind: "error", message: res.error });
      return;
    }

    setStatus({ kind: "success" });
    /* Form reset — başarılı kayıt sonrası. */
    setName("");
    setComment("");
    setRating(5);
  };

  return (
    <div
      className="
        rounded-2xl bg-white border border-[var(--color-stone-100)]
        p-6 md:p-8 shadow-soft
      "
    >
      <div className="flex items-start gap-3 mb-5">
        <span
          className="
            w-10 h-10 rounded-full
            bg-[var(--color-sand-100)] border border-[var(--color-stone-100)]
            flex items-center justify-center
            text-[var(--color-champagne-700)]
          "
          aria-hidden
        >
          <Quote size={16} />
        </span>
        <div>
          <h3 className="font-display text-[18px] md:text-[20px] text-[var(--color-stone-900)] tracking-[-0.015em]">
            Yorumunuzu paylaşın
          </h3>
          <p className="text-[12.5px] text-[var(--color-stone-500)] mt-1">
            Yorumunuz admin onayı sonrası bu sayfada yayınlanır.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* NAME */}
        <div>
          <label
            htmlFor="review-name"
            className="block text-[12px] tracking-[0.04em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5"
          >
            Adınız
          </label>
          <input
            id="review-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            maxLength={80}
            placeholder="Örn. İlhan D."
            className="
              w-full
              rounded-xl border border-[var(--color-stone-200)]
              bg-white
              px-4 py-2.5 text-[14.5px] text-[var(--color-stone-900)]
              placeholder:text-[var(--color-stone-400)]
              focus:outline-none focus:border-[var(--color-champagne-400)]
              focus:ring-2 focus:ring-[var(--color-champagne-200)]
              transition-colors motion-reduce:transition-none
              disabled:opacity-60
            "
          />
        </div>

        {/* RATING */}
        <div>
          <p className="block text-[12px] tracking-[0.04em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5">
            Puanınız
          </p>
          <StarPicker
            value={rating}
            onChange={setRating}
            disabled={isLoading}
          />
        </div>

        {/* COMMENT */}
        <div>
          <label
            htmlFor="review-comment"
            className="block text-[12px] tracking-[0.04em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5"
          >
            Yorumunuz
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isLoading}
            rows={5}
            maxLength={MAX_COMMENT_LEN}
            placeholder="Konaklama deneyiminiz nasıldı?"
            className="
              w-full
              rounded-xl border border-[var(--color-stone-200)]
              bg-white
              px-4 py-3 text-[14.5px] text-[var(--color-stone-700)]
              placeholder:text-[var(--color-stone-400)]
              leading-[1.7]
              focus:outline-none focus:border-[var(--color-champagne-400)]
              focus:ring-2 focus:ring-[var(--color-champagne-200)]
              transition-colors motion-reduce:transition-none
              disabled:opacity-60
              resize-y min-h-[120px]
            "
          />
          <div className="flex justify-between items-center mt-1.5 text-[11px] text-[var(--color-stone-400)] tabular-nums">
            <span>En az 10 karakter</span>
            <span>
              {trimmedComment.length} / {MAX_COMMENT_LEN}
            </span>
          </div>
        </div>

        {/* STATUS */}
        {status.kind === "success" && (
          <div
            role="status"
            className="
              flex items-center gap-2.5
              rounded-xl border border-emerald-200 bg-emerald-50
              px-4 py-3 text-[13.5px] text-emerald-800
            "
          >
            <ShieldCheck size={15} aria-hidden />
            <span>
              Yorumunuz inceleme sonrası yayınlanacaktır. Teşekkürler.
            </span>
          </div>
        )}
        {status.kind === "error" && (
          <div
            role="alert"
            className="
              rounded-xl border border-red-200 bg-red-50
              px-4 py-3 text-[13.5px] text-red-800
            "
          >
            {status.message}
          </div>
        )}

        {/* SUBMIT */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isReady}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Gönderiliyor…" : "Yorumumu gönder"}
          </button>
        </div>
      </form>
    </div>
  );
}
