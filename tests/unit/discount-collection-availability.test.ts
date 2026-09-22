/* ===============================================================
   🛡️ İNDİRİMLİ KOLEKSİYON — İNDİRİM PENCERESİ MÜSAİTLİK KİLİDİ
   ===============================================================
   KURAL: "Hemen Rezervasyon Yap" CTA'sı yalnız indirim aralığının
   TAMAMI boşsa rezervasyon sayfasına gider. Aralıkta TEK BİR GECE
   bile dolu ise `discount_available = false`.
   ⛔ "en az 1 gece müsaitse yeter" mantığı YOKTUR.

   BU TEST ÜÇ ŞEYİ KİLİTLER:
     1) Tam-aralık kuralı (ilk/orta/son gece + tam dolu senaryoları).
     2) N+1 YOKLUĞU — aynı (start,end) penceresini paylaşan villalar
        TEK sorguda kontrol edilir; sorgu sayısı = DISTINCT pencere.
     3) Fail-soft — kontrol yapılamazsa MEVCUT davranış korunur.

   `getBlockedVillaIds` mock'lanır ama davranışı SAHTE DEĞİL: gerçek
   RPC'nin half-open overlap kuralı (`existing.start < end AND
   existing.end > start`, migration 039) birebir uygulanır. Böylece
   senaryolar gerçek tarih semantiğiyle doğrulanır.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* İndirim pencereleri — hepsi GELECEKTE (görünürlük filtresi
   `end_date >= bugün` geçsin diye). */
const W1_START = iso(20);
const W1_END = iso(27);
const W2_START = iso(50);
const W2_END = iso(57);

/* ---------------- blocked-range fixture + gerçek overlap kuralı ---- */
type Block = { villa_id: string; start_date: string; end_date: string };
let BLOCKS: Block[] = [];

const getBlockedVillaIdsMock = vi.fn(
  async (start: string, end: string, villaIds?: string[]) => {
    const blocked = new Set<string>();
    if (!start || !end || !(start < end)) return blocked;
    const scope = Array.isArray(villaIds) ? new Set(villaIds) : null;
    for (const b of BLOCKS) {
      if (scope && !scope.has(b.villa_id)) continue;
      /* migration 039 — half-open [) overlap, BİREBİR */
      if (b.start_date < end && b.end_date > start) blocked.add(b.villa_id);
    }
    return blocked;
  }
);

vi.mock("@/lib/availability.helper", () => ({
  getBlockedVillaIds: (...a: unknown[]) =>
    (getBlockedVillaIdsMock as unknown as (...x: unknown[]) => unknown)(...a),
}));

