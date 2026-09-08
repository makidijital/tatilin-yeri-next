"use client";

import { useState } from "react";

/* ===============================================================
   🛡️ GEÇİCİ DEMO — Bildirim Sesi Alternatifleri
   ===============================================================
   AMAÇ: Admin'in mevcut sidebar bildirim sesini değiştirmeden önce
   8 farklı Web Audio API sesini tek tek dinleyebilmesi.

   ÇOK ÖNEMLİ İZOLASYON:
   - Bu dosya, app/(admin)/maki-admin/layout.tsx içindeki gerçek
     bildirim sesi sistemine (sharedAudioCtx, playAdminNotificationChime,
     startAdminNotificationLoop, activeSoundHrefs, pendingCounts,
     localStorage baseline) HİÇ DOKUNMAZ ve onunla hiçbir state/
     fonksiyon paylaşmaz.
   - Kendi ayrı, yalnız bu demoya ait `demoAudioCtx` AudioContext'i
     kullanır — gerçek bildirim sisteminden tamamen bağımsızdır.
   - Butona basınca ilgili ses YALNIZ BİR KEZ çalar, loop YOKTUR.
   - Hiçbir buton pendingCounts/localStorage/DB/API'ye dokunmaz.
   - Bu component tamamen GEÇİCİ bir dinleme aracıdır; karar
     verildikten sonra kaldırılabilir.
   =============================================================== */

let demoAudioCtx: AudioContext | null = null;

function getDemoAudioCtx(): AudioContext | null {
  try {
    if (demoAudioCtx) return demoAudioCtx;
    if (typeof window === "undefined") return null;
    const w = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return null;
    demoAudioCtx = new Ctor();
    return demoAudioCtx;
  } catch {
    return null;
  }
}

type NoteOptions = {
  freq: number;
  type?: OscillatorType;
  startOffset: number;
  duration: number;
  peakGain: number;
  attack?: number;
};

function scheduleDemoNote(ctx: AudioContext, opts: NoteOptions): void {
  const { freq, type = "sine", startOffset, duration, peakGain, attack = 0.008 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startOffset;
  const tAttackEnd = t0 + attack;
  const t1 = t0 + duration;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peakGain, tAttackEnd);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

// 1) Soft Ding — tek, yumuşak sine nota.
function playSoftDing(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 740, type: "sine", startOffset: 0, duration: 0.35, peakGain: 0.13 });
}

// 2) Premium Chime — iki nota üst üste (akor hissi), yumuşak ve zengin.
function playPremiumChime(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 880, type: "sine", startOffset: 0, duration: 0.5, peakGain: 0.12 });
  scheduleDemoNote(ctx, { freq: 1318.5, type: "sine", startOffset: 0.05, duration: 0.55, peakGain: 0.09 });
}

// 3) Classic Notification — klasik iki-tonlu "ping-pong" (inen aralık).
function playClassicNotification(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 988, type: "triangle", startOffset: 0, duration: 0.15, peakGain: 0.14 });
  scheduleDemoNote(ctx, { freq: 784, type: "triangle", startOffset: 0.12, duration: 0.2, peakGain: 0.14 });
}

// 4) Double Ding — aynı nota iki kez, kısa aralıkla (loop DEĞİL, sabit 2 vuruş).
function playDoubleDing(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 900, type: "sine", startOffset: 0, duration: 0.22, peakGain: 0.14 });
  scheduleDemoNote(ctx, { freq: 900, type: "sine", startOffset: 0.24, duration: 0.22, peakGain: 0.14 });
}

// 5) Glass Chime — parlak, tiz, hafif "shimmer" için iki yakın frekans birlikte.
function playGlassChime(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 1760, type: "sine", startOffset: 0, duration: 0.6, peakGain: 0.09, attack: 0.004 });
  scheduleDemoNote(ctx, { freq: 1774, type: "sine", startOffset: 0, duration: 0.6, peakGain: 0.07, attack: 0.004 });
  scheduleDemoNote(ctx, { freq: 2637, type: "sine", startOffset: 0.02, duration: 0.45, peakGain: 0.05, attack: 0.004 });
}

