"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import ManualReservationList from "./ManualReservationList";

/* ===============================================================
   🛡️ Manual reservations LIST PAGE — admin
   ===============================================================
   RSC + anon `db` patterni manual_reservations PHASE 3 (migration
   040) admin-only RLS sonrası boş liste döndürüyordu:

     RSC → getManualReservations() (service) → repository.findList()
       → db.from("manual_reservations").select(...)   // anon, no JWT
       → RLS DENY → [] silent fail

   Fix: /api/admin/reservations modeli ile bire bir aynı pattern'e
   geçildi → adminFetch (Bearer) → /api/admin/manual-reservations
   server route → service-role repository. Davranış BYTE-IDENTICAL:
     - SELECT shape `id, start_date, end_date, note, created_at,
       villa:villa_id(title)` aynen (route ↔ repo ↔ eski anon repo).
     - Order `created_at` DESC aynen.
     - Empty/loading state preserved (loading "Yükleniyor…" →
       ManualReservationList kendi empty card'ını gösterir).
     - ManualReservationList signature `{ initialData }` aynen;
       delete handler + UI davranışı dokunulmadı.
     - Service orchestration (createManualReservation,
       updateManualReservation, deleteManualReservation,
       getVillaAvailabilitySnapshot) dokunulmadı — client-side
       admin form'ları browser session JWT ile çalışmaya devam
       eder (is_active_admin() true → RLS allow).
   =============================================================== */

type ManualReservationRow = {
  id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  created_at: string;
  villa: { title: string | null } | null;
};

export default function Page() {
  const [data, setData] = useState<ManualReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminFetch("/api/admin/manual-reservations");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          manual_reservations?: ManualReservationRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          console.error(
            "[manual-reservations.list] FAILED",
            json.error || `HTTP ${res.status}`
          );
          setData([]);
          return;
        }
        setData(json.manual_reservations || []);
      } catch (err) {
        if (cancelled) return;
        console.error("[manual-reservations.list] EXCEPTION", err);
        setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Rezervasyon</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Bloklanan tarihler
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Manuel olarak takvime eklenen rezervasyon ve bakım blokları.
          </p>
        </div>

        <Link
          href="/maki-admin/manual-reservations/ekle"
          className="btn-primary self-start"
        >
          <Plus size={15} />
          Yeni Blok
        </Link>
      </div>

      {loading ? (
        <div className="card-premium p-10 text-center text-[var(--color-stone-500)]">
          Yükleniyor…
        </div>
      ) : (
        <ManualReservationList initialData={data} />
      )}
    </div>
  );
}
