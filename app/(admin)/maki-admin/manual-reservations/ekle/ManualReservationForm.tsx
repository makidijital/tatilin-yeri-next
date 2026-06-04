"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createManualReservation,
  updateManualReservation,
  getVillaAvailabilitySnapshot,
} from "@/app/services/manualReservation.service";
import { Save, Home as HomeIcon } from "lucide-react";
import { parseLocalDate } from "@/lib/date-format";
import ReservationCalendar from "@/app/components/admin/reservation-form/ReservationCalendar";
import {
  fetchExternalCalendarArraysForVillaAdmin,
  EMPTY_EXTERNAL_ADMIN_ARRAYS,
  type ExternalCalendarAdminArrays,
} from "@/lib/external-calendar.admin.helper";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";
import VillaCombobox from "./VillaCombobox";

/* ===============================================================
   🛡️ FAZ 29 — EDIT MODE SUPPORT
   ===============================================================
   Tek form, iki mod:
     mode="create" (default) → createManualReservation (eski)
     mode="edit"             → updateManualReservation + initial hidrate

   Edit mode'da:
     - initialData ile selectedVilla/start/end/note state lazy hidrate
     - fetchBlockedDates self-exclude: kendi reservation'ının
       tarih aralığı `blockedDates` array'inde GÖRÜNMEZ (kullanıcı
       seçili tarih aralığını korur, blocked sayılmaz)
     - Submit success → toast + router.replace(/manual-reservations)

   Reservation engine semantik'i AYNEN korundu; sadece edit yolu
   eklendi. ReservationCalendar component'i değişmedi.
   =============================================================== */
type InitialData = {
  id: string;
  villa_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
} | null;

/* ===============================================================
   🔥 MANUAL RESERVATION FORM — uses shared ReservationCalendar
   ===============================================================
   ⚠️ react-day-picker bu form için zaten önceki refactor'da
   tamamen kaldırılmıştı. Bu sürümde inline custom calendar
   shared `ReservationCalendar` component'ine extract edildi.
   Reservation engine semantiği BİREBİR korundu:

     - fetchBlockedDates → Supabase queries + day-walk loop
     - confirmed/pending half-day classification
     - manual single-day fallback (isFirstDay && isLastDay → blocked)
     - getValidEndDate(start, end, blockedDates)
     - getDayStyle (red/yellow/transparent half-day gradient)
     - createManualReservation payload (sv-SE → YYYY-MM-DD)
     - freshSelection / calendarKey reset on submit success
     - DB EXCLUDE constraint half-open `[)` semantic
   =============================================================== */

