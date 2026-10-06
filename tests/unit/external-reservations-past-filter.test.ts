/* ===============================================================
   🛡️ /maki-admin/external-reservations — geçmiş iCal kayıtları
   listede ve "Aktif" KPI'da görünmez (end_date >= bugün, İstanbul).
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listMock = vi.fn<(o: Record<string, unknown>) => Promise<unknown>>(
  async () => ({ data: [], error: null, count: 0 })
);
const countActiveMock = vi.fn<(d?: string | null) => Promise<unknown>>(
  async () => ({ count: 3, error: null })
);
vi.mock("@/lib/db/external-calendar-event.repository", () => ({
  externalCalendarEventRepository: {
    list: (o: Record<string, unknown>) => listMock(o),
    countActive: (d?: string | null) => countActiveMock(d),
  },
}));
vi.mock("@/lib/db/external-calendar-source.repository", () => ({
  externalCalendarSourceRepository: {
    countActive: async () => ({ count: 1 }),
    countWithError: async () => ({ count: 0 }),
    findLatestSuccessAt: async () => ({ data: null }),
  },
}));
vi.mock("@/lib/auth/action-authz", () => ({
  requirePermission: async () => ({ id: "admin" }),
}));

import {
  listExternalCalendarEventsAction,
  getExternalCalendarKpiAction,
} from "@/app/(admin)/maki-admin/external-reservations/external-reservations.action";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  /* UTC 5 Ekim 22:00 = İstanbul 6 Ekim 01:00 */
  vi.setSystemTime(new Date("2026-10-05T22:00:00Z"));
  listMock.mockClear();
  countActiveMock.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("admin liste + KPI geçmişi dışlar", () => {
  it("liste sorgusu minEndDate = İstanbul bugünü ile çalışır (diğer filtreler aynen)", async () => {
    await listExternalCalendarEventsAction({ is_active: true, from: "2026-11-01" });
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ minEndDate: "2026-10-06", is_active: true, from: "2026-11-01" })
    );
  });

  it("'Aktif' KPI yalnız end_date >= bugün sayar", async () => {
    const k = await getExternalCalendarKpiAction();
    expect(countActiveMock).toHaveBeenCalledWith("2026-10-06");
    expect(k.activeEventsCount).toBe(3);
  });
});
