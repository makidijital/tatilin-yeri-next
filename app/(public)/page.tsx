import type { Metadata } from "next";

import HomePageBody from "@/app/components/home/HomePageBody";
import { buildHomeMetadata } from "@/app/components/home/home-metadata";

/* ===============================================================
   🛡️ ANA SAYFA — "/" (TR)
   ===============================================================
   🛡️ PHASE 11 — Gövde `HomePageBody` (TR/EN/DE ORTAK) component'ine
   taşındı; `/en` ve `/de` AYNI component'i render eder (üç kopya YOK).
   Bu dosyada TR davranışı DEĞİŞMEDİ: aynı section sırası, aynı
   JSON-LD'ler, aynı veri kaynakları.

   CANONICAL/METADATA: önceden yalnız statik `metadata.alternates.
   canonical = "/"` vardı; artık `buildHomeMetadata("tr")` ile
   canonical + hreflang (tr/en/de/x-default) birlikte üretilir.
   Title/description TR canonical değerlerden gelir → çıktı
   root layout'un ürettiğiyle AYNI metin. Root layout'a DOKUNULMADI.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata("tr");
}

export default async function Home() {
  return <HomePageBody locale="tr" />;
}