/* ---------------- cache.helpers çevre mock'ları ---------------- */
const findActivePublicCardsMock = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
}));
vi.mock("@/lib/db/discount.repository", () => ({
  discountRepository: {
    findActivePublicCards: (...a: unknown[]) => findActivePublicCardsMock(...a),
    findAllForAdmin: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null) => u,
  resolveAssetUrl: (u: string | null) => u,
}));
vi.mock("@/app/services/villa-review.service", () => ({
  getApprovedVillaReviews: async () => [],
  getFeaturedHomepageReviews: async () => [],
  getGlobalReviewStats: async () => ({ average: 0, count: 0 }),
  getVillaReviewStats: async () => ({ average: 0, count: 0 }),
  getVillaReviewStatsBatch: async () => ({}),
}));
vi.mock("@/app/services/settings.service", () => ({ getPublicSettings: async () => null }));
vi.mock("@/app/services/menu.service", () => ({ getMenu: async () => [] }));
vi.mock("@/app/services/villa.service", () => ({ getVillas: async () => [] }));
vi.mock("@/app/services/faq.service", () => ({ getFaqs: async () => [] }));
vi.mock("@/lib/i18n/get-faq-translations.server", () => ({
  applyFaqTranslations: async (f: unknown[]) => f,
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findActiveLocationIds: async () => ({ data: [], error: null }),
    findActiveImagesByIds: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({ villaTypeRepository: {} }));
vi.mock("@/lib/db/villa-location.repository", () => ({ villaLocationRepository: {} }));
vi.mock("@/lib/db/homepage.repository", () => ({ homepageRepository: {} }));

import { getCachedDiscountCollectionVillas } from "@/lib/cache.helpers";

/* ---------------- fixtures ---------------- */
function publicRow(
  villaId: string,
  discount: { start_date: string; end_date: string }
) {
  return {
    id: `dc-${villaId}`,
    sort_order: 0,
    is_active: true,
    custom_title: null,
    custom_cover_image: null,
    villa: {
      id: villaId,
      slug: villaId,
      title: villaId,
      badge: null,
      bedrooms: 3,
      bathrooms: 2,
      guests: 6,
      is_active: true,
      deleted_at: null,
      location: { name: "Kaş" },
      villa_images: [{ image_url: "a.webp", is_cover: true, sort_order: 0 }],
      villa_prices: [
        { price: 10000, currency: "TRY", start_date: iso(-5), end_date: iso(90) },
      ],
      villa_discounts: [
        {
          start_date: discount.start_date,
          end_date: discount.end_date,
          discount_type: "percent" as const,
          discount_value: 20,
          currency: null,
        },
      ],
    },
  };
}

function setCards(rows: unknown[]) {
  findActivePublicCardsMock.mockResolvedValue({ data: rows, error: null });
}

async function availabilityOf(villaId: string): Promise<boolean | undefined> {
  const list = await getCachedDiscountCollectionVillas();
  return list.find((c) => c.id === villaId)?.discount_available;
}

beforeEach(() => {
  vi.clearAllMocks();
  BLOCKS = [];
});

describe("İndirim penceresi müsaitliği — TAM ARALIK kuralı", () => {
  it("1) Aralığın TAMAMI boş → discount_available = true", async () => {
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(true);
  });

  it("2) Aralıkta TEK BİR GECE dolu → false", async () => {
    // W1_START+3 → +4 : tek gece
    BLOCKS = [{ villa_id: "v1", start_date: iso(23), end_date: iso(24) }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(false);
  });

  it("3) İLK gece dolu → false", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: iso(20), end_date: iso(21) }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(false);
  });

  it("4) SON gece dolu → false", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: iso(26), end_date: iso(27) }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(false);
  });

  it("5) ORTADAKİ gece dolu → false", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: iso(24), end_date: iso(25) }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(false);
  });

  it("6) TÜM aralık dolu → false", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: W1_START, end_date: W1_END }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(false);
  });

  it("7) Aralığın ÇOĞU boş, yalnız son 1 gece dolu → yine false (kısmi müsaitlik YETMEZ)", async () => {
    // 10-15 boş, 16-17 dolu senaryosunun birebir karşılığı
    BLOCKS = [{ villa_id: "v1", start_date: iso(26), end_date: iso(27) }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(false);
  });

  it("8) SINIR: bitişik checkout/checkin ÇAKIŞMA DEĞİL (half-open korunur)", async () => {
    // Rezervasyon indirim başlangıcında BİTİYOR → çakışma yok
    BLOCKS = [{ villa_id: "v1", start_date: iso(15), end_date: W1_START }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(true);
  });

  it("9) SINIR: rezervasyon indirim bitişinde BAŞLIYOR → çakışma yok", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: W1_END, end_date: iso(30) }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(true);
  });
});

