/* ===============================================================
   🛡️ iCal GEÇMİŞ EVENT KURALI — sync + cleanup + admin liste
   ===============================================================
   KURAL: end_date < bugün (Europe/Istanbul) → import edilmez, DB'de
   tutulmaz. end_date EXCLUSIVE; filtre start_date'e bakmaz.

   Sync, gerçek repository semantiğini taklit eden bellek-içi bir
   `external_calendar_events` tablosu üzerinde koşar:
     • upsert (villa_id, external_uid) → yalnız GÖNDERİLEN kolonlar
       güncellenir (manually_deactivated / created_at korunur)
     • manual override sweep, stale deactivate, past cleanup
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ---------------- bellek-içi tablo ---------------- */
type Row = {
  id: string;
  source_id: string;
  villa_id: string;
  external_uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  is_active: boolean;
  manually_deactivated: boolean;
  last_seen_at: string;
  created_at: string;
};
const db = { rows: [] as Row[], seq: 0 };
const upsertCalls: Array<Array<Record<string, unknown>>> = [];

vi.mock("@/lib/db/external-calendar-event.repository.server", () => ({
  externalCalendarEventServerRepository: {
    async upsertByVillaUid(rows: Array<Record<string, unknown>>) {
      upsertCalls.push(rows);
      const ids: { id: string }[] = [];
      for (const r of rows) {
        const hit = db.rows.find(
          (x) => x.villa_id === r.villa_id && x.external_uid === r.external_uid
        );
        if (hit) {
          Object.assign(hit, r); /* DO UPDATE SET <gönderilen kolonlar> */
          ids.push({ id: hit.id });
        } else {
          const row = {
            id: `ev-${++db.seq}`,
            manually_deactivated: false,
            created_at: String(r.last_seen_at),
            ...r,
          } as unknown as Row;
          db.rows.push(row);
          ids.push({ id: row.id });
        }
      }
      return { data: ids, error: null };
    },
    async deactivateManualOverrideBySource(sourceId: string) {
      for (const r of db.rows)
        if (r.source_id === sourceId && r.manually_deactivated && r.is_active)
          r.is_active = false;
      return { error: null };
    },
    async deletePastBySource(sourceId: string, today: string) {
      const del = db.rows.filter((r) => r.source_id === sourceId && r.end_date < today);
      db.rows = db.rows.filter((r) => !del.includes(r));
      return { data: del.map((r) => ({ id: r.id })), error: null };
    },
    async deletePastAll(today: string) {
      const del = db.rows.filter((r) => r.end_date < today);
      db.rows = db.rows.filter((r) => !del.includes(r));
      return { data: del.map((r) => ({ id: r.id })), error: null };
    },
    async deactivateStaleBySource(sourceId: string, _at: string, seen: string[]) {
      const hit = db.rows.filter(
        (r) => r.source_id === sourceId && r.is_active && !seen.includes(r.external_uid)
      );
      hit.forEach((r) => (r.is_active = false));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    },
  },
}));

const SOURCE = {
  id: "src-1",
  villa_id: "villa-1",
  source_name: "Airbnb",
  ical_url: "https://example.com/cal.ics",
  is_active: true,
};
const sourceMeta: Record<string, unknown>[] = [];
vi.mock("@/lib/db/external-calendar-source.repository.server", () => ({
  externalCalendarSourceServerRepository: {
    findForSync: async () => ({ data: SOURCE, error: null }),
    updateById: async (_id: string, patch: Record<string, unknown>) => {
      sourceMeta.push(patch);
      return { error: null };
    },
    findActiveIds: async () => ({ data: [{ id: SOURCE.id }], error: null }),
  },
}));
vi.mock("@/lib/security/ssrf.server", () => ({
  validateExternalUrl: async (u: string) => ({ ok: true, url: new URL(u) }),
}));
vi.mock("@/lib/cron-auth", () => ({
  authorizeCronRequest: () => ({ ok: true }),
}));

