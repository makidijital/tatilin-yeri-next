"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* 🛡️ Yalnız PricingCalendarCanvas'ın ALTINDAKİ saf/sunum parçaları
   reuse edilir — PricingCalendarCanvas'ın KENDİSİ (drag/save/persist
   state'i, villa_prices'a bağlı akışı) HİÇ import edilmez, ikinci kez
   mount edilmez. Bu importlar mevcut fiyat takviminin de kullandığı
   AYNI dosyalardan, DEĞİŞTİRİLMEDEN gelir. */
import {
  formatLocalDate,
  parseLocalDate,
  startOfMonth,
  addMonths,
  dayKey,
} from "@/app/components/admin/villa/pricing-calendar/_helpers/date-math";
import PricingCalendarNav from "@/app/components/admin/villa/pricing-calendar/_components/PricingCalendarNav";
import MonthBlock from "@/app/components/admin/villa/pricing-calendar/_components/MonthBlock";
import type { PricingCanvasRange } from "@/app/components/admin/villa/pricing-calendar/_types/pricing-calendar";

/* ===============================================================
   🔥 DiscountCalendarCanvas — İndirim tarih aralığı seçimi
   ===============================================================
   AMAÇ: PricingCalendarCanvas'ın (Fiyatlar bölümü) kullanıcı
   deneyimiyle (ay ay grid, gün hücreleri, mouse drag range seçimi,
   mobilde tap-to-range, seçili aralığın görsel vurgusu) MÜMKÜN
   OLDUĞUNCA AYNI HİSSİ veren, ama TAMAMEN BAĞIMSIZ ve İZOLE bir
   "yalnızca tarih aralığı seç" component'i.

   ⚠️ PricingCalendarCanvas.tsx'İN KENDİSİ DEĞİŞTİRİLMEDİ VE İKİNCİ
   KEZ MOUNT EDİLMEDİ. Reuse edilen yalnız onun ALTINDAKİ saf/sunum
   parçaları (BİREBİR AYNI import, hiç fork edilmedi):
     - PricingCalendarNav (ay navigasyonu — fiyat chip'i pricesCount=0
       geçildiği için hiç render edilmez, yalnız ◄ Bugün ► kalır)
     - MonthBlock (ve onun içinde kullandığı DayCell) — 42 hücrelik
       ay grid'i, hücre highlight/boundary mantığı BİREBİR AYNI.
     - date-math.ts (formatLocalDate/parseLocalDate/startOfMonth/
       addMonths/dayKey) — TEK source-of-truth, değiştirilmedi.
   MonthBlock'a HER ZAMAN boş bir dayPriceMap verilir (minPrice/
   maxPrice=0) → DayCell hiçbir günde fiyat GÖSTERMEZ (nötr "—")
   — bu component fiyatlarla hiç ilgilenmiyor, yalnız tarih seçtirir.
   isInRange/isRangeBoundary/renk-tonlama gibi TÜM görsel seçim
   mantığı MonthBlock/DayCell'in KENDİ İÇİNDEN (değiştirilmeden)
   gelir — burada tekrar YAZILMADI.

   Drag-select + tap-to-range STATE MODELİ, PricingCalendarCanvas'taki
   ile AYNI DAVRANIŞTA burada AYRICA (kod paylaşımı OLMADAN) uygulandı
   — bu component'in state'i PricingCalendarCanvas'ın state'inden veya
   fiyat kaydetme (save) action'ından TAMAMEN BAĞIMSIZDIR; aralarında
   hiçbir bağlantı/import yok.

   TEK GÖREVİ: başlangıç + bitiş tarihi seçtirip
   onChange({ start_date, end_date }) ile parent'a (DiscountsSection)
   bildirmek. [start_date, end_date] KAPALI interval (villa_prices ile
   birebir aynı semantik). İndirim tipi/değer/para birimi, kayıt,
   silme — HİÇBİRİNE bu component dokunmaz.
=============================================================== */

const EMPTY_DAY_PRICE_MAP = new Map<string, PricingCanvasRange>();

export type DiscountDateRange = { start_date: string; end_date: string };

