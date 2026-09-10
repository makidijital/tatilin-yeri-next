"use client";

import { useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Lock,
} from "lucide-react";

import { useAdmin } from "@/app/components/admin/AdminSessionGuard";
import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ /maki-admin/hesabim — TOTP 2FA YÖNETİMİ
   ===============================================================
   Her admin YALNIZ kendi 2FA'sını buradan yönetir (enroll / disable /
   recovery-code yenileme). Tüm mutasyonlar `adminFetch` ile mevcut
   `authorizeAdminSession()` korumalı `/api/admin/2fa/*` route'larına
   gider — bu sayfa hiçbir secret/hash'e DOĞRUDAN erişmez, yalnız
   server response'larını (bir kerelik plaintext secret/recovery kodu
   dahil) gösterir.

   `useAdmin()` (AdminSessionGuard context) `admin.totp_enabled`
   üzerinden mevcut durumu okur — ayrı bir status fetch'i YOK
   (bkz. lib/admin-auth.ts + /api/auth/me additive `totp_enabled`).

   DOKUNULMAYAN: middleware, admin-route-auth, AdminSessionGuard,
   diğer admin sayfaları — sıfır coupling.
   =============================================================== */

type EnrollState = {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
};

type View = "status" | "enroll" | "recovery-reveal" | "disable" | "regenerate";

const SOFT_BG = "rgba(15, 23, 42, 0.04)";

