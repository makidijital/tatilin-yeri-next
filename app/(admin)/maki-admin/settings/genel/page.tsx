"use client";

import { useEffect, useState } from "react";

import {
  getSettings,
  updateSettings,
} from "@/app/services/settings.service";
import type { WatermarkPosition } from "@/app/services/settings.types";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateSettings } from "@/app/services/revalidate.actions";
/* 🔗 CTA placeholder default'ları Hero fallback'i ile TEK source-of-truth. */
import { HERO_CTA_DEFAULTS } from "@/lib/hero.helpers";

import {
  SettingsSection,
  TextField,
  TextAreaField,
  NumberField,
  ToggleField,
  UploadField,
  SaveButton,
  FieldShell,
} from "../_components/SettingsField";

/* ===============================================================
   🛡️ /settings/genel — full marka + branding (migration zero)
   ===============================================================
   Legacy 1497-satır page'ten taşınan field'lar:
     - Marka: site_name
     - Logo: site_logo (upload)
     - Watermark: watermark_logo (upload) + enabled + opacity +
       position + size
     - Anasayfa Hero: enabled + title + subtitle + background +
       overlay_opacity + primary/secondary CTA + badge_text

   Tek getSettings fetch → state'e dağıt → tek form, dört
   SettingsSection. Save: tek updateSettings call ile tüm field'lar
   atomik update. Cache: revalidateSettings.

   Upload field'ları FULL public URL yazıyor (legacy contract;
   resolveHeroContent / footer / watermark overlay direkt URL
   bekliyor). storage path: `site-assets/{folder}/{slug}.webp`.
   =============================================================== */

const WATERMARK_POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "center", label: "Merkez" },
  { value: "top-left", label: "Sol Üst" },
  { value: "top-right", label: "Sağ Üst" },
  { value: "bottom-left", label: "Sol Alt" },
  { value: "bottom-right", label: "Sağ Alt" },
];