export default function DiscountCalendarCanvas({
  value,
  onChange,
  visibleMonths = 3,
}: {
  /** Halihazırda seçili (draft) aralık — form state'i parent'ta yaşar. */
  value: DiscountDateRange | null;
  /** Kullanıcı bir aralık seçtiğinde (drag bırakınca veya 2. tap'te) çağrılır. */
  onChange: (range: DiscountDateRange) => void;
  /** Yan yana gösterilecek ay sayısı. Default 3 — PricingCalendarCanvas'ın
   *  kendi VISIBLE_MONTHS varsayılanıyla aynı (görsel parity). */
  visibleMonths?: number;
}) {
  const [anchorMonth, setAnchorMonth] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  // Drag-select (desktop mouse) — PricingCalendarCanvas ile AYNI model.
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const draggingRef = useRef<boolean>(false);
  // 📱 Tap-to-range (mobil/touch) — desktop drag'i ETKİLEMEZ.
  const [tapAnchor, setTapAnchor] = useState<Date | null>(null);

  /* ---------- RANGE COMMIT ----------
     PricingCalendarCanvas'taki commitRange'in AYNI swap mantığı;
     yalnız drawer açmak yerine doğrudan onChange ile parent'a bildirir. */
  const commitRange = useCallback(
    (a0: Date, b0: Date) => {
      const a = a0.getTime() <= b0.getTime();
      const from = a ? a0 : b0;
      const to = a ? b0 : a0;
      onChange({
        start_date: formatLocalDate(from),
        end_date: formatLocalDate(to),
      });
    },
    [onChange]
  );

  /* ---------- DRAG GLOBAL MOUSEUP (desktop) ---------- */
  useEffect(() => {
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragStart && dragEnd) {
        commitRange(dragStart, dragEnd);
      }
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [dragStart, dragEnd, commitRange]);

  const onCellDown = useCallback((d: Date) => {
    draggingRef.current = true;
    setDragStart(d);
    setDragEnd(d);
    setTapAnchor(null);
  }, []);
  const onCellEnter = useCallback((d: Date) => {
    if (!draggingRef.current) return;
    setDragEnd(d);
  }, []);

  /* ---------- 📱 TAP-TO-RANGE (mobil/touch) ----------
     PricingCalendarCanvas'taki ile AYNI iki-dokunuş modeli. */
  const onCellTap = useCallback(
    (d: Date) => {
      draggingRef.current = false;
      if (!tapAnchor) {
        setTapAnchor(d);
        setDragStart(d);
        setDragEnd(d);
      } else {
        commitRange(tapAnchor, d);
        setTapAnchor(null);
        setDragStart(null);
        setDragEnd(null);
      }
    },
    [tapAnchor, commitRange]
  );

  const months: Date[] = [];
  for (let i = 0; i < Math.max(1, visibleMonths); i++) {
    months.push(addMonths(anchorMonth, i));
  }

  // Sürükleme sırasında canlı önizleme; sürükleme/tap bekleme yokken
  // son commit edilmiş (value) aralık gösterilir — PricingCalendarCanvas'taki
  // `activeFrom/activeTo` (orada drawerOpen bazlı) mantığının, burada
  // drawer yerine `value` prop'una bağlı ikizi.
  const valueFrom = value ? parseLocalDate(value.start_date) : null;
  const valueTo = value ? parseLocalDate(value.end_date) : null;
  const activeFrom = dragStart ?? valueFrom;
  const activeTo = dragEnd ?? valueTo;

  return (
    <div className="select-none card-premium p-3 md:p-4">
      <PricingCalendarNav
        setAnchorMonth={setAnchorMonth}
        pricesCount={0}
        minPrice={0}
        maxPrice={0}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6">
        {months.map((m) => (
          <MonthBlock
            key={dayKey(m)}
            monthStart={m}
            dayPriceMap={EMPTY_DAY_PRICE_MAP}
            minPrice={0}
            maxPrice={0}
            activeFrom={activeFrom}
            activeTo={activeTo}
            isDraggingNow={!!dragStart && !!dragEnd}
            onCellDown={onCellDown}
            onCellEnter={onCellEnter}
            onCellTap={onCellTap}
          />
        ))}
      </div>
    </div>
  );
}