export default function ManualReservationForm({
  villas,
  mode = "create",
  initialData = null,
  initialVillaId,
}: {
  villas:
    | { id: string; title: string; slug?: string | null }[]
    | null;
  /* 🛡️ FAZ 29 — mode: create (default, backward-compat) | edit */
  mode?: "create" | "edit";
  /* 🛡️ FAZ 29 — edit mode için DB'den fetch'lenmiş initial data.
     null → create flow (eski davranış aynen). */
  initialData?: InitialData;
  /* 🛡️ Quick-action — villa listesinden "Takvim" butonuyla gelen
     query param. Yalnız create mode'da etkili; edit mode'da
     initialData.villa_id öncelikli. Undefined → eski davranış aynen
     (boş seçim). Pre-select sonrası `useEffect[selectedVilla]`
     mount'ta fetchBlockedDates + external fetch tetiklenir;
     takvim direkt o villanın müsaitlik durumuyla açılır. */
  initialVillaId?: string;
}) {
  const toast = useNotify();
  const router = useRouter();

  /* 🛡️ FAZ 29 — Lazy initial state hidrate (mount-once).
     Precedence:
       1. initialData?.villa_id  (edit mode — DB'den hidrate)
       2. initialVillaId         (quick-action query param)
       3. ""                     (boş — eski create default)
     initialData null + initialVillaId undefined → byte-identical
     eski davranış. */
  const [selectedVilla, setSelectedVilla] = useState(
    initialData?.villa_id ?? initialVillaId ?? ""
  );
  const [note, setNote] = useState(initialData?.note ?? "");
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState<Date | null>(() =>
    initialData?.start_date ? parseLocalDate(initialData.start_date) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(() =>
    initialData?.end_date ? parseLocalDate(initialData.end_date) : null
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [checkinDates, setCheckinDates] = useState<Date[]>([]);
  const [checkoutDates, setCheckoutDates] = useState<Date[]>([]);

  const [pendingCheckinDates, setPendingCheckinDates] = useState<Date[]>([]);
  const [pendingCheckoutDates, setPendingCheckoutDates] = useState<Date[]>([]);
  const [pendingMiddleDates, setPendingMiddleDates] = useState<Date[]>([]);

  const [freshSelection, setFreshSelection] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);

  /* ---------------------------------------------
     🔥 BLOCKED DATES FETCH — birebir korundu (FAZ 34 service delege)
     ---------------------------------------------
     FAZ 34: iki inline supabase çağrısı service'in
     `getVillaAvailabilitySnapshot(villaId)` export'una taşındı.
     Service repo'ya delege ediyor; status allow-list
     `["pending","confirmed"]` + manual blokların tamamı
     (asimetri) + cross-table queries BYTE-IDENTICAL korundu.

     ⚠️ Component-side parse loop (checkin/checkout/blocked Date[]
        arrays + isFirstDay/isLastDay/pending classification +
        editingId self-exclude) AYNEN — kasıtlı (calendar
        rendering UI mantığı service boundary dışında).
  ---------------------------------------------- */
  const fetchBlockedDates = async () => {
    if (!selectedVilla) return;

    const { reservations, manualBlocks: manual } =
      await getVillaAvailabilitySnapshot(selectedVilla);

    const editingId =
      mode === "edit" && initialData?.id ? initialData.id : null;

    let blocked: Date[] = [];
    let checkin: Date[] = [];
    let checkout: Date[] = [];
    let pCI: Date[] = [];
    let pCO: Date[] = [];
    let pM: Date[] = [];

    reservations?.forEach((r: any) => {
      let current = parseLocalDate(r.start_date);
      const end = parseLocalDate(r.end_date);
      while (current <= end) {
        const d = new Date(current);
        const startDate = parseLocalDate(r.start_date);
        const endDate = parseLocalDate(r.end_date);
        const isFirstDay =
          current.toDateString() === startDate.toDateString();
        const isLastDay =
          current.toDateString() === endDate.toDateString();
        if (r.status === "confirmed") {
          if (isFirstDay) checkin.push(d);
          else if (isLastDay) checkout.push(d);
          else blocked.push(d);
        }
        if (r.status === "pending") {
          if (isFirstDay) pCI.push(d);
          else if (isLastDay) pCO.push(d);
          else pM.push(d);
        }
        current.setDate(current.getDate() + 1);
      }
    });

    manual?.forEach((r: any) => {
      /* 🛡️ FAZ 29 — Edit mode'da kendini block sayma: kullanıcı
         seçili tarih aralığını "blocked" görmesin, end-clamp
         kendi tarihlerine uygulanmasın. */
      if (editingId && r.id === editingId) return;
      let current = parseLocalDate(r.start_date);
      const end = parseLocalDate(r.end_date);
      while (current <= end) {
        const d = new Date(current);
        const startDate = parseLocalDate(r.start_date);
        const endDate = parseLocalDate(r.end_date);
        const isFirstDay =
          current.toDateString() === startDate.toDateString();
        const isLastDay =
          current.toDateString() === endDate.toDateString();
        if (isFirstDay && isLastDay) blocked.push(d);
        else if (isFirstDay) checkin.push(d);
        else if (isLastDay) checkout.push(d);
        else blocked.push(d);
        current.setDate(current.getDate() + 1);
      }
    });

    const unique = (arr: Date[]) =>
      Array.from(new Map(arr.map((d) => [d.toDateString(), d])).values());

    setBlockedDates(unique(blocked));
    setCheckinDates(unique(checkin));
    setCheckoutDates(unique(checkout));
    setPendingCheckinDates(unique(pCI));
    setPendingCheckoutDates(unique(pCO));
    setPendingMiddleDates(unique(pM));
  };

  useEffect(() => {
    fetchBlockedDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVilla]);

  /* 🛡️ FAZ 56H-D — External iCal blocks (admin authenticated). */
  const [externalCal, setExternalCal] = useState<ExternalCalendarAdminArrays>(
    EMPTY_EXTERNAL_ADMIN_ARRAYS
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedVilla) {
        if (!cancelled) setExternalCal(EMPTY_EXTERNAL_ADMIN_ARRAYS);
        return;
      }
      const next = await fetchExternalCalendarArraysForVillaAdmin(
        selectedVilla
      );
      if (!cancelled) setExternalCal(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVilla]);

  /* ---------------------------------------------
     🔥 getValidEndDate — birebir korundu (inline kasıtlı,
     "behavior frozen" — shared lib'e geçirilmedi).
  ---------------------------------------------- */
  const getValidEndDate = (
    start: Date,
    end: Date,
    blockedDates: Date[]
  ) => {
    let current = new Date(start);
    while (current <= end) {
      const isBlocked = blockedDates.some(
        (d) => d.toDateString() === current.toDateString()
      );
      if (isBlocked) {
        const prev = new Date(current);
        prev.setDate(prev.getDate() - 1);
        return prev;
      }
      current.setDate(current.getDate() + 1);
    }
    return end;
  };

  const handleSubmit = async () => {
    if (!selectedVilla || !startDate || !endDate) {
      toast.error("Eksik bilgi", {
        id: "manual-blok",
        description: "Villa ve tarih aralığı seçin.",
      });
      return;
    }
    setLoading(true);
    const payload = {
      villa_id: selectedVilla,
      start_date: startDate.toLocaleDateString("sv-SE"),
      end_date: endDate.toLocaleDateString("sv-SE"),
      note,
    };
    try {
      /* 🛡️ FAZ 29 — mode branch */
      if (mode === "edit" && initialData?.id) {
        /* 🛡️ FAZ 55J-3 — BEFORE snapshot from initialData (DB load). */
        const before = {
          id: initialData.id,
          villa_id: initialData.villa_id,
          start_date: initialData.start_date,
          end_date: initialData.end_date,
          note: initialData.note,
        };
        await updateManualReservation(initialData.id, payload);
        toast.success("Blok güncellendi", { id: "manual-blok" });
        /* AUDIT LOG (fail-safe). */
        logActivity({
          action: "manual_reservation.updated",
          entity_type: "manual_reservation",
          entity_id: initialData.id,
          entity_title: payload.villa_id
            ? `${payload.start_date} → ${payload.end_date}`
            : "Manuel blok",
          before_data: before,
          after_data: { id: initialData.id, ...payload },
        }).catch(() => {});
        /* Edit success → liste sayfasına dön (UX). */
        router.replace("/maki-admin/manual-reservations");
        router.refresh();
        return;
      }

      /* CREATE flow (eski davranış aynen) */
      const created = await createManualReservation(payload);
      toast.success("Blok eklendi", { id: "manual-blok" });
      /* 🛡️ FAZ 55J-3 — AUDIT LOG (fail-safe). createManualReservation
         dönen row'u id ile aktarır; failure throw eder → log atılmaz. */
      logActivity({
        action: "manual_reservation.created",
        entity_type: "manual_reservation",
        entity_id:
          created && typeof (created as { id?: string }).id === "string"
            ? (created as { id: string }).id
            : null,
        entity_title: `${payload.start_date} → ${payload.end_date}`,
        after_data: {
          villa_id: payload.villa_id,
          start_date: payload.start_date,
          end_date: payload.end_date,
          note: payload.note,
        },
      }).catch(() => {});

      setStartDate(null);
      setEndDate(null);
      setFreshSelection(true);
      setNote("");
      setCalendarKey((prev) => prev + 1);
      await fetchBlockedDates();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? "Blok güncellenemedi"
            : "Blok eklenemedi";
      toast.error(
        mode === "edit" ? "Blok güncellenemedi" : "Blok eklenemedi",
        {
          id: "manual-blok",
          description: msg,
        }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* VILLA SELECT */}
      <div className="card-premium p-6 space-y-2">
        <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] flex items-center gap-1.5">
          <HomeIcon size={12} className="text-[var(--color-champagne-600)]" />
          Villa
        </label>
        <VillaCombobox
          villas={villas || []}
          value={selectedVilla}
          onChange={setSelectedVilla}
          placeholder="Villa seç"
        />
      </div>

      {/* CALENDAR — shared ReservationCalendar.
          Manual flow: drag commit'inde kendi getValidEndDate
          ile end-clamp uygulanır. fullyBlockedDates set'i
          component'ten parent'a callback üzerinden gelir;
          aynı boundary semantic'i. */}
      {selectedVilla && (
        <div
          key={calendarKey}
          className="card-premium p-3 md:p-4"
        >
          <ReservationCalendar
            startDate={startDate}
            endDate={endDate}
            freshSelection={freshSelection}
            setFreshSelection={setFreshSelection}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            blockedDates={blockedDates}
            checkinDates={checkinDates}
            checkoutDates={checkoutDates}
            pendingCheckinDates={pendingCheckinDates}
            pendingCheckoutDates={pendingCheckoutDates}
            pendingMiddleDates={pendingMiddleDates}
            externalCheckinDates={externalCal.externalCheckinDates}
            externalCheckoutDates={externalCal.externalCheckoutDates}
            externalMiddleDates={externalCal.externalMiddleDates}
            externalDetailByDate={externalCal.detailByDate}
            onSelectRange={(from, to, fb) => {
              const safeEnd = getValidEndDate(from, to, fb);
              setStartDate(from);
              setEndDate(safeEnd);
            }}
            resetKey={calendarKey}
            showRangeChip
          />
        </div>
      )}

      {/* NOTE */}
      <div className="card-premium p-6 space-y-2">
        <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
          Not (isteğe bağlı)
        </label>
        <textarea
          placeholder="Bu blok için not ekle…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input !rounded-2xl !p-4 h-24 resize-none"
        />
      </div>

      {/* SAVE */}
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="btn-primary"
        >
          <Save size={15} />
          {loading
            ? "Kaydediliyor…"
            : mode === "edit"
              ? "Değişiklikleri Kaydet"
              : "Bloklamayı Kaydet"}
        </button>
      </div>
    </div>
  );
}
