"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import SitePopupCard from "@/app/components/layout/site-popup/SitePopupCard";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import {
  POPUP_DISMISS_DURATIONS,
  POPUP_DISMISS_LABELS,
  POPUP_IMAGE_FOLDER,
  POPUP_IMAGE_SLUG,
  POPUP_LIMITS,
  isSafePopupUrl,
  type PopupDismissDuration,
  type PopupDisplayScope,
} from "@/lib/site-popup";

import {
  FieldShell,
  SaveButton,
  SettingsSection,
  TextAreaField,
  TextField,
  ToggleField,
  UploadField,
} from "../_components/SettingsField";
import { loadSitePopupAction, saveSitePopupAction } from "./popup.action";

/* ===============================================================
   🛡️ /maki-admin/settings/popup — Açılış / Kampanya Popup yönetimi
   ===============================================================
   • Veri: `site_popup` (migration 095) — server action'lar
     (`requirePermission("settings")`). Mevcut /api/admin/settings
     akışına ve settings tablosuna DOKUNMAZ.
   • Görsel: mevcut settings `UploadField` (WebP dönüşümü → mevcut
     storage route → R2, site-assets/popup/popup.webp).
   • Canlı önizleme: public popup'ın AYNI bileşeni (SitePopupCard).
   =============================================================== */

type ScopeOption = { value: PopupDisplayScope; label: string; hint: string };
const SCOPES: ScopeOption[] = [
  { value: "home", label: "Yalnız ana sayfa", hint: "TR/EN/DE ana sayfalarında açılır." },
  { value: "all", label: "Tüm site", hint: "Ziyaretçinin girdiği ilk public sayfada açılır." },
];