// 6) Attention — üç kısa, yükselen "beep" (dikkat çekici ama rahatsız etmeyen).
function playAttention(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 600, type: "triangle", startOffset: 0, duration: 0.09, peakGain: 0.14 });
  scheduleDemoNote(ctx, { freq: 800, type: "triangle", startOffset: 0.1, duration: 0.09, peakGain: 0.14 });
  scheduleDemoNote(ctx, { freq: 1000, type: "triangle", startOffset: 0.2, duration: 0.12, peakGain: 0.14 });
}

// 7) Soft Bell — temel nota + azalan üst harmonikler (yumuşak çan hissi).
function playSoftBell(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 523.25, type: "sine", startOffset: 0, duration: 0.9, peakGain: 0.13, attack: 0.005 });
  scheduleDemoNote(ctx, { freq: 1046.5, type: "sine", startOffset: 0, duration: 0.6, peakGain: 0.055, attack: 0.005 });
  scheduleDemoNote(ctx, { freq: 1568, type: "sine", startOffset: 0, duration: 0.4, peakGain: 0.03, attack: 0.005 });
}

// 8) Hotel Reception Bell — klasik resepsiyon zili: keskin vuruş + uzun çınlama.
function playHotelReceptionBell(ctx: AudioContext): void {
  scheduleDemoNote(ctx, { freq: 1046.5, type: "sine", startOffset: 0, duration: 1.2, peakGain: 0.15, attack: 0.003 });
  scheduleDemoNote(ctx, { freq: 2093, type: "sine", startOffset: 0, duration: 0.8, peakGain: 0.065, attack: 0.003 });
  scheduleDemoNote(ctx, { freq: 3135, type: "sine", startOffset: 0, duration: 0.5, peakGain: 0.035, attack: 0.003 });
}

type DemoSound = {
  id: string;
  label: string;
  play: (ctx: AudioContext) => void;
};

const DEMO_SOUNDS: DemoSound[] = [
  { id: "soft-ding", label: "1. Soft Ding", play: playSoftDing },
  { id: "premium-chime", label: "2. Premium Chime", play: playPremiumChime },
  { id: "classic-notification", label: "3. Classic Notification", play: playClassicNotification },
  { id: "double-ding", label: "4. Double Ding", play: playDoubleDing },
  { id: "glass-chime", label: "5. Glass Chime", play: playGlassChime },
  { id: "attention", label: "6. Attention", play: playAttention },
  { id: "soft-bell", label: "7. Soft Bell", play: playSoftBell },
  { id: "hotel-reception-bell", label: "8. Hotel Reception Bell", play: playHotelReceptionBell },
];

export default function NotificationSoundDemo() {
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);

  function handlePlay(sound: DemoSound): void {
    try {
      const ctx = getDemoAudioCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      sound.play(ctx);
      setLastPlayed(sound.id);
    } catch {
      /* demo ses hatası — sayfanın geri kalanını kesinlikle etkilemez */
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-stone-300)] bg-[var(--color-sand-50)]/60 p-5 md:p-6">
      <span className="inline-block text-[10.5px] font-bold tracking-[0.14em] uppercase text-[#ED7926] bg-[#ED7926]/10 px-2 py-0.5 rounded-full mb-2">
        Geçici Demo
      </span>
      <h2 className="font-display text-lg text-[var(--color-stone-900)]">
        Bildirim Sesi Alternatifleri
      </h2>
      <p className="text-[13px] text-[var(--color-stone-500)] mt-1 mb-4 max-w-2xl">
        Bu alan yalnızca dinleme amaçlıdır. Butonlar mevcut admin bildirim
        sesini, sayaç sistemini veya bildirim döngüsünü değiştirmez ya da
        tetiklemez — her buton kendi ayrı, tek seferlik sesini çalar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {DEMO_SOUNDS.map((sound) => (
          <button
            key={sound.id}
            type="button"
            onClick={() => handlePlay(sound)}
            className={
              "flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-[13px] font-medium border transition " +
              (lastPlayed === sound.id
                ? "border-[#ED7926] bg-[#ED7926]/5 text-[var(--color-stone-900)]"
                : "border-[var(--color-stone-200)] bg-white text-[var(--color-stone-700)] hover:border-[#ED7926]/50 hover:bg-[#ED7926]/5")
            }
          >
            <span className="truncate">{sound.label}</span>
            <span className="shrink-0 text-[#0973BA]">▶ Dinle</span>
          </button>
        ))}
      </div>
    </div>
  );
}
