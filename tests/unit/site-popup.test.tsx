/* ===============================================================
   🛡️ SITE POPUP — saf yardımcılar + servis doğrulaması + yetki +
   public loader davranışı (migration 095)
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import {
  cleanPopupText,
  isSafePopupUrl,
  isWithinPopupWindow,
  isPopupHomePath,
  popupDateToIso,
  popupIsoToDate,
  popupDismissMs,
  toPublicSitePopup,
  type PublicSitePopup,
  type SitePopupRow,
} from "@/lib/site-popup";

/* ---------------- mocks (servis + action + loader) ---------------- */
const repoFind = vi.fn();
const repoUpdate = vi.fn();
const removeServer = vi.fn();
const authorizeAdminSession = vi.fn();
const callerHasPermission = vi.fn();
const requirePermission = vi.fn();
const revalidateTag = vi.fn();
let pathname = "/";

vi.mock("@/lib/db/site-popup.repository.server", () => ({
  sitePopupRepository: {
    find: (...a: unknown[]) => repoFind(...a),
    update: (...a: unknown[]) => repoUpdate(...a),
  },
}));
vi.mock("@/lib/storage/server", () => ({ removeServer: (...a: unknown[]) => removeServer(...a) }));
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: (...a: unknown[]) => authorizeAdminSession(...a),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: (...a: unknown[]) => callerHasPermission(...a),
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));
vi.mock("next/cache", () => ({
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/dynamic", async () => {
  const mod = await import("@/app/components/layout/site-popup/SitePopupDialog");
  return { default: () => mod.default };
});

import { saveSitePopup, getPublicSitePopup } from "@/app/services/site-popup.service";
import { saveSitePopupAction, loadSitePopupAction } from "@/app/(admin)/maki-admin/settings/popup/popup.action";
import SitePopupLoader from "@/app/components/layout/site-popup/SitePopupLoader";

const NOW = Date.parse("2026-09-26T12:00:00Z");

function row(over: Partial<SitePopupRow> = {}): SitePopupRow {
  return {
    id: 1,
    is_enabled: true,
    image_path: "popup/popup.webp",
    title: "2006'dan bu yana tatilinizin yanındayız.",
    description: null,
    highlight_text: "20",
    stats: ["300.000+ misafir", "4.9 misafir puanı", "TÜRSAB 9117"],
    button_text: "Villaları inceleyin",
    button_url: "/kiralik-villalar",
    show_button: true,
    display_scope: "home",
    dismiss_duration: "session",
    starts_at: null,
    ends_at: null,
    updated_at: "2026-09-26T10:00:00.000Z",
    ...over,
  };
}
const resolve = (p: string, v: string) => `https://cdn.test/${p}?v=${v}`;

/* ================================================================ */
describe("saf yardımcılar", () => {
  it("cleanPopupText: HTML etiketi ve kontrol karakteri temizlenir, uzunluk kırpılır", () => {
    expect(cleanPopupText("<script>alert(1)</script>Merhaba <b>dünya</b>", 100)).toBe("alert(1)Merhaba dünya");
    expect(cleanPopupText("  a\u0000b\tc  ", 100)).toBe("a b c");
    expect(cleanPopupText("x".repeat(50), 10)).toBe("x".repeat(10));
    expect(cleanPopupText("   ", 10)).toBeNull();
    expect(cleanPopupText(123, 10)).toBeNull();
    expect(cleanPopupText("satır1\r\n\r\n\r\nsatır2", 100, { multiline: true })).toBe("satır1\n\nsatır2");
  });

  it("isSafePopupUrl: yalnız '/yol' ve http(s)", () => {
    for (const ok of ["/kiralik-villalar", "/", "/p/kampanya?x=1#a", "https://tatilinyeri.com/x", "http://example.com"]) {
      expect(isSafePopupUrl(ok)).toBe(true);
    }
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>",
      "vbscript:msgbox",
      "//evil.com",
      "/\\evil.com",
      "ftp://x.com",
      "kiralik-villalar",
      "",
      "https://",
    ]) {
      expect(isSafePopupUrl(bad)).toBe(false);
    }
  });

  it("tarih dönüşümü: TR günü; bitiş günü dahil", () => {
    expect(popupDateToIso("2026-10-01", "start")).toBe("2026-09-30T21:00:00.000Z");
    expect(popupDateToIso("2026-10-01", "end")).toBe("2026-10-01T21:00:00.000Z");
    expect(popupDateToIso("2027-02-30", "start")).toBeNull();
    expect(popupDateToIso("01.10.2026", "start")).toBeNull();
    expect(popupIsoToDate("2026-09-30T21:00:00.000Z", "start")).toBe("2026-10-01");
    expect(popupIsoToDate("2026-10-01T21:00:00.000Z", "end")).toBe("2026-10-01");
  });

  it("tarih penceresi", () => {
    expect(isWithinPopupWindow(NOW, null, null)).toBe(true);
    expect(isWithinPopupWindow(NOW, "2026-09-27T00:00:00Z", null)).toBe(false);
    expect(isWithinPopupWindow(NOW, null, "2026-09-26T11:00:00Z")).toBe(false);
    expect(isWithinPopupWindow(NOW, "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe(true);
  });

  it("ana sayfa yolları ve süreler", () => {
    for (const p of ["/", "/tr", "/en", "/de", "/en/"]) expect(isPopupHomePath(p)).toBe(true);
    for (const p of ["/kiralik-villalar", "/en/blog", "/p/x"]) expect(isPopupHomePath(p)).toBe(false);
    expect(popupDismissMs("session")).toBeNull();
    expect(popupDismissMs("1d")).toBe(86_400_000);
    expect(popupDismissMs("30d")).toBe(30 * 86_400_000);
  });
});

describe("toPublicSitePopup (public projeksiyon)", () => {
  it("aktif + içerik → yalnız dar alanlar döner", () => {
    const p = toPublicSitePopup(row(), resolve, NOW)!;
    expect(p).toEqual({
      version: "2026-09-26T10:00:00.000Z",
      imageUrl: "https://cdn.test/popup/popup.webp?v=2026-09-26T10:00:00.000Z",
      title: "2006'dan bu yana tatilinizin yanındayız.",
      description: null,
      highlight: "20",
      stats: ["300.000+ misafir", "4.9 misafir puanı", "TÜRSAB 9117"],
      button: { text: "Villaları inceleyin", url: "/kiralik-villalar", external: false },
      scope: "home",
      dismiss: "session",
      startsAt: null,
      endsAt: null,
    });
    expect(Object.keys(p)).not.toContain("id");
    expect(Object.keys(p)).not.toContain("image_path");
  });

  it("kapalı / içeriksiz / süresi dolmuş → null (hiç render yok)", () => {
    expect(toPublicSitePopup(row({ is_enabled: false }), resolve, NOW)).toBeNull();
    expect(toPublicSitePopup(null, resolve, NOW)).toBeNull();
    expect(
      toPublicSitePopup(
        row({ image_path: null, title: null, highlight_text: null, stats: [], button_text: null }),
        resolve,
        NOW
      )
    ).toBeNull();
    expect(toPublicSitePopup(row({ ends_at: "2026-09-26T11:59:59Z" }), resolve, NOW)).toBeNull();
  });

  it("başlangıcı gelecekte → payload döner (client pencereyi kendisi kontrol eder)", () => {
    const p = toPublicSitePopup(row({ starts_at: "2026-10-01T00:00:00Z" }), resolve, NOW);
    expect(p?.startsAt).toBe("2026-10-01T00:00:00Z");
  });

  it("tehlikeli URL veya gizli buton → buton yok; HTML'li metin düz metne iner", () => {
    expect(toPublicSitePopup(row({ button_url: "javascript:alert(1)" }), resolve, NOW)?.button).toBeNull();
    expect(toPublicSitePopup(row({ show_button: false }), resolve, NOW)?.button).toBeNull();
    const ext = toPublicSitePopup(row({ button_url: "https://example.com/k" }), resolve, NOW);
    expect(ext?.button?.external).toBe(true);
    const x = toPublicSitePopup(row({ title: "<img src=x onerror=alert(1)>Kampanya" }), resolve, NOW);
    expect(x?.title).toBe("Kampanya");
  });
});

/* ================================================================ */
describe("saveSitePopup (servis doğrulaması)", () => {
  const base = {
    isEnabled: true,
    imagePath: "popup/popup.webp",
    title: "Başlık",
    description: "",
    highlight: "20",
    stats: ["a", "b"],
    buttonText: "Villaları inceleyin",
    buttonUrl: "/kiralik-villalar",
    showButton: true,
    scope: "home",
    dismiss: "1d",
    startDate: "",
    endDate: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    repoFind.mockResolvedValue({ data: row(), error: null });
    repoUpdate.mockImplementation(async (values: Record<string, unknown>) => ({
      data: { ...row(), ...values },
      error: null,
    }));
    removeServer.mockResolvedValue({ ok: true });
  });

  it("geçerli giriş → yalnız isimli alanlar yazılır (id/keyfi alan YOK)", async () => {
    const res = await saveSitePopup({ ...base, id: 99, evil: "x", title: "<b>Başlık</b>" });
    expect(res.ok).toBe(true);
    const written = repoUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(
      [
        "button_text", "button_url", "description", "dismiss_duration", "display_scope",
        "ends_at", "highlight_text", "image_path", "is_enabled", "show_button", "starts_at",
        "stats", "title", "updated_at",
      ].sort()
    );
    expect(written.title).toBe("Başlık");
    expect(written.description).toBeNull();
    expect(written.dismiss_duration).toBe("1d");
  });

  it("javascript: URL / geçersiz enum / tarih sırası / geçersiz görsel yolu → RED, DB'ye yazılmaz", async () => {
    for (const bad of [
      { buttonUrl: "javascript:alert(1)" },
      { buttonUrl: "//evil.com" },
      { scope: "everywhere" },
      { dismiss: "forever" },
      { startDate: "2026-10-10", endDate: "2026-10-01" },
      { startDate: "10.10.2026" },
      { imagePath: "../villas/x.webp" },
      { imagePath: "https://evil.com/x.png" },
      { buttonUrl: "" },
    ]) {
      const res = await saveSitePopup({ ...base, ...bad });
      expect(res.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(repoUpdate).not.toHaveBeenCalled();
  });

  it("aktif ama içeriksiz → RED", async () => {
    const res = await saveSitePopup({ ...base, imagePath: null, title: "", highlight: "", description: "" });
    expect(res.ok).toBe(false);
  });

  it("görsel kaldırılınca eski dosya R2'den silinir; aynı yol korunursa silinmez", async () => {
    await saveSitePopup({ ...base, imagePath: null });
    expect(removeServer).toHaveBeenCalledWith("tatilinyeri-site-assets", ["popup/popup.webp"]);
    removeServer.mockClear();
    await saveSitePopup(base);
    expect(removeServer).not.toHaveBeenCalled();
  });

  it("tarih kaydı TR gününe göre saklanır ve forma aynı gün olarak döner", async () => {
    const res = await saveSitePopup({ ...base, startDate: "2026-10-01", endDate: "2026-10-31" });
    const written = repoUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(written.starts_at).toBe("2026-09-30T21:00:00.000Z");
    expect(written.ends_at).toBe("2026-10-31T21:00:00.000Z");
    expect(res.ok && res.values.startDate).toBe("2026-10-01");
    expect(res.ok && res.values.endDate).toBe("2026-10-31");
  });

  it("public okuma hatası (tablo yok vb.) → null, site etkilenmez", async () => {
    repoFind.mockResolvedValueOnce({ data: null, error: { message: 'relation "site_popup" does not exist' } });
    expect(await getPublicSitePopup()).toBeNull();
  });
});

describe("server action yetkisi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoFind.mockResolvedValue({ data: row(), error: null });
    repoUpdate.mockResolvedValue({ data: row(), error: null });
  });

  it("oturum yok → servis/DB çağrılmaz", async () => {
    authorizeAdminSession.mockResolvedValue({ ok: false, status: 401 });
    const res = await saveSitePopupAction({});
    expect(res).toEqual({ ok: false, error: "Yetkisiz" });
    expect(repoUpdate).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("'settings' izni yok → servis/DB çağrılmaz", async () => {
    authorizeAdminSession.mockResolvedValue({ ok: true, caller: { id: "a1" } });
    callerHasPermission.mockResolvedValue(false);
    const res = await saveSitePopupAction({});
    expect(res.ok).toBe(false);
    expect(callerHasPermission).toHaveBeenCalledWith("a1", "settings");
    expect(repoUpdate).not.toHaveBeenCalled();
  });

  it("yetkili + geçerli kayıt → yalnız 'site-popup' tag'i invalidate edilir", async () => {
    authorizeAdminSession.mockResolvedValue({ ok: true, caller: { id: "a1" } });
    callerHasPermission.mockResolvedValue(true);
    const res = await saveSitePopupAction({
      isEnabled: false, imagePath: null, title: "", description: "", highlight: "",
      stats: [], buttonText: "", buttonUrl: "", showButton: true, scope: "home",
      dismiss: "session", startDate: "", endDate: "",
    });
    expect(res.ok).toBe(true);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("site-popup", { expire: 0 });
  });

  it("okuma action'ı requirePermission('settings') ister", async () => {
    requirePermission.mockRejectedValueOnce(new Error("Yetkisiz"));
    await expect(loadSitePopupAction()).rejects.toThrow();
    expect(requirePermission).toHaveBeenCalledWith("settings");
  });
});

/* ================================================================ */
describe("SitePopupLoader (public davranış)", () => {
  const popup: PublicSitePopup = toPublicSitePopup(row({ dismiss_duration: "1d" }), resolve, NOW)!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.style.overflow = "";
    pathname = "/";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const openNow = async () => {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  };

  it("ana sayfada açılır; ESC ile kapanır; scroll kilidi açılıp geri alınır", async () => {
    render(<SitePopupLoader popup={popup} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await openNow();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("TÜRSAB 9117")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Villaları inceleyin" }).getAttribute("href")).toBe("/kiralik-villalar");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    const rec = JSON.parse(window.localStorage.getItem("ty_site_popup_dismissed")!);
    expect(rec.v).toBe(popup.version);
    expect(rec.until).toBe(NOW + 1000 + 86_400_000);
  });

  it("kapatma kaydı süresi içinde tekrar açılmaz; süre dolunca açılır", async () => {
    window.localStorage.setItem(
      "ty_site_popup_dismissed",
      JSON.stringify({ v: popup.version, until: NOW + 60_000 })
    );
    const { unmount } = render(<SitePopupLoader popup={popup} />);
    await openNow();
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    vi.setSystemTime(NOW + 120_000);
    render(<SitePopupLoader popup={popup} />);
    await openNow();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("içerik sürümü değişince eski kapatma kaydı geçersiz", async () => {
    window.localStorage.setItem(
      "ty_site_popup_dismissed",
      JSON.stringify({ v: "eski-surum", until: NOW + 999_999 })
    );
    render(<SitePopupLoader popup={popup} />);
    await openNow();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("'session' → sessionStorage; aynı oturumda tekrar açılmaz", async () => {
    const sess = { ...popup, dismiss: "session" as const };
    const { unmount } = render(<SitePopupLoader popup={sess} />);
    await openNow();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(window.sessionStorage.getItem("ty_site_popup_dismissed")).toContain(sess.version);
    unmount();
    render(<SitePopupLoader popup={sess} />);
    await openNow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("kapsam 'home' iken diğer sayfalarda açılmaz; 'all' iken açılır", async () => {
    pathname = "/kiralik-villalar";
    const { unmount } = render(<SitePopupLoader popup={popup} />);
    await openNow();
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    render(<SitePopupLoader popup={{ ...popup, scope: "all" }} />);
    await openNow();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("tarih penceresi dışında açılmaz", async () => {
    render(<SitePopupLoader popup={{ ...popup, startsAt: "2026-10-01T00:00:00Z" }} />);
    await openNow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("backdrop tıklaması kapatır, kart içi tıklama kapatmaz; EN'de 'Close' etiketi", async () => {
    pathname = "/en";
    render(<SitePopupLoader popup={popup} />);
    await openNow();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByText("20"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