export default function SettingsPopupPage() {
  const toast = useNotify();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEnabled, setIsEnabled] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageBust, setImageBust] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [highlight, setHighlight] = useState("");
  const [stats, setStats] = useState<string[]>([]);
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [showButton, setShowButton] = useState(true);
  const [scope, setScope] = useState<PopupDisplayScope>("home");
  const [dismiss, setDismiss] = useState<PopupDismissDuration>("session");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSitePopupAction()
      .then((v) => {
        if (cancelled) return;
        if (!v) {
          setLoadError(
            "Popup ayarları okunamadı. Migration 095 (site_popup) uygulanmış mı?"
          );
          return;
        }
        setIsEnabled(v.isEnabled);
        setImagePath(v.imagePath);
        setTitle(v.title);
        setDescription(v.description);
        setHighlight(v.highlight);
        setStats(v.stats);
        setButtonText(v.buttonText);
        setButtonUrl(v.buttonUrl);
        setShowButton(v.showButton);
        setScope(v.scope);
        setDismiss(v.dismiss);
        setStartDate(v.startDate);
        setEndDate(v.endDate);
        setUpdatedAt(v.updatedAt);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Bu bölüm için 'Ayarlar' yetkisi gerekiyor.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const urlInvalid = buttonUrl.trim().length > 0 && !isSafePopupUrl(buttonUrl.trim());

  const previewImage = useMemo(
    () => resolveAssetUrlVersioned(imagePath, imageBust || updatedAt),
    [imagePath, imageBust, updatedAt]
  );
  const cleanStats = stats.map((s) => s.trim()).filter(Boolean);
  const previewButton =
    showButton && buttonText.trim()
      ? { text: buttonText.trim(), url: buttonUrl.trim() || "/", external: false }
      : null;
  const hasPreviewContent = !!(
    previewImage ||
    title.trim() ||
    description.trim() ||
    highlight.trim() ||
    cleanStats.length ||
    previewButton
  );

  function updateStat(i: number, value: string) {
    setStats((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (urlInvalid) {
      toast.error("Buton URL'i geçersiz", { id: "settings-popup" });
      return;
    }
    setSaving(true);
    setSaved(false);
    let res: Awaited<ReturnType<typeof saveSitePopupAction>>;
    try {
      res = await saveSitePopupAction({
        isEnabled,
        imagePath,
        title,
        description,
        highlight,
        stats: cleanStats,
        buttonText,
        buttonUrl,
        showButton,
        scope,
        dismiss,
        startDate,
        endDate,
      });
    } catch {
      res = { ok: false, error: "Kaydedilemedi" };
    }
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || "Kaydedilemedi", { id: "settings-popup" });
      return;
    }
    setUpdatedAt(res.values.updatedAt);
    setImagePath(res.values.imagePath);
    setStats(res.values.stats);
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-popup" });
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Açılış Popup
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Siteye giren ziyaretçiye gösterilen kampanya/duyuru penceresi. Kapalıyken
          public sitede hiçbir şey yüklenmez.
        </p>
      </div>

      {loadError && (
        <div className="card-premium p-5 text-sm text-red-700 bg-red-50/60">{loadError}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading || saving}>
        {/* DURUM */}
        <SettingsSection title="Durum" description="Popup'ı açıp kapatın.">
          <ToggleField
            label="Popup aktif"
            description="Kapalıyken popup hiçbir sayfada gösterilmez."
            checked={isEnabled}
            onChange={setIsEnabled}
            disabled={loading || !!loadError}
          />
        </SettingsSection>

        {/* İÇERİK */}
        <SettingsSection
          title="İçerik"
          description="Tüm metinler düz metin olarak gösterilir (HTML kabul edilmez)."
        >
          <UploadField
            label="Popup görseli"
            currentUrl={imagePath}
            onChange={(p) => {
              setImagePath(p);
              setImageBust(String(Date.now()));
            }}
            folder={POPUP_IMAGE_FOLDER}
            slug={POPUP_IMAGE_SLUG}
            version={updatedAt}
            disabled={loading || !!loadError}
            hint="Yatay, en az 1600px genişlikte görsel önerilir. WebP'ye çevrilip R2'ye yüklenir (site-assets/popup/popup.webp). Kaldırıp kaydederseniz dosya R2'den de silinir."
          />
          <TextField
            label="Büyük vurgu metni"
            value={highlight}
            onChange={(v) => setHighlight(v.slice(0, POPUP_LIMITS.highlight))}
            placeholder="20"
            hint="Görselin üzerinde büyük puntoyla gösterilir (örn. yıl sayısı). Boş bırakılabilir."
            disabled={loading || !!loadError}
          />
          <TextField
            label="Başlık"
            value={title}
            onChange={(v) => setTitle(v.slice(0, POPUP_LIMITS.title))}
            placeholder="2006'dan bu yana tatilinizin yanındayız."
            disabled={loading || !!loadError}
          />
          <TextAreaField
            label="Açıklama (opsiyonel)"
            value={description}
            onChange={(v) => setDescription(v.slice(0, POPUP_LIMITS.description))}
            rows={3}
            disabled={loading || !!loadError}
          />
          <FieldShell
            label="Alt bilgi satırları (en fazla 4)"
            hint="Örn. '300.000+ misafir', '4.9 misafir puanı', 'TÜRSAB 9117'."
          >
            <div className="space-y-2">
              {stats.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input"
                    value={s}
                    maxLength={POPUP_LIMITS.stat}
                    onChange={(e) => updateStat(i, e.target.value)}
                    disabled={loading || !!loadError}
                    aria-label={`Alt bilgi ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setStats((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-red-600 hover:bg-red-50"
                    aria-label={`Alt bilgi ${i + 1} sil`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {stats.length < POPUP_LIMITS.statsCount && (
                <button
                  type="button"
                  onClick={() => setStats((prev) => [...prev, ""])}
                  disabled={loading || !!loadError}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)]"
                >
                  <Plus size={14} /> Satır ekle
                </button>
              )}
            </div>
          </FieldShell>
        </SettingsSection>

        {/* BUTON */}
        <SettingsSection title="Buton" description="Popup'ın altındaki yönlendirme butonu.">
          <ToggleField
            label="Butonu göster"
            checked={showButton}
            onChange={setShowButton}
            disabled={loading || !!loadError}
          />
          <TextField
            label="Buton metni"
            value={buttonText}
            onChange={(v) => setButtonText(v.slice(0, POPUP_LIMITS.buttonText))}
            placeholder="Villaları inceleyin"
            disabled={loading || !!loadError || !showButton}
          />
          <FieldShell
            label="Buton URL'i"
            hint="Site içi için '/' ile başlayın (örn. /kiralik-villalar). Harici bağlantılar https:// ile başlamalı ve yeni sekmede açılır."
          >
            <input
              className="input"
              value={buttonUrl}
              onChange={(e) => setButtonUrl(e.target.value.slice(0, POPUP_LIMITS.buttonUrl))}
              placeholder="/kiralik-villalar"
              disabled={loading || !!loadError || !showButton}
              aria-invalid={urlInvalid}
            />
            {urlInvalid && (
              <p className="text-[12px] text-red-600 mt-1.5">
                Yalnız &quot;/...&quot; veya &quot;https://...&quot; adresleri kabul edilir.
              </p>
            )}
          </FieldShell>
        </SettingsSection>

        {/* GÖSTERİM */}
        <SettingsSection
          title="Gösterim"
          description="Nerede ve ne sıklıkla gösterileceği. Tarihler boşsa yalnız aktif/pasif durumu geçerlidir."
        >
          <FieldShell label="Gösterim alanı">
            <div className="grid sm:grid-cols-2 gap-2.5">
              {SCOPES.map((o) => (
                <label
                  key={o.value}
                  className={
                    "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition " +
                    (scope === o.value
                      ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                      : "border-[var(--color-stone-200)] hover:border-[var(--color-stone-300)]")
                  }
                >
                  <input
                    type="radio"
                    name="popup-scope"
                    value={o.value}
                    checked={scope === o.value}
                    onChange={() => setScope(o.value)}
                    disabled={loading || !!loadError}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[14px] font-medium text-[var(--color-stone-900)]">
                      {o.label}
                    </span>
                    <span className="block text-[12.5px] text-[var(--color-stone-500)] mt-0.5">
                      {o.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </FieldShell>
          <FieldShell
            label="Kapatıldıktan sonra"
            hint="İçeriği değiştirip kaydettiğinizde popup, daha önce kapatmış ziyaretçilere de yeniden gösterilir."
          >
            <select
              className="input"
              value={dismiss}
              onChange={(e) => setDismiss(e.target.value as PopupDismissDuration)}
              disabled={loading || !!loadError}
            >
              {POPUP_DISMISS_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {POPUP_DISMISS_LABELS[d]}
                </option>
              ))}
            </select>
          </FieldShell>
          <div className="grid sm:grid-cols-2 gap-4">
            <FieldShell label="Başlangıç tarihi (opsiyonel)" hint="Bu günün başından itibaren (TR saati).">
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading || !!loadError}
              />
            </FieldShell>
            <FieldShell label="Bitiş tarihi (opsiyonel)" hint="Bu günün sonuna kadar (dahil).">
              <input
                type="date"
                className="input"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading || !!loadError}
              />
            </FieldShell>
          </div>
        </SettingsSection>

        {/* ÖNİZLEME */}
        <SettingsSection
          title="Önizleme"
          description="Ziyaretçinin göreceği pencere (kaydedilmemiş değişiklikler dahil)."
        >
          {hasPreviewContent ? (
            <div className="rounded-3xl bg-black/60 p-4 sm:p-6">
              <div className="max-w-[720px] mx-auto">
                <SitePopupCard
                  preview
                  popup={{
                    imageUrl: previewImage,
                    title: title.trim() || null,
                    description: description.trim() || null,
                    highlight: highlight.trim() || null,
                    stats: cleanStats,
                    button: previewButton,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-stone-400)]">
              Önizleme için görsel veya metin ekleyin.
            </p>
          )}
        </SettingsSection>

        <div className="flex justify-end">
          <SaveButton
            loading={saving}
            saved={saved}
            disabled={loading || !!loadError || urlInvalid}
            label="Değişiklikleri kaydet"
          />
        </div>
      </form>
    </div>
  );
}
