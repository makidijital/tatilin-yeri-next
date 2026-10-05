/* ===============================================================
   🛡️ R2 presigned PUT (GERÇEK SDK, ağ YOK) + admin CSP
   ===============================================================
   - İmzalı adres kısa ömürlü, Content-Type + Content-Length imzalı.
   - Boş gövdeye göre hesaplanmış "flexible checksum" (CRC32) URL'e
     EKLENMEZ (eklenirse gerçek PUT R2'de reddedilir).
   - Admin CSP connect-src'ye yalnız S3_ENDPOINT origin'i eklenir;
     public policy değişmez.
=============================================================== */

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.S3_ENDPOINT = "https://acct123.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "TESTKEY";
  process.env.S3_SECRET_ACCESS_KEY = "TESTSECRET";
});

describe("presignPutObject", () => {
  it("kısa ömürlü, tip + boyut imzalı, checksum parametresi YOK", async () => {
    const { presignPutObject } = await import("@/lib/storage/s3-storage.provider");
    const key = "villas/villa-x__2f99586c/villa-x-0001-abcd.webp";
    const url = new URL(
      await presignPutObject("tatilinyeri-villa-images", key, {
        contentType: "image/webp",
        contentLength: 12345,
        expiresIn: 120,
      })
    );
    expect(url.origin).toBe("https://acct123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/tatilinyeri-villa-images/${key}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") || "").split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-type", "content-length", "host"]));
    expect(url.searchParams.get("x-amz-checksum-crc32")).toBeNull();
    expect(url.searchParams.get("x-amz-sdk-checksum-algorithm")).toBeNull();
    /* Secret URL'de görünmez. */
    expect(url.toString()).not.toContain("TESTSECRET");
  });
});

describe("admin CSP connect-src", () => {
  const ENV = {
    NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES: "https://cdn.test-villa.example/",
    S3_ENDPOINT: "https://acct123.r2.cloudflarestorage.com",
  };
  const directive = (policy: string, name: string) =>
    (policy
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(name + " ")) || "")
      .split(/\s+/)
      .slice(1);

  it("admin: yalnız S3_ENDPOINT origin'i eklenir; public değişmez", async () => {
    const { buildCspReportOnly } = await import("@/next.config");
    expect(directive(buildCspReportOnly("admin", ENV), "connect-src")).toEqual([
      "'self'",
      "https://acct123.r2.cloudflarestorage.com",
    ]);
    expect(directive(buildCspReportOnly("public", ENV), "connect-src")).not.toContain(
      "https://acct123.r2.cloudflarestorage.com"
    );
    /* S3_ENDPOINT yoksa hiçbir şey eklenmez (mevcut davranış). */
    expect(
      directive(buildCspReportOnly("admin", { NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES: "https://cdn.x/" }), "connect-src")
    ).toEqual(["'self'"]);
  });
});