describe("Sorgu sayısı — N+1 YOK", () => {
  it("10) AYNI pencereyi paylaşan 5 villa → TEK sorgu", async () => {
    setCards(
      ["a", "b", "c", "d", "e"].map((v) =>
        publicRow(v, { start_date: W1_START, end_date: W1_END })
      )
    );
    await getCachedDiscountCollectionVillas();
    expect(getBlockedVillaIdsMock).toHaveBeenCalledTimes(1);
    const [start, end, ids] = getBlockedVillaIdsMock.mock.calls[0];
    expect(start).toBe(W1_START);
    expect(end).toBe(W1_END);
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("11) 2 DISTINCT pencere / 6 villa → 2 sorgu (villa başına DEĞİL)", async () => {
    setCards([
      publicRow("a", { start_date: W1_START, end_date: W1_END }),
      publicRow("b", { start_date: W2_START, end_date: W2_END }),
      publicRow("c", { start_date: W1_START, end_date: W1_END }),
      publicRow("d", { start_date: W2_START, end_date: W2_END }),
      publicRow("e", { start_date: W1_START, end_date: W1_END }),
      publicRow("f", { start_date: W2_START, end_date: W2_END }),
    ]);
    await getCachedDiscountCollectionVillas();
    expect(getBlockedVillaIdsMock).toHaveBeenCalledTimes(2);
  });

  it("12) Her sorgu KENDİ grubunun id'leriyle scope'lanır (tüm tablo taranmaz)", async () => {
    setCards([
      publicRow("a", { start_date: W1_START, end_date: W1_END }),
      publicRow("b", { start_date: W2_START, end_date: W2_END }),
    ]);
    await getCachedDiscountCollectionVillas();
    const byWindow = new Map(
      getBlockedVillaIdsMock.mock.calls.map((c) => [String(c[0]), c[2]])
    );
    expect(byWindow.get(W1_START)).toEqual(["a"]);
    expect(byWindow.get(W2_START)).toEqual(["b"]);
  });

  it("13) Gruplar birbirini ETKİLEMEZ — yalnız dolu olan false olur", async () => {
    BLOCKS = [{ villa_id: "b", start_date: W2_START, end_date: iso(51) }];
    setCards([
      publicRow("a", { start_date: W1_START, end_date: W1_END }),
      publicRow("b", { start_date: W2_START, end_date: W2_END }),
    ]);
    const list = await getCachedDiscountCollectionVillas();
    expect(list.find((c) => c.id === "a")?.discount_available).toBe(true);
    expect(list.find((c) => c.id === "b")?.discount_available).toBe(false);
  });
});

describe("Kenar durumlar ve fail-soft", () => {
  it("14) TEK GÜNLÜK indirim (start === end) → sorgu ATILMAZ, alan undefined kalır", async () => {
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_START })]);
    const v = await availabilityOf("v1");
    expect(getBlockedVillaIdsMock).not.toHaveBeenCalled();
    expect(v).toBeUndefined();
  });

  it("15) AY/YIL sınırını aşan pencere aynen taşınır (kaydırma YOK)", async () => {
    setCards([publicRow("v1", { start_date: iso(95), end_date: iso(101) })]);
    await getCachedDiscountCollectionVillas();
    const [start, end] = getBlockedVillaIdsMock.mock.calls[0];
    expect(start).toBe(iso(95));
    expect(end).toBe(iso(101));
  });

  it("16) FAIL-SOFT: helper boş Set dönerse (RPC hatası) MEVCUT davranış — müsait", async () => {
    getBlockedVillaIdsMock.mockResolvedValueOnce(new Set<string>());
    BLOCKS = [{ villa_id: "v1", start_date: W1_START, end_date: W1_END }];
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    expect(await availabilityOf("v1")).toBe(true);
  });

  it("17) İndirim kaydı hiç yoksa kart zaten listelenmez (mevcut davranış korunur)", async () => {
    const row = publicRow("v1", { start_date: W1_START, end_date: W1_END });
    row.villa.villa_discounts = [];
    setCards([row]);
    const list = await getCachedDiscountCollectionVillas();
    expect(list.length).toBe(0);
    expect(getBlockedVillaIdsMock).not.toHaveBeenCalled();
  });

  it("18) discount alanları ve fiyat çıktısı DEĞİŞMEDİ (yalnız yeni alan eklendi)", async () => {
    setCards([publicRow("v1", { start_date: W1_START, end_date: W1_END })]);
    const list = await getCachedDiscountCollectionVillas();
    expect(list[0].discount).toEqual({
      start_date: W1_START,
      end_date: W1_END,
      discount_type: "percent",
      discount_value: 20,
      currency: null,
    });
    expect(list[0].price).toBe(10000);
    expect(list[0].currency).toBe("TRY");
  });
});
