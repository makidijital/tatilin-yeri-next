"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Eye, ImagePlus } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateMenu } from "@/app/services/revalidate.actions";
import { logActivity } from "@/lib/activity-log.client";
/* 🛡️ Kapak görseli — new sayfasıyla AYNI upload akışı (storageProvider
   + deterministik path); edit ekranında mevcut kapağı göster + yönet. */
import { storageProvider } from "@/lib/storage";
import {
  getPageCoverPublicUrl,
  buildPageCoverPath,
  SITE_ASSETS_BUCKET_NAME,
} from "@/lib/storage.helpers";
import { convertImageToWebP } from "@/lib/image.helpers";

/* ===============================================================
   🛡️ ADMIN > SAYFA DÜZENLE — minimal-risk CMS edit
   ===============================================================
   AMAÇ:
     Yeni sayfa oluşturma akışı (`/maki-admin/pages/new`) zaten
     mevcut; bu route sadece DÜZENLE + Yayında/Pasif toggle eksik
     olduğu için eklendi.

   KAPSAM (bilinçli olarak DAR):
     - title, slug, excerpt, body (textarea)
     - seo_title, seo_description, noindex
     - is_active (yayında / taslak)
     - show_in_menu (üst menü görünürlüğü)

   KAPSAM DIŞI (DB'de PRESERVE EDİLİR, dokunulmaz):
     - sections (JSONB) → yeni sayfa akışındaki section engine
       burada YENİDEN render edilmez; mevcut veri korunur.
     - cover_image → yine korunur; yeni sayfa akışı tarafında
       yönetilir.
     - menu_parent_id, menu_order → menü ekranı yönetir.

   GÜVENLİK:
     adminFetch Bearer → authorizeAdminCaller; service-role write.
     PATCH route allowlist üzerinden çalışır; unknown alanlar
     reddedilir.

   PERFORMANS:
     Tek GET (mount), tek PATCH (save). Public /p/[slug] dynamic
     server render olduğu için cache invalidation gerektirmez
     (next request DB'den taze okur). revalidateMenu sadece
     header menüsü için.
=============================================================== */

type PageRow = {
  id: string;
  title: string;
  slug: string;
  body: string | null;
  content: string | null;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean | null;
  is_active: boolean | null;
  show_in_menu: boolean | null;
  cover_image: string | null;
};

