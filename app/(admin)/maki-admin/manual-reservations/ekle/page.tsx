import ManualReservationForm from "./ManualReservationForm";
import { villaRepository } from "@/lib/db/villa.repository";

async function getVillas() {
  const { data, error } = await villaRepository.findAllIdTitleSlug();
  if (error) throw error;
  return data;
}

/* 🛡️ Quick-action: villa listesinden "Takvim" butonuyla gelen
   pre-select query param. URL örneği:
     /maki-admin/manual-reservations/ekle?villa=<uuid>
   Yoksa eski davranış birebir devam eder (initialVillaId undefined →
   form selectedVilla boş başlar). */
type SearchParams = Promise<{ villa?: string }>;

export default async function Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const villas = await getVillas();

  const sp = (await searchParams) || {};
  const rawVilla = typeof sp.villa === "string" ? sp.villa.trim() : "";
  /* 🛡️ Defansif: query param geçerli bir villa.id'yi göstermiyorsa
     initialVillaId boş bırakılır → form eski davranışa düşer.
     `villa` tablosu fetch'i zaten yapıldığı için ek round-trip yok. */
  const initialVillaId =
    rawVilla.length > 0 &&
    (villas || []).some((v) => v.id === rawVilla)
      ? rawVilla
      : undefined;

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Rezervasyon</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Yeni blok / harici rezervasyon
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Takvimde manuel olarak gün veya aralık bloklamak için kullan.
        </p>
      </div>

      <ManualReservationForm
        villas={villas || []}
        initialVillaId={initialVillaId}
      />
    </div>
  );
}
