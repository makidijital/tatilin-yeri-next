"use client";

import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Loader2 } from "lucide-react";

/* 🛡️ Fiyat okuma/yazma artık server action üzerinden (villa.repository /
   villa-price.service / @/lib/db client bundle'a girmez). Write server
   tarafında session-aware client ile → RLS admin session aynen korunur. */
import { loadPricingData, savePricingData } from "./pricing.action";

import {
  formatLocalDate,
  startOfMonth,
  addMonths,
  dayKey,
} from "./pricing-calendar/_helpers/date-math";
import {
  buildDayPriceMap,
  applyRangeUpsert,
  applyRangeDelete,
} from "./pricing-calendar/_helpers/range-math";

import PricingCalendarNav from "./pricing-calendar/_components/PricingCalendarNav";
import MonthBlock from "./pricing-calendar/_components/MonthBlock";
import PricingRangeDrawer from "./pricing-calendar/_components/PricingRangeDrawer";

/* 🛡️ FAZ 27 — calculateNights reuse. BookingSidebar (Faz 26B),
   /arama, VillaCard, reservation create — hepsi bu helper ile
   gece hesaplıyor; admin price range modal'ı da aynı hesaba
   bağlandı (eski inclusive day count `+1` bug fix). */
import { calculateNights } from "@/lib/price.engine";

import type {
  PricingCanvasRange,
  PricingCalendarCanvasProps,
  VillaMeta,
} from "./pricing-calendar/_types/pricing-calendar";

/* ===============================================================
   🔥 PRICING CALENDAR CANVAS — reusable premium pricing UI
   ===============================================================
   FAZ 1-4 refactor sonrası bu dosya artık orchestrator shell:
     - Top-level pure helper'lar `pricing-calendar/_helpers/`
     - Sub-component'ler (Nav, MonthBlock, DayCell, RangeDrawer)
       `pricing-calendar/_components/`
     - Tipler `pricing-calendar/_types/pricing-calendar.ts`

   ⚠️ Runtime davranış BYTE-IDENTICAL:
     - 13 useState aynen (drag/drawer/selected/data)
     - 3 useEffect aynen (loadData/global mouseup/ESC keydown)
       — dep array'leri DOKUNULMADI
     - 4 useCallback aynen (persistAndNotify/loadData/onCellDown/onCellEnter)
       — dep array'leri DOKUNULMADI
     - 2 useRef aynen (initialPricesRef + draggingRef)
     - drag commit order aynen (a = ts1 <= ts2; from/to swap)
     - applyRangeUpsert/applyRangeDelete sorting + filter aynen
     - persistAndNotify EDIT/CREATE asimetrisi aynen
     - DayCell inline style transition string aynen
     - VISIBLE_MONTHS = 3 aynen

   ⚠️ Backend tek satır dokunulmadı:
     - villa_prices: aynen
     - getVillaPrices / setVillaPrices: aynen (full replace)
     - reservation/payment hesapları: aynen

   API (değişmedi):
     <PricingCalendarCanvas
       villaId={id}
       onPricesChanged={(prices) => { ... }}  // optional
     />

   Drawer fixed-overlay olarak slide-in yapar; embed edildiğinde
   parent layout'u bozmaz.

   Re-export the type for backward-compat (some callers may import
   `PricingCanvasRange` from this module path).
=============================================================== */

export type { PricingCanvasRange, PricingCalendarCanvasProps };

const VISIBLE_MONTHS = 3;