export default function EditPagePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useNotify();

  const id = params?.id || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [showInMenu, setShowInMenu] = useState(false);

  /* Kapak görseli — mevcut sayfadan hydrate edilir; new ile aynı state. */
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  /* Original slug — sadece "URL değişecek" uyarısı için. */
  const [originalSlug, setOriginalSlug] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch(
          `/api/admin/pages/${encodeURIComponent(id)}`
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: PageRow;
          error?: string;
        };
        if (cancelled) return;
        if (res.status === 404 || !json.ok || !json.data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const p = json.data;
        setTitle(p.title || "");
        setSlug(p.slug || "");
        setOriginalSlug(p.slug || "");
        /* body / content drift: yeni sayfa formu ikisini de mirror
           olarak yazıyor; eski satırlarda biri dolu biri null olabilir. */
        setBody((p.body ?? p.content ?? "") || "");
        setExcerpt(p.excerpt || "");
        setSeoTitle(p.seo_title || "");
        setSeoDescription(p.seo_description || "");
        setNoindex(!!p.noindex);
        setIsActive(p.is_active !== false);
        setShowInMenu(!!p.show_in_menu);
        setCoverPath(p.cover_image ?? null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        toast.error("Sayfa yüklenemedi", {
          id: `page-load-${id}`,
          description: msg,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    /* 🛡️ DEP ARRAY: yalnız `id`.
       `toast = useNotify()` her render'da YENİ object literal döner
       (NotificationProvider.tsx:542-547 — `return { success, error,
       ... }`). Eğer `toast`'u dep'e koyarsak: kullanıcı her tuş
       basışında / yapıştırmada state değişir → re-render → toast
       yeni ref → effect re-fires → adminFetch yeniden çağrılır →
       fetch dönünce `setBody(originalContent)` kullanıcının paste/
       typed içeriğini EZER. Bu "yapıştırınca kabul etmiyor"
       semptomudur.
       toast.error referansı kapanışta stale olsa da underlying
       fonksiyon (provider'ın useCallback'i) AYNI; çağrı doğru
       toast'ı tetikler. Bu pattern proje genelinde kabul gören
       anti-pattern'den korunmadır.
       eslint-disable: react-hooks exhaustive-deps bu durumu
       intent'imiz olarak işaretler. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ----- COVER UPLOAD — new sayfasıyla BİREBİR AYNI akış ----- */
  async function handleCoverUpload(file: File) {
    const s = slug.trim();
    if (!s) {
      toast.error("Önce slug girin", { id: "page-cover" });
      return;
    }
    setCoverUploading(true);
    try {
      const webp = await convertImageToWebP(file);
      const path = buildPageCoverPath(s, "webp");
      if (!path) return;
      const upRes = await storageProvider.upload(
        SITE_ASSETS_BUCKET_NAME,
        path,
        webp,
        {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        }
      );
      if (!upRes.ok) {
        toast.error("Görsel yüklenemedi", {
          id: "page-cover",
          description: upRes.error,
        });
        return;
      }
      setCoverPath(path);
      toast.success("Kapak yüklendi", { id: "page-cover" });
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Başlık ve slug zorunlu", { id: `page-save-${id}` });
      return;
    }
    setSaving(true);
    const trimmedBody = body.trim();
    /* body + content mirror — yeni sayfa akışıyla parity. */
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      body: trimmedBody.length > 0 ? trimmedBody : null,
      content: trimmedBody.length > 0 ? trimmedBody : null,
      excerpt: excerpt.trim().length > 0 ? excerpt.trim() : null,
      seo_title: seoTitle.trim().length > 0 ? seoTitle.trim() : null,
      seo_description:
        seoDescription.trim().length > 0 ? seoDescription.trim() : null,
      noindex: !!noindex,
      is_active: !!isActive,
      show_in_menu: !!showInMenu,
      /* Kapak: yüklendi → relative path; kaldırıldı → null. Route
         allowlist'inde (cover_image) → DB'ye yazılır. */
      cover_image: coverPath ?? null,
    };
    try {
      const res = await adminFetch(
        `/api/admin/pages/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Kaydedilemedi", {
          id: `page-save-${id}`,
          description: json.error || `HTTP ${res.status}`,
        });
        return;
      }

      toast.success("Sayfa güncellendi", { id: `page-save-${id}` });

      /* 🛡️ Audit log (fail-safe). */
      logActivity({
        action: "page.updated",
        entity_type: "page",
        entity_id: id,
        entity_title: payload.title,
        after_data: {
          id,
          title: payload.title,
          slug: payload.slug,
          is_active: payload.is_active,
          noindex: payload.noindex,
          show_in_menu: payload.show_in_menu,
          seo_title: payload.seo_title,
          seo_description: payload.seo_description,
          body_length:
            typeof payload.body === "string" ? payload.body.length : 0,
        },
      }).catch(() => {});

      /* Header menüsü is_active/show_in_menu/title/slug değişiminde
         güncellenmeli. /p/[slug] dynamic render olduğu için route
         cache invalidation gerekmez. */
      revalidateMenu().catch(() => {});
      router.push("/maki-admin/pages");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network hatası";
      toast.error("Kaydedilemedi", {
        id: `page-save-${id}`,
        description: msg,
      });
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Link
          href="/maki-admin/pages"
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)]"
        >
          <ArrowLeft size={13} /> Sayfa listesine dön
        </Link>
        <div className="card-premium p-10 text-center">
          <h1 className="font-display text-2xl text-[var(--color-stone-900)]">
            Sayfa bulunamadı
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Bu sayfa silinmiş ya da geçersiz bir bağlantı kullanılmış olabilir.
          </p>
        </div>
      </div>
    );
  }

  const slugChanged = slug.trim() !== originalSlug && originalSlug.length > 0;
  const coverUrl = getPageCoverPublicUrl(coverPath);

  return (
    <div className="space-y-6 max-w-3xl w-full">
      <Link
        href="/maki-admin/pages"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)]"
      >
        <ArrowLeft size={13} /> Sayfa listesine dön
      </Link>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="eyebrow">İçerik</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Sayfayı düzenle
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Başlık, içerik, SEO ve yayın durumu.
          </p>
        </div>
        {!loading && originalSlug && isActive && (
          <Link
            href={`/p/${originalSlug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition self-start"
          >
            <Eye size={13} /> Sayfayı görüntüle
          </Link>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        aria-busy={loading || saving}
      >
        {/* BASIC */}
        <div className="card-premium p-6 md:p-7 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Başlık
            </label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              placeholder="Örn: Hakkımızda"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Slug
            </label>
            <input
              className="input font-mono text-sm"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-[var(--color-stone-400)]">
              URL: <span className="font-mono">/p/{slug || "slug"}</span>
            </p>
            {slugChanged && (
              <p className="text-xs text-amber-600">
                Slug değişti — eski URL (/p/{originalSlug}) artık çalışmayacak.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Kısa açıklama (excerpt)
            </label>
            <textarea
              className="input !rounded-2xl !p-4 h-24 resize-none leading-relaxed"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              disabled={loading}
              placeholder="Hero altında küçük açıklama metni…"
            />
          </div>
        </div>

        {/* BODY */}
        <div className="card-premium p-6 md:p-7 space-y-1.5">
          <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
            İçerik (sade — paragraph'lar boş satırla ayrılır)
          </label>
          <textarea
            className="input !rounded-2xl !p-4 h-64 resize-none leading-relaxed"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={loading}
            placeholder="Sayfa metni…"
          />
          <p className="text-xs text-[var(--color-stone-400)]">
            Bu sayfaya daha önce bölüm (section) eklenmişse içerik korunur ve
            herkese görünür kalır; buradan yalnız ana metin alanı düzenlenir.
          </p>
        </div>

        {/* COVER — new sayfasıyla AYNI bileşen/akış; edit'te mevcut kapak
            önizlemesi + değiştir + kaldır. */}
        <div className="card-premium p-6 md:p-7">
          <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block mb-3">
            Kapak görseli (opsiyonel)
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading || !slug.trim()}
              className="relative w-32 h-20 rounded-2xl overflow-hidden bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              title={!slug.trim() ? "Önce slug girin" : "Görsel yükle/değiştir"}
            >
              {coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={coverUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-400)]">
                  <ImagePlus size={18} />
                </span>
              )}
              {coverUploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-medium text-[var(--color-stone-700)]">
                  Yükleniyor…
                </span>
              )}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCoverUpload(f);
              }}
            />
            {coverPath && (
              <button
                type="button"
                onClick={() => setCoverPath(null)}
                className="text-[13px] text-red-600 hover:text-red-700"
              >
                Kapağı kaldır
              </button>
            )}
            <p className="text-xs text-[var(--color-stone-400)] ml-auto max-w-xs">
              Otomatik WebP, max 1920px. Aynı slug için overwrite.
            </p>
          </div>
        </div>

        {/* SEO */}
        <div className="card-premium p-6 md:p-7 space-y-5">
          <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
            SEO
          </p>
          <div className="space-y-1.5">
            <label className="text-[12px] text-[var(--color-stone-500)] block">
              SEO Title (boş → sayfa başlığı)
            </label>
            <input
              className="input text-sm"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-[var(--color-stone-500)] block">
              SEO Description
            </label>
            <textarea
              className="input !rounded-2xl !p-4 h-20 resize-none leading-relaxed text-sm"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              disabled={loading}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-stone-700)]">
            <input
              type="checkbox"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
              disabled={loading}
            />
            <span>noindex (arama motorlarına gösterme)</span>
          </label>
        </div>

        {/* YAYIN DURUMU */}
        <div className="card-premium p-6 md:p-7 space-y-4">
          <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
            Yayın
          </p>

          <label className="flex items-start gap-3 text-sm text-[var(--color-stone-700)]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={loading}
              className="mt-1"
            />
            <span>
              <strong className="font-medium">Yayında</strong>
              <br />
              <span className="text-[12px] text-[var(--color-stone-500)]">
                Kapatılırsa /p/{slug || "slug"} 404 döner; SEO indexinden
                düşer. İçerik silinmez.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-[var(--color-stone-700)]">
            <input
              type="checkbox"
              checked={showInMenu}
              onChange={(e) => setShowInMenu(e.target.checked)}
              disabled={loading}
              className="mt-1"
            />
            <span>
              <strong className="font-medium">Üst menüde göster</strong>
              <br />
              <span className="text-[12px] text-[var(--color-stone-500)]">
                Header menüsünde görünür. Kapalıyken sayfa /p/{slug || "slug"}
                {" "}üzerinden direkt erişilebilir.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || loading}
            className="btn-primary"
          >
            <Save size={15} />
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
