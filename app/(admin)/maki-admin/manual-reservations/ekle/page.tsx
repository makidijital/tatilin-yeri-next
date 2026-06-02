import ManualReservationForm from "./ManualReservationForm";
import { supabase } from "@/lib/supabase";

async function getVillas() {
  const { data, error } = await supabase.from("villa").select("id, title, slug");
  if (error) throw error;
  return data;
}

export default async function Page() {
  const villas = await getVillas();

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

      <ManualReservationForm villas={villas || []} />
    </div>
  );
}