export default function SettingsGeneralPage() {
  const toast = useNotify();

  // Marka
  const [siteName, setSiteName] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [footerCopyright, setFooterCopyright] = useState("");
  const [browserThemeColor, setBrowserThemeColor] = useState("");

  // Logo + Favicon
  const [siteLogo, setSiteLogo] = useState<string | null>(null);
  /* 🛡️ mig 048 — footer'a özel logo (koyu zemin). */
  const [footerLogo, setFooterLogo] = useState<string | null>(null);
  const [favicon, setFavicon] = useState<string | null>(null);
  /* 🛡️ Cache-bust — singleton asset preview'ları (logo/footer/favicon/
     watermark) için ?v= anahtarı; settings.updated_at her save'de ilerler. */
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Watermark
  const [wmEnabled, setWmEnabled] = useState(false);
  const [wmLogo, setWmLogo] = useState<string | null>(null);
  const [wmOpacity, setWmOpacity] = useState<number | "">(0.15);
  const [wmPosition, setWmPosition] = useState<WatermarkPosition>("center");
  const [wmSize, setWmSize] = useState<number | "">(25);

  // Hero
  const [heroEnabled, setHeroEnabled] = useState(true);
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [heroBg, setHeroBg] = useState<string | null>(null);
  const [heroOverlay, setHeroOverlay] = useState<number | "">(1);
  /* 🔗 Initial value = Hero fallback default'u (DB yüklenene kadar VE
     settings row hiç yoksa input default gösterir). HERO_CTA_DEFAULTS
     tek source-of-truth. */
  const [heroPrimaryText, setHeroPrimaryText] = useState<string>(
    HERO_CTA_DEFAULTS.primary.text
  );
  const [heroPrimaryHref, setHeroPrimaryHref] = useState<string>(
    HERO_CTA_DEFAULTS.primary.href
  );
  const [heroSecondaryText, setHeroSecondaryText] = useState<string>(
    HERO_CTA_DEFAULTS.secondary.text
  );
  const [heroSecondaryHref, setHeroSecondaryHref] = useState<string>(
    HERO_CTA_DEFAULTS.secondary.href
  );
  const [heroBadge, setHeroBadge] = useState("");

  // PageHero (iç sayfa) arka planı — mig 067
  const [pageHeroBg, setPageHeroBg] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled || !s) {
        setLoading(false);
        return;
      }
      setSiteName(s.site_name || "");
      setCompanyLegalName(s.company_legal_name || "");
      setFooterCopyright(s.footer_copyright || "");
      setBrowserThemeColor(s.browser_theme_color || "");
      setSiteLogo(s.site_logo || null);
      setFooterLogo(s.footer_logo || null);
      setFavicon(s.favicon_url || null);
      setUpdatedAt(s.updated_at || null);
      setWmEnabled(!!s.watermark_enabled);
      setWmLogo(s.watermark_logo || null);
      setWmOpacity(typeof s.watermark_opacity === "number" ? s.watermark_opacity : 0.15);
      setWmPosition((s.watermark_position as WatermarkPosition) || "center");
      setWmSize(typeof s.watermark_size === "number" ? s.watermark_size : 25);
      setHeroEnabled(s.hero_enabled !== false);
      setHeroTitle(s.hero_title || "");
      setHeroSubtitle(s.hero_subtitle || "");
      setHeroBg(s.hero_background_image || null);
      setHeroOverlay(typeof s.hero_overlay_opacity === "number" ? s.hero_overlay_opacity : 1);
      /* 🔗 DB null/boş → Hero fallback'i ile aynı default değer input'a
         yüklenir (placeholder değil, gerçek value). Tek source-of-truth:
         HERO_CTA_DEFAULTS (lib/hero.helpers.ts). */
      setHeroPrimaryText(s.hero_primary_cta_text || HERO_CTA_DEFAULTS.primary.text);
      setHeroPrimaryHref(s.hero_primary_cta_href || HERO_CTA_DEFAULTS.primary.href);
      setHeroSecondaryText(s.hero_secondary_cta_text || HERO_CTA_DEFAULTS.secondary.text);
      setHeroSecondaryHref(s.hero_secondary_cta_href || HERO_CTA_DEFAULTS.secondary.href);
      setHeroBadge(s.hero_badge_text || "");
      setPageHeroBg(s.page_hero_background_image || null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const ok = await updateSettings({
      site_name: siteName.trim() || null,
      company_legal_name: companyLegalName.trim() || null,
      footer_copyright: footerCopyright.trim() || null,
      browser_theme_color: browserThemeColor.trim() || null,
      site_logo: siteLogo,
      footer_logo: footerLogo,
      favicon_url: favicon,
      watermark_enabled: !!wmEnabled,
      watermark_logo: wmLogo,
      watermark_opacity:
        wmOpacity === "" ? null : Number(wmOpacity),
      watermark_position: wmPosition,
      watermark_size: wmSize === "" ? null : Number(wmSize),
      hero_enabled: !!heroEnabled,
      hero_title: heroTitle.trim() || null,
      hero_subtitle: heroSubtitle.trim() || null,
      hero_background_image: heroBg,
      hero_overlay_opacity:
        heroOverlay === "" ? null : Number(heroOverlay),
      hero_primary_cta_text: heroPrimaryText.trim() || null,
      hero_primary_cta_href: heroPrimaryHref.trim() || null,
      hero_secondary_cta_text: heroSecondaryText.trim() || null,
      hero_secondary_cta_href: heroSecondaryHref.trim() || null,
      hero_badge_text: heroBadge.trim() || null,
      page_hero_background_image: pageHeroBg,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-genel" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-genel" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Genel
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Site adı, logo, watermark ve anasayfa hero içerik yönetimi.
          Tek "Kaydet" tüm bölümleri atomik günceller.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
        {/* MARKA */}
        <SettingsSection
          title="Marka"
          description="Header, footer ve SEO başlıklarında kullanılan kurumsal ad."
        >
          <TextField
            label="Site adı"
            value={siteName}
            onChange={setSiteName}
            placeholder="Akdeniz Collection"
            disabled={loading}
          />
          <TextField
            label="Şirket yasal adı (legal name)"
            value={companyLegalName}
            onChange={setCompanyLegalName}
            placeholder="MAKİ DİJİTAL HİZ. LTD. ŞTİ."
            disabled={loading}
            hint="Organization structured data > legalName alanında ve faturalarda kullanılır."
          />
          <TextField
            label="Footer telif metni"
            value={footerCopyright}
            onChange={setFooterCopyright}
            placeholder="© {year} {site_name}. Tüm hakları saklıdır."
            disabled={loading}
            hint="Footer alt satırı. Boş ise hardcoded fallback kullanılır."
          />
          <TextField
            label="Browser theme color"
            value={browserThemeColor}
            onChange={setBrowserThemeColor}
            placeholder="#1B1A17"
            disabled={loading}
            hint='Mobil tarayıcı status bar rengi (meta name="theme-color").'
          />
        </SettingsSection>

        {/* LOGO + FAVICON */}
        <SettingsSection
          title="Logo & Favicon"
          description="Marka logosu (header) + favicon (browser tab + PWA icon). WebP otomatik, max 1920px."
        >
          <UploadField
            label="Site logosu"
            currentUrl={siteLogo}
            onChange={setSiteLogo}
            folder="logo"
            slug="logo"
            version={updatedAt}
            disabled={loading}
            hint="Header marka logosu. site-assets/logo/logo.webp"
          />
          {/* 🛡️ mig 048 — Footer logosu. Mevcut logo upload mimarisi
             aynen (folder="logo", slug="footer-logo" → site-assets/
             logo/footer-logo.webp). Boş bırakılırsa footer site
             logosuna fallback eder. */}
          <UploadField
            label="Footer logosu"
            currentUrl={footerLogo}
            onChange={setFooterLogo}
            folder="logo"
            slug="footer-logo"
            version={updatedAt}
            disabled={loading}
            hint="Koyu footer zemini için beyaz/negatif logo (opsiyonel). Boşsa site logosu kullanılır. site-assets/logo/footer-logo.webp"
          />
          <UploadField
            label="Favicon"
            currentUrl={favicon}
            onChange={setFavicon}
            folder="favicon"
            slug="favicon"
            version={updatedAt}
            disabled={loading}
            hint="Browser tab ikonu. site-assets/favicon/favicon.webp"
          />
        </SettingsSection>

        {/* WATERMARK */}
        <SettingsSection
          title="Watermark"
          description="Villa galerilerinde görsel üstüne uygulanan filigran."
        >
          <ToggleField
            label="Watermark aktif"
            description="Kapalıyken hiçbir görsele filigran uygulanmaz."
            checked={wmEnabled}
            onChange={setWmEnabled}
            disabled={loading}
          />
          <UploadField
            label="Watermark görseli"
            currentUrl={wmLogo}
            onChange={setWmLogo}
            folder="watermark"
            slug="watermark"
            version={updatedAt}
            disabled={loading || !wmEnabled}
            hint="PNG/SVG (alpha) önerilir; WebP'e çevrilir. site-assets/watermark/watermark.webp"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <NumberField
              label="Opaklık (0–1)"
              value={wmOpacity}
              onChange={setWmOpacity}
              min={0.05}
              max={1}
              step={0.05}
              disabled={loading || !wmEnabled}
              hint="0.15 = subtle, 0.4 = baskın."
            />
            <FieldShell
              label="Konum"
              hint="Filigranın görsel üstündeki yerleşimi."
            >
              <select
                value={wmPosition}
                onChange={(e) =>
                  setWmPosition(e.target.value as WatermarkPosition)
                }
                disabled={loading || !wmEnabled}
                className="input"
              >
                {WATERMARK_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FieldShell>
            <NumberField
              label="Boyut (%)"
              value={wmSize}
              onChange={setWmSize}
              min={10}
              max={50}
              step={1}
              disabled={loading || !wmEnabled}
              hint="Görselin yüzde kaçını kaplar (10–50)."
            />
          </div>
        </SettingsSection>

        {/* ANASAYFA HERO */}
        <SettingsSection
          title="Anasayfa Hero"
          description="Anasayfanın üst bölümündeki hero içeriği — başlık, alt başlık, arka plan ve CTA."
        >
          <ToggleField
            label="Hero özelleştirme aktif"
            description="Kapalıyken hardcoded varsayılan içerik kullanılır (safety reset)."
            checked={heroEnabled}
            onChange={setHeroEnabled}
            disabled={loading}
          />
          <UploadField
            label="Arka plan görseli"
            currentUrl={heroBg}
            onChange={setHeroBg}
            folder="hero"
            slug="homepage-hero"
            disabled={loading || !heroEnabled}
            hint="site-assets/hero/homepage-hero.webp"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <TextField
              label="Hero başlığı"
              value={heroTitle}
              onChange={setHeroTitle}
              placeholder="Sessizce olağanüstü."
              disabled={loading || !heroEnabled}
            />
            <TextField
              label="Hero rozet metni"
              value={heroBadge}
              onChange={setHeroBadge}
              placeholder="Akdeniz Koleksiyonu"
              disabled={loading || !heroEnabled}
            />
          </div>
          <TextAreaField
            label="Hero alt başlık"
            value={heroSubtitle}
            onChange={setHeroSubtitle}
            placeholder="Akdeniz'in seçkin villalarında özel havuz, deniz manzarası…"
            disabled={loading || !heroEnabled}
            rows={3}
          />
          <NumberField
            label="Overlay opaklığı (0–1)"
            value={heroOverlay}
            onChange={setHeroOverlay}
            min={0}
            max={1}
            step={0.05}
            disabled={loading || !heroEnabled}
            hint="Hero arka planı üstündeki koyu katman; 0 = yok, 1 = mevcut full."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <TextField
              label="Primary CTA metni"
              value={heroPrimaryText}
              onChange={setHeroPrimaryText}
              placeholder={HERO_CTA_DEFAULTS.primary.text}
              disabled={loading || !heroEnabled}
            />
            <TextField
              label="Primary CTA linki"
              value={heroPrimaryHref}
              onChange={setHeroPrimaryHref}
              placeholder={HERO_CTA_DEFAULTS.primary.href}
              disabled={loading || !heroEnabled}
            />
            <TextField
              label="Secondary CTA metni"
              value={heroSecondaryText}
              onChange={setHeroSecondaryText}
              placeholder={HERO_CTA_DEFAULTS.secondary.text}
              disabled={loading || !heroEnabled}
            />
            <TextField
              label="Secondary CTA linki"
              value={heroSecondaryHref}
              onChange={setHeroSecondaryHref}
              placeholder={HERO_CTA_DEFAULTS.secondary.href}
              disabled={loading || !heroEnabled}
            />
          </div>
        </SettingsSection>

        {/* İÇ SAYFA — PageHero arka planı (mig 067) */}
        <SettingsSection
          title="İç Sayfa Başlık Arka Planı (PageHero)"
          description="Tüm iç sayfaların üst başlık bandında (PageHero) kullanılan tek ortak arka plan görseli. Güçlü beyaz/sand overlay, hafif blur ve gradient altında doku olarak gösterilir; başlık okunabilirliği her zaman korunur."
        >
          <UploadField
            label="PageHero arka plan görseli"
            currentUrl={pageHeroBg}
            onChange={setPageHeroBg}
            folder="hero"
            slug="page-hero"
            version={updatedAt}
            disabled={loading}
            hint="Bu görsel tüm iç sayfalarda kullanılan PageHero arka planıdır."
          />
          <p className="-mt-3 text-[11.5px] text-[var(--color-stone-400)]">
            Önerilen boyut: 1920 × 640 px
          </p>
        </SettingsSection>

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} saved={saved} />
        </div>
      </form>
    </div>
  );
}