export default function HesabimPage() {
  const { admin, refresh } = useAdmin();
  const toast = useNotify();

  const [view, setView] = useState<View>("status");
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const [reauthMode, setReauthMode] = useState<"password" | "code">(
    "password"
  );
  const [reauthValue, setReauthValue] = useState("");

  const totpEnabled = admin?.totp_enabled === true;

  const resetReauth = (): void => {
    setReauthMode("password");
    setReauthValue("");
  };

  const parseJson = async (
    res: Response
  ): Promise<{ ok?: boolean; error?: string; [k: string]: unknown } | null> => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const handleStartEnroll = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/2fa/enroll/start", {
        method: "POST",
      });
      const json = await parseJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "2FA kurulumu başlatılamadı");
        return;
      }
      setEnroll({
        secret: (json.secret as string) || "",
        otpauthUri: (json.otpauthUri as string) || "",
        qrDataUrl: (json.qrDataUrl as string) || "",
      });
      setEnrollCode("");
      setView("enroll");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnroll = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!/^\d{6}$/.test(enrollCode.trim())) {
      toast.error("6 haneli kodu eksiksiz gir.");
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/2fa/enroll/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: enrollCode.trim() }),
      });
      const json = await parseJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "Geçersiz doğrulama kodu");
        return;
      }
      setRecoveryCodes((json.recoveryCodes as string[]) || []);
      setEnroll(null);
      setView("recovery-reveal");
      await refresh();
      toast.success("2FA etkinleştirildi.");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!reauthValue.trim()) {
      toast.error(reauthMode === "password" ? "Şifre gerekli" : "Kod gerekli");
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reauthMode === "password"
            ? { password: reauthValue.trim() }
            : { code: reauthValue.trim() }
        ),
      });
      const json = await parseJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "2FA kapatılamadı");
        return;
      }
      resetReauth();
      setView("status");
      await refresh();
      toast.success("2FA kapatıldı.");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!reauthValue.trim()) {
      toast.error(reauthMode === "password" ? "Şifre gerekli" : "Kod gerekli");
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch(
        "/api/admin/2fa/recovery-codes/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reauthMode === "password"
              ? { password: reauthValue.trim() }
              : { code: reauthValue.trim() }
          ),
        }
      );
      const json = await parseJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "Kurtarma kodları yenilenemedi");
        return;
      }
      resetReauth();
      setRecoveryCodes((json.recoveryCodes as string[]) || []);
      setView("recovery-reveal");
      toast.success("Kurtarma kodları yenilendi.");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setBusy(false);
    }
  };

  const handleCopySecret = async (): Promise<void> => {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard erişimi yoksa sessizce yok say — secret zaten ekranda görünür */
    }
  };

  return (
    <div className="space-y-8">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Güvenlik</p>
          <h1 className="admin-page-header__title">Hesabım</h1>
          <p className="admin-page-header__sub">
            İki adımlı doğrulama (2FA) ile hesabını ekstra bir katmanla koru.
          </p>
        </div>
      </header>

      {view === "status" && (
        <div className="admin-card-flat p-6 md:p-8 max-w-xl">
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: totpEnabled
                  ? "rgba(16, 185, 129, 0.12)"
                  : "rgba(148, 163, 184, 0.15)",
                color: totpEnabled ? "rgb(5, 150, 105)" : "var(--admin-muted)",
              }}
            >
              {totpEnabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                İki Adımlı Doğrulama
              </p>
              <p className="text-[13px] text-[var(--admin-muted)] mt-1 leading-relaxed">
                {totpEnabled
                  ? "Aktif — girişte authenticator uygulamandaki 6 haneli kod istenir."
                  : "Pasif — hesabın yalnızca şifreyle korunuyor."}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {!totpEnabled ? (
                  <button
                    type="button"
                    onClick={handleStartEnroll}
                    disabled={busy}
                    className="admin-btn-primary"
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    2FA&apos;yı Etkinleştir
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        resetReauth();
                        setView("regenerate");
                      }}
                      className="admin-btn-ghost"
                    >
                      <RefreshCw size={14} />
                      Kurtarma Kodlarını Yenile
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetReauth();
                        setView("disable");
                      }}
                      className="admin-btn-ghost hover:!text-rose-600"
                    >
                      <ShieldOff size={14} />
                      2FA&apos;yı Kapat
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "enroll" && enroll && (
        <div className="admin-card-flat p-6 md:p-8 max-w-xl space-y-5">
          <div>
            <p className="text-sm font-semibold text-[var(--color-stone-900)]">
              1. QR kodu tara
            </p>
            <p className="text-[13px] text-[var(--admin-muted)] mt-1">
              Google Authenticator, Authy veya benzeri bir uygulamayla
              aşağıdaki kodu tara.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enroll.qrDataUrl}
              alt="TOTP QR kodu"
              width={200}
              height={200}
              className="rounded-xl border border-[var(--admin-border)]"
            />
            <div className="flex items-center gap-2">
              <code
                className="text-[12px] px-2.5 py-1.5 rounded-lg font-mono tracking-wide"
                style={{ background: SOFT_BG }}
              >
                {enroll.secret}
              </code>
              <button
                type="button"
                onClick={handleCopySecret}
                className="admin-btn-ghost !px-2.5 !py-1.5"
                title="Secret'ı kopyala"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <p className="text-[11.5px] text-[var(--admin-muted)]">
              QR taranamıyorsa bu kodu uygulamana manuel gir.
            </p>
          </div>

          <form
            onSubmit={handleConfirmEnroll}
            className="space-y-3 pt-4 border-t border-[var(--admin-border)]"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                2. Kodu doğrula
              </p>
              <p className="text-[13px] text-[var(--admin-muted)] mt-1">
                Uygulamada görünen 6 haneli kodu gir.
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={enrollCode}
              onChange={(e) =>
                setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={busy}
              className="input !h-14 text-center text-2xl tracking-[0.4em] font-semibold max-w-[220px]"
              placeholder="000000"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="admin-btn-primary">
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                Doğrula ve Etkinleştir
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnroll(null);
                  setView("status");
                }}
                disabled={busy}
                className="admin-btn-ghost"
              >
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}

      {view === "recovery-reveal" && (
        <div className="admin-card-flat p-6 md:p-8 max-w-xl space-y-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-stone-900)]">
              Kurtarma Kodları
            </p>
            <p className="text-[13px] text-[var(--admin-muted)] mt-1 leading-relaxed">
              Bu kodlar yalnız ŞİMDİ gösteriliyor — daha sonra tekrar
              görüntülenemez. Her kod tek kullanımlıktır. Güvenli bir yere
              (parola yöneticisi vb.) kaydet.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((c) => (
              <code
                key={c}
                className="text-[13px] px-3 py-2 rounded-lg font-mono text-center tracking-wide"
                style={{ background: SOFT_BG }}
              >
                {c}
              </code>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setRecoveryCodes([]);
              setView("status");
            }}
            className="admin-btn-primary"
          >
            <Check size={14} />
            Kaydettim, Devam Et
          </button>
        </div>
      )}

      {(view === "disable" || view === "regenerate") && (
        <div className="admin-card-flat p-6 md:p-8 max-w-xl space-y-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-stone-900)]">
              {view === "disable" ? "2FA'yı Kapat" : "Kurtarma Kodlarını Yenile"}
            </p>
            <p className="text-[13px] text-[var(--admin-muted)] mt-1 leading-relaxed">
              {view === "disable"
                ? "Bu işlem 2FA'yı kapatır ve tüm kurtarma kodlarını geçersiz kılar."
                : "Bu işlem mevcut tüm kurtarma kodlarını geçersiz kılıp yenilerini üretir."}{" "}
              Devam etmek için şifreni veya mevcut doğrulama kodunu gir.
            </p>
          </div>

          <form
            onSubmit={view === "disable" ? handleDisable : handleRegenerate}
            className="space-y-3"
          >
            <div className="flex gap-2 text-[12.5px]">
              <button
                type="button"
                onClick={() => {
                  setReauthMode("password");
                  setReauthValue("");
                }}
                className="px-3 py-1.5 rounded-lg border transition-colors"
                style={
                  reauthMode === "password"
                    ? {
                        borderColor: "var(--admin-accent-strong)",
                        color: "var(--admin-accent-strong)",
                      }
                    : {
                        borderColor: "var(--admin-border)",
                        color: "var(--admin-muted)",
                      }
                }
              >
                Şifre ile
              </button>
              <button
                type="button"
                onClick={() => {
                  setReauthMode("code");
                  setReauthValue("");
                }}
                className="px-3 py-1.5 rounded-lg border transition-colors"
                style={
                  reauthMode === "code"
                    ? {
                        borderColor: "var(--admin-accent-strong)",
                        color: "var(--admin-accent-strong)",
                      }
                    : {
                        borderColor: "var(--admin-border)",
                        color: "var(--admin-muted)",
                      }
                }
              >
                Doğrulama kodu ile
              </button>
            </div>

            <div className="relative max-w-xs">
              <Lock
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--admin-muted)] pointer-events-none"
              />
              <input
                type={reauthMode === "password" ? "password" : "text"}
                inputMode={reauthMode === "code" ? "numeric" : undefined}
                maxLength={reauthMode === "code" ? 6 : undefined}
                value={reauthValue}
                onChange={(e) =>
                  setReauthValue(
                    reauthMode === "code"
                      ? e.target.value.replace(/\D/g, "").slice(0, 6)
                      : e.target.value
                  )
                }
                disabled={busy}
                className="input !h-12 !pl-10"
                placeholder={reauthMode === "password" ? "Mevcut şifren" : "000000"}
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className={
                  view === "disable"
                    ? "admin-btn-ghost hover:!text-rose-600"
                    : "admin-btn-primary"
                }
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <KeyRound size={14} />
                )}
                {view === "disable" ? "2FA'yı Kapat" : "Kodları Yenile"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetReauth();
                  setView("status");
                }}
                disabled={busy}
                className="admin-btn-ghost"
              >
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
