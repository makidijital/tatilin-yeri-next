/* ===============================================================
   🛡️ ADMIN AUTH — refresh SINGLE-FLIGHT
   ===============================================================
   Aynı sekmede eşzamanlı iki admin lookup (guard'ın pathname efekti +
   AdminPageSessionRefresh) access süresi dolmuşken ikisi de /me 401
   alır. Refresh rotation aynı eski refresh cookie ile gelen İKİNCİ
   POST'u reddeder → yanlışlıkla logout olurdu. Bu yüzden uçuştaki
   /api/auth/refresh isteği paylaşılır.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  authProvider: { onAuthStateChange: () => ({ unsubscribe() {} }) },
}));

import { lookupCurrentAdmin } from "@/lib/admin-auth";

const ADMIN = { id: "a1", email: "a@test.local", full_name: "A", sidebar_permissions: [], totp_enabled: false };

let refreshed = false;
let refreshCalls = 0;
let releaseRefresh: () => void = () => {};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  refreshed = false;
  refreshCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/me") {
        return refreshed ? json(200, { ok: true, admin: ADMIN }) : json(401, { ok: false });
      }
      if (url === "/api/auth/refresh") {
        refreshCalls += 1;
        /* Rotation: yalnız İLK istek başarılı olabilir. */
        const first = refreshCalls === 1;
        await new Promise<void>((r) => (releaseRefresh = r));
        if (first) refreshed = true;
        return json(first ? 200 : 401, { ok: first });
      }
      throw new Error("beklenmeyen fetch " + url);
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("lookupCurrentAdmin — refresh single-flight", () => {
  it("eşzamanlı iki lookup tek /api/auth/refresh paylaşır ve ikisi de admin döner", async () => {
    const a = lookupCurrentAdmin();
    const b = lookupCurrentAdmin();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    /* İkinci lookup da 401 aldıktan sonra uçuştaki isteğe katılsın. */
    await new Promise((r) => setTimeout(r, 10));
    releaseRefresh();
    const [ra, rb] = await Promise.all([a, b]);
    expect(refreshCalls).toBe(1);
    expect(ra).toMatchObject({ ok: true, admin: { id: "a1" } });
    expect(rb).toMatchObject({ ok: true, admin: { id: "a1" } });
  });

  it("uçuş bitince sıfırlanır — sonraki süre dolumunda yeniden refresh yapılır", async () => {
    const first = lookupCurrentAdmin();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();
    await first;
    refreshed = false; // access yine doldu
    refreshCalls = 0;
    const second = lookupCurrentAdmin();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();
    expect(await second).toMatchObject({ ok: true });
  });
});