export default function PricingCalendarCanvas({
  villaId,
  initialPrices,
  onPricesChanged,
  visibleMonths = VISIBLE_MONTHS,
}: PricingCalendarCanvasProps) {
  const [villa, setVilla] = useState<VillaMeta | null>(null);
  const [prices, setPrices] = useState<PricingCanvasRange[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [anchorMonth, setAnchorMonth] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  // CREATE mode initial seed — sadece mount'ta okunur,
  // parent state ping-pong'unu engellemek için.
  const initialPricesRef = useRef<
    PricingCanvasRange[] | undefined
  >(initialPrices);

  // Drag-select
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const draggingRef = useRef<boolean>(false);

  // Drawer
  const [selectedFrom, setSelectedFrom] = useState<Date | null>(
    null
  );
  const [selectedTo, setSelectedTo] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerPrice, setDrawerPrice] = useState<number>(0);
  const [drawerCurrency, setDrawerCurrency] =
    useState<string>("TRY");
  const [drawerError, setDrawerError] = useState<string>("");

  const persistAndNotify = useCallback(
    async (updated: PricingCanvasRange[]): Promise<void> => {
      // EDIT mode: villa_prices DB tablosuna yaz.
      // CREATE mode: DB write YOK; sadece parent'a notify.
      if (villaId) {
        await savePricingData(
          villaId,
          updated.map((r) => ({
            start_date: r.start_date,
            end_date: r.end_date,
            price: r.price,
            currency: r.currency || "TRY",
          }))
        );
      }
      onPricesChanged?.(updated);
    },
    [villaId, onPricesChanged]
  );

  /* ---------- LOAD ---------- */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (villaId) {
        // EDIT mode — DB load
        const { villa: villaData, prices: pricesData } =
          await loadPricingData(villaId);

        if (villaData) {
          setVilla({
            id: villaData.id,
            title: villaData.title || null,
            currency: villaData.currency || "TRY",
          });
        }

        const normalized: PricingCanvasRange[] = (
          pricesData || []
        ).map((p) => ({
          start_date: (p.start_date || "").toString().split("T")[0],
          end_date: (p.end_date || "").toString().split("T")[0],
          price: Number(p.price) || 0,
          currency: p.currency || "TRY",
        }));
        setPrices(normalized);
      } else {
        // CREATE mode — DB write/read YOK; initial snapshot'tan seed
        setVilla(null);
        const seed: PricingCanvasRange[] = (
          initialPricesRef.current || []
        )
          .map((p) => ({
            start_date: (p.start_date || "").toString().split("T")[0],
            end_date: (p.end_date || "").toString().split("T")[0],
            price: Number(p.price) || 0,
            currency: p.currency || "TRY",
          }))
          // boş satırları (legacy default) at
          .filter((p) => p.start_date && p.end_date);
        setPrices(seed);
      }
    } finally {
      setLoading(false);
    }
  }, [villaId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ---------- DAY → PRICE MAP ---------- */
  const dayPriceMap = useMemo(
    () => buildDayPriceMap(prices),
    [prices]
  );
  const { minPrice, maxPrice } = useMemo(() => {
    const ps = prices.map((p) => p.price).filter((p) => p > 0);
    if (ps.length === 0) return { minPrice: 0, maxPrice: 0 };
    return {
      minPrice: Math.min(...ps),
      maxPrice: Math.max(...ps),
    };
  }, [prices]);

  /* ---------- DRAG GLOBAL MOUSEUP ---------- */
  useEffect(() => {
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragStart && dragEnd) {
        const a = dragStart.getTime() <= dragEnd.getTime();
        const from = a ? dragStart : dragEnd;
        const to = a ? dragEnd : dragStart;
        setSelectedFrom(from);
        setSelectedTo(to);
        const existing = dayPriceMap.get(dayKey(from));
        setDrawerPrice(existing?.price || 0);
        // existing range varsa onun currency'sini koru;
        // yoksa villa default currency'ye, o da yoksa TRY'ye düş
        setDrawerCurrency(
          existing?.currency || villa?.currency || "TRY"
        );
        setDrawerError("");
        setDrawerOpen(true);
      }
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [dragStart, dragEnd, dayPriceMap, villa?.currency]);

  const onCellDown = useCallback((d: Date) => {
    draggingRef.current = true;
    setDragStart(d);
    setDragEnd(d);
    setDrawerOpen(false);
    setSelectedFrom(null);
    setSelectedTo(null);
  }, []);
  const onCellEnter = useCallback((d: Date) => {
    if (!draggingRef.current) return;
    setDragEnd(d);
  }, []);

  /* ---------- ACTIONS ---------- */
  const handleSavePrice = async () => {
    if (!selectedFrom || !selectedTo) return;
    if (!Number.isFinite(drawerPrice) || drawerPrice <= 0) {
      setDrawerError("Geçerli bir fiyat gir");
      return;
    }
    setSaving(true);
    try {
      const newRange: PricingCanvasRange = {
        start_date: formatLocalDate(selectedFrom),
        end_date: formatLocalDate(selectedTo),
        price: Math.round(drawerPrice),
        // drawer'dan seçilen currency; mevcut range'inki yüklü gelmişse korunmuş olur
        currency: drawerCurrency || villa?.currency || "TRY",
      };
      const updated = applyRangeUpsert(prices, newRange);
      await persistAndNotify(updated);
      setDrawerOpen(false);
      setSelectedFrom(null);
      setSelectedTo(null);
      // EDIT mode: DB'den re-confirm; CREATE mode: local state direkt güncelle
      if (villaId) {
        await loadData();
      } else {
        setPrices(updated);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bilinmeyen hata";
      setDrawerError(msg);
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteRange = async () => {
    if (!selectedFrom || !selectedTo) return;
    const fromStr = formatLocalDate(selectedFrom);
    const toStr = formatLocalDate(selectedTo);
    const overlapping = prices.filter(
      (r) => !(r.end_date < fromStr || r.start_date > toStr)
    );
    if (overlapping.length === 0) {
      setDrawerError("Seçili tarihte silinecek fiyat aralığı yok");
      return;
    }
    const ok = window.confirm(
      `${overlapping.length} fiyat aralığı seçili tarihle çakışıyor. Tamamen silinsin mi?`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const updated = applyRangeDelete(prices, fromStr, toStr);
      await persistAndNotify(updated);
      setDrawerOpen(false);
      setSelectedFrom(null);
      setSelectedTo(null);
      // EDIT mode: DB'den re-confirm; CREATE mode: local state direkt güncelle
      if (villaId) {
        await loadData();
      } else {
        setPrices(updated);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bilinmeyen hata";
      setDrawerError(msg);
    } finally {
      setSaving(false);
    }
  };
  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setSelectedFrom(null);
    setSelectedTo(null);
    setDrawerError("");
  };

  /* ---------- ESC TO CLOSE ---------- */
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (saving) return;
      setDrawerOpen(false);
      setSelectedFrom(null);
      setSelectedTo(null);
      setDrawerError("");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawerOpen, saving]);

  /* ---------- DERIVED ---------- */
  const months = useMemo(() => {
    const list: Date[] = [];
    const count = Math.max(1, visibleMonths);
    for (let i = 0; i < count; i++) {
      list.push(addMonths(anchorMonth, i));
    }
    return list;
  }, [anchorMonth, visibleMonths]);

  /* 🛡️ Dış grid kolon tavanı — default (≤3 ay) AYNEN korunur.
     Yalnız 5+ ay istendiğinde 2xl breakpoint'inde 5 kolon eklenir;
     lg ve altında 3'erli satıra sarar → laptopta sıkışma / overflow yok. */
  const monthGridColsClass =
    visibleMonths >= 5
      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  const activeFrom = drawerOpen ? selectedFrom : dragStart;
  const activeTo = drawerOpen ? selectedTo : dragEnd;

  /* 🛡️ FAZ 27 — Night-based hesap (reservation matematiği parity). */
  const rangeNights =
    selectedFrom && selectedTo
      ? calculateNights(
          formatLocalDate(selectedFrom),
          formatLocalDate(selectedTo)
        )
      : 0;
  const rangeLabel =
    selectedFrom && selectedTo
      ? `${selectedFrom.toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
        })} → ${selectedTo.toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`
      : "";

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="select-none">
      {/* Tek birleşik canvas — header, body ve footer arasında ayraç YOK */}
      <div className="card-premium p-3 md:p-5">
        {/* Minimal nav bar — ayraç olmadan içeriğe akar */}
        <PricingCalendarNav
          setAnchorMonth={setAnchorMonth}
          pricesCount={prices.length}
          minPrice={minPrice}
          maxPrice={maxPrice}
        />

        {/* CALENDAR BODY — desktop'ta 3 ay yanyana, tablet 2, mobil 1 */}
        {loading ? (
          <div className="py-20 text-center text-[var(--color-stone-500)]">
            <Loader2
              size={18}
              className="animate-spin inline mr-2 -mt-0.5"
            />
            Takvim yükleniyor…
          </div>
        ) : (
          <div className={`grid ${monthGridColsClass} gap-x-6 gap-y-6`}>
            {months.map((m) => (
              <MonthBlock
                key={dayKey(m)}
                monthStart={m}
                dayPriceMap={dayPriceMap}
                minPrice={minPrice}
                maxPrice={maxPrice}
                activeFrom={activeFrom}
                activeTo={activeTo}
                isDraggingNow={!!dragStart && !!dragEnd}
                onCellDown={onCellDown}
                onCellEnter={onCellEnter}
                compact={visibleMonths >= 5}
              />
            ))}
          </div>
        )}
      </div>

      {/* MODAL — centered floating popup (premium, shared between create+edit)
          - Backdrop click → close (overlay onClick + modal stopPropagation)
          - ESC → close (useEffect listener)
          - Calendar her zaman full width; modal absolute layer */}
      {drawerOpen && (
        <PricingRangeDrawer
          rangeLabel={rangeLabel}
          rangeNights={rangeNights}
          drawerPrice={drawerPrice}
          drawerCurrency={drawerCurrency}
          drawerError={drawerError}
          saving={saving}
          setDrawerPrice={setDrawerPrice}
          setDrawerCurrency={setDrawerCurrency}
          setDrawerError={setDrawerError}
          onSave={handleSavePrice}
          onDelete={handleDeleteRange}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
