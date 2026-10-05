/* ===============================================================
   🛡️ VillaCard `privateHref` — PASİF villa özel linki (/v/[token])
   ===============================================================
   /liste/[token] pasif villa kartları:
     - kart linki /v/[token] (tarih varsa start/end eklenir)
     - /kiralik-villa/[slug] HİÇ üretilmez
     - müsaitlik butonu rezervasyon modalını AÇMAZ, özel sayfaya gider
   Prop verilmeyen (aktif) kartlar BİREBİR eskisi gibi.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/liste/x",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({
  /* eslint-disable-next-line @next/next/no-img-element */
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));
/* Rezervasyon modalı: açılırsa işaret bırakır. */
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="booking-modal" />,
}));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: { TRY: 1 } }),
}));

import VillaCard from "@/app/components/villa/VillaCard";

const BASE = {
  id: "v1",
  slug: "villa-gizli",
  title: "Villa Gizli",
  location: "Kalkan",
  price: 9000,
  currency: "TRY",
  images: [] as string[],
  bedrooms: 2,
  bathrooms: 1,
  guests: 4,
};

beforeEach(() => push.mockClear());

const hrefs = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("a")).map((a) => a.getAttribute("href"));

describe("VillaCard privateHref", () => {
  it("aktif kart (prop yok) → mevcut /kiralik-villa/[slug] linki", () => {
    const { container } = render(<VillaCard {...BASE} />);
    expect(hrefs(container)).toContain("/kiralik-villa/villa-gizli");
  });

  it("pasif kart → /v/[token] (+tarih); /kiralik-villa hiç yok", () => {
    const { container } = render(
      <VillaCard
        {...BASE}
        privateHref="/v/ozel123"
        stayStart="2026-11-10"
        stayEnd="2026-11-15"
      />
    );
    const all = hrefs(container);
    expect(all).toContain("/v/ozel123?start=2026-11-10&end=2026-11-15");
    expect(container.innerHTML).not.toContain("/kiralik-villa/");
  });

  it("pasif kart → müsaitlik butonu modal açmaz, özel sayfaya gider", () => {
    render(<VillaCard {...BASE} privateHref="/v/ozel123" />);
    const btns = screen.getAllByRole("button");
    for (const b of btns) fireEvent.click(b);
    expect(screen.queryByTestId("booking-modal")).toBeNull();
    expect(push).toHaveBeenCalledWith("/v/ozel123");
    expect(push.mock.calls.flat().join(" ")).not.toContain("/kiralik-villa/");
    expect(push.mock.calls.flat().join(" ")).not.toContain("/rezervasyon/");
  });
});