/* ---------------- feed ---------------- */
let feed: Array<{ uid: string; start: string; end: string }> = [];
function ics() {
  const ev = feed
    .map(
      (e) =>
        `BEGIN:VEVENT\nUID:${e.uid}\nDTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}\nDTEND;VALUE=DATE:${e.end.replace(/-/g, "")}\nSUMMARY:Reserved\nEND:VEVENT`
    )
    .join("\n");
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${ev}\nEND:VCALENDAR`;
}

import { syncExternalCalendarSource } from "@/app/services/external-calendar.service";
import {
  getExternalCalendarToday,
  isPastExternalEvent,
} from "@/lib/external-calendar-past";

/* "Bugün" = 6 Ekim 2026, İstanbul 13:00 (UTC 10:00). */
const NOW = new Date("2026-10-06T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.rows = [];
  db.seq = 0;
  upsertCalls.length = 0;
  sourceMeta.length = 0;
  feed = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(ics(), { status: 200 }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const row = (uid: string) => db.rows.find((r) => r.external_uid === uid);
const okResult = async () => {
  const r = await syncExternalCalendarSource(SOURCE.id);
  if (!r.ok) throw new Error(`sync failed: ${r.stage} ${r.error}`);
  return r;
};

/* =============================================================== */
describe("tarih kuralı — end_date < bugün (Europe/Istanbul)", () => {
  it("örnek tablo (bugün 2026-10-06)", () => {
    const t = "2026-10-06";
    expect(isPastExternalEvent("2022-07-14", t)).toBe(true);
    expect(isPastExternalEvent("2025-12-31", t)).toBe(true);
    expect(isPastExternalEvent("2026-10-05", t)).toBe(true); /* 1→5 Eki */
    expect(isPastExternalEvent("2026-10-06", t)).toBe(false); /* bugün çıkış */
    expect(isPastExternalEvent("2026-10-10", t)).toBe(false); /* 5→10, 6→10 */
    expect(isPastExternalEvent("2027-01-05", t)).toBe(false);
  });

  it("İstanbul günü: UTC'de hâlâ dün olsa bile TR'de bugün", () => {
    /* 2026-10-05 21:30 UTC = 2026-10-06 00:30 İstanbul */
    expect(getExternalCalendarToday(new Date("2026-10-05T21:30:00Z"))).toBe("2026-10-06");
    /* 2026-10-06 20:59 UTC = 23:59 İstanbul → hâlâ 6 Ekim (erken silme YOK) */
    expect(getExternalCalendarToday(new Date("2026-10-06T20:59:00Z"))).toBe("2026-10-06");
    expect(getExternalCalendarToday(new Date("2026-10-06T21:00:00Z"))).toBe("2026-10-07");
  });
});

describe("sync — geçmiş event'ler import edilmez", () => {
  it("1) geçmiş event import edilmez, 2) bugünle kesişen ve 3) gelecek import edilir; 8) imported geçmişi saymaz", async () => {
    feed = [
      { uid: "p2022", start: "2022-07-09", end: "2022-07-14" },
      { uid: "p2024", start: "2024-08-01", end: "2024-08-05" },
      { uid: "p2025", start: "2025-06-01", end: "2025-06-10" },
      { uid: "p-oct1-5", start: "2026-10-01", end: "2026-10-05" },
      { uid: "c-oct5-10", start: "2026-10-05", end: "2026-10-10" },
      { uid: "c-oct6-10", start: "2026-10-06", end: "2026-10-10" },
      { uid: "c-checkout-today", start: "2026-10-03", end: "2026-10-06" },
      { uid: "f2027", start: "2027-01-02", end: "2027-01-05" },
    ];
    const r = await okResult();

    expect(r.totalSeen).toBe(8);
    expect(r.imported).toBe(4);
    expect(r.skippedPast).toBe(4);
    expect(r.deletedPast).toBe(0);

    /* Geçmiş event'ler upsert payload'ına HİÇ girmedi. */
    const sentUids = upsertCalls.flat().map((x) => x.external_uid);
    expect(sentUids.sort()).toEqual(
      ["c-checkout-today", "c-oct5-10", "c-oct6-10", "f2027"].sort()
    );
    for (const uid of ["p2022", "p2024", "p2025", "p-oct1-5"]) expect(row(uid)).toBeUndefined();
    for (const uid of ["c-oct5-10", "c-oct6-10", "c-checkout-today", "f2027"])
      expect(row(uid)?.is_active).toBe(true);

    /* Kaynak "son event sayısı" yalnız geçerli event'ler. */
    expect(sourceMeta.at(-1)?.last_event_count).toBe(4);
  });

  it("feed'de 2022 event'i hâlâ olsa bile tekrar oluşturulmaz (2. sync)", async () => {
    feed = [
      { uid: "p2022", start: "2022-07-09", end: "2022-07-14" },
      { uid: "f2027", start: "2027-01-02", end: "2027-01-05" },
    ];
    await okResult();
    const r2 = await okResult();
    expect(row("p2022")).toBeUndefined();
    expect(r2.imported).toBe(1);
    expect(r2.skippedPast).toBe(1);
  });
});

describe("sync — DB'deki geçmiş kayıtların temizliği", () => {
  it("4) DB'de mevcut geçmiş event silinir; 7) last_seen_at güncellenmez; gelecek/bugünle kesişen dokunulmaz", async () => {
    const OLD_SEEN = "2026-09-01T00:00:00.000Z";
    const base = { source_id: SOURCE.id, villa_id: SOURCE.villa_id, summary: null, last_seen_at: OLD_SEEN, created_at: OLD_SEEN };
    db.rows.push(
      { ...base, id: "old-1", external_uid: "p2022", start_date: "2022-07-09", end_date: "2022-07-14", is_active: true, manually_deactivated: false },
      { ...base, id: "old-2", external_uid: "p-man", start_date: "2025-01-01", end_date: "2025-01-05", is_active: false, manually_deactivated: true },
      { ...base, id: "old-3", external_uid: "p-oct1-5", start_date: "2026-10-01", end_date: "2026-10-05", is_active: true, manually_deactivated: false },
      { ...base, id: "keep-today", external_uid: "c-checkout-today", start_date: "2026-10-03", end_date: "2026-10-06", is_active: true, manually_deactivated: false },
      { ...base, id: "keep-future", external_uid: "f2027", start_date: "2027-01-02", end_date: "2027-01-05", is_active: true, manually_deactivated: false }
    );
    /* Geçmiş event feed'de HÂLÂ var. */
    feed = [
      { uid: "p2022", start: "2022-07-09", end: "2022-07-14" },
      { uid: "c-checkout-today", start: "2026-10-03", end: "2026-10-06" },
      { uid: "f2027", start: "2027-01-02", end: "2027-01-05" },
    ];

    /* last_seen_at'in geçmiş event için güncellenmediğini cleanup'tan
       ÖNCE yakala: upsert payload'ında geçmiş UID yok. */
    const r = await okResult();
    expect(upsertCalls.flat().some((x) => x.external_uid === "p2022")).toBe(false);

    expect(r.deletedPast).toBe(3);
    expect(db.rows.map((x) => x.id).sort()).toEqual(["keep-future", "keep-today"]);
    /* Geçmiş satırlar "stale deactivated" sayısına karışmadı. */
    expect(r.deactivated).toBe(0);
    expect(row("f2027")?.is_active).toBe(true);
  });

  it("geçmiş cleanup YALNIZ end_date < bugün — başka kaynağın satırlarına dokunmaz", async () => {
    db.rows.push({
      id: "other", source_id: "src-2", villa_id: "villa-1", external_uid: "o-old",
      start_date: "2022-01-01", end_date: "2022-01-05", summary: null, is_active: true,
      manually_deactivated: false, last_seen_at: "x", created_at: "x",
    });
    feed = [{ uid: "f2027", start: "2027-01-02", end: "2027-01-05" }];
    await okResult();
    expect(db.rows.find((x) => x.id === "other")).toBeDefined();
  });
});

describe("pasifleştirme + UID davranışı korunur", () => {
  it("5) manuel pasifleştirilmiş GELECEK event tekrar sync sonrası pasif kalır; 6) duplicate oluşmaz", async () => {
    feed = [{ uid: "f2027", start: "2027-01-02", end: "2027-01-05" }];
    await okResult();
    const id = row("f2027")!.id;
    /* Admin "Pasifleştir" — route ile aynı patch. */
    Object.assign(row("f2027")!, { is_active: false, manually_deactivated: true });

    const r = await okResult();
    expect(db.rows.filter((x) => x.external_uid === "f2027")).toHaveLength(1);
    expect(row("f2027")!.id).toBe(id);
    expect(row("f2027")!.is_active).toBe(false);
    expect(row("f2027")!.manually_deactivated).toBe(true);
    expect(r.deletedPast).toBe(0);
  });

  it("feed'den düşen gelecek event stale → pasif (silinmez)", async () => {
    feed = [
      { uid: "f1", start: "2027-01-02", end: "2027-01-05" },
      { uid: "f2", start: "2027-02-02", end: "2027-02-05" },
    ];
    await okResult();
    feed = [{ uid: "f1", start: "2027-01-02", end: "2027-01-05" }];
    const r = await okResult();
    expect(r.deactivated).toBe(1);
    expect(row("f2")?.is_active).toBe(false);
  });

  it("feed'de aynı UID'nin tarihi geçmişe çekilirse: yazılmaz, DB'deki gelecek satır stale → pasif", async () => {
    feed = [{ uid: "moved", start: "2027-01-02", end: "2027-01-05" }];
    await okResult();
    feed = [{ uid: "moved", start: "2026-09-01", end: "2026-09-03" }];
    const r = await okResult();
    expect(r.skippedPast).toBe(1);
    expect(row("moved")?.end_date).toBe("2027-01-05");
    expect(row("moved")?.is_active).toBe(false);
  });
});

describe("cron — tüm kaynaklar için geçmiş cleanup", () => {
  it("pasif kaynakların geçmiş satırları da silinir; gelecek satırlar kalır", async () => {
    db.rows.push(
      { id: "inactive-src-old", source_id: "src-off", villa_id: "villa-2", external_uid: "x1", start_date: "2024-01-01", end_date: "2024-01-03", summary: null, is_active: false, manually_deactivated: false, last_seen_at: "x", created_at: "x" },
      { id: "inactive-src-future", source_id: "src-off", villa_id: "villa-2", external_uid: "x2", start_date: "2027-01-01", end_date: "2027-01-03", summary: null, is_active: false, manually_deactivated: true, last_seen_at: "x", created_at: "x" }
    );
    feed = [];
    const { GET } = await import("@/app/api/cron/external-calendar-sync/route");
    const res = await GET(new Request("http://x/api/cron/external-calendar-sync"));
    const json = (await res.json()) as { past_cleanup: { date: string; deleted: number } };
    expect(json.past_cleanup).toEqual({ date: "2026-10-06", deleted: 1 });
    expect(db.rows.map((x) => x.id)).toEqual(["inactive-src-future"]);
  });
});
