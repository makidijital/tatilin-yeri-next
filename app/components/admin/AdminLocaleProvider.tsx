"use client";

/* ===============================================================
   🛡️ PHASE 12B — ADMIN LOCALE PROVIDER (Seçenek B: localStorage + Context)
   ===============================================================
   NEDEN B (cookie/middleware DEĞİL):
     - `app/(admin)/maki-admin/layout.tsx` ZATEN `"use client"` ve
       tüm admin sayfaları client component → Context doğal katman.
     - `middleware.ts` admin locale'i için DEĞİŞTİRİLMEDİ (Phase 11
       §14 "dokunulmaz" listesi korunur).
     - Migration / `admin_users` kolonu GEREKMEZ.
     - Public locale mimarisi (URL prefix `/en`, `/de` +
       `localeFromPathname`) TAMAMEN AYRI kalır — bu provider
       `(admin)` ağacının DIŞINDA hiçbir yerde mount edilmez.

   HYDRATION GÜVENLİĞİ (kritik):
     `useSyncExternalStore` kullanılır — React'in "dış store"
     primitifi. `getServerSnapshot` HER ZAMAN `DEFAULT_LOCALE`
     ("tr") döner, bu yüzden SSR HTML'i ile hydration render'ı
     BİREBİR aynıdır (mismatch uyarısı ÜRETİLMEZ). Hydration
     bittikten sonra React `getSnapshot`'ı okur ve kayıtlı tercih
     farklıysa yeniden render eder.
     `useEffect` + `setState` paterni BİLİNÇLİ olarak
     KULLANILMADI (cascading render + lint uyarısı).

   DAYANIKLILIK:
     localStorage private mode / kapalı storage / quota
     durumlarında throw edebilir → tüm erişimler try/catch içinde.
     Storage erişilemezse `memoryLocale` ile yalnız o oturum
     boyunca çalışır; UI çökmez, sessizce TR'den devam eder.

   ÇOK SEKMELİ KULLANIM:
     `storage` event'i dinlenir → başka sekmede yapılan dil
     değişimi bu sekmeye de yansır (ek maliyet yok).
   =============================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/get-dictionary";

/** localStorage anahtarı. Public taraf bu anahtarı OKUMAZ/YAZMAZ. */
export const ADMIN_LOCALE_STORAGE_KEY = "maki-admin-locale";

export type AdminLocaleContextValue = {
  locale: Locale;
  setLocale: (next: string) => void;
  /** `getDictionary(locale)` — locale değişmedikçe yeniden hesaplanmaz. */
  dictionary: Dictionary;
  /** Hydration tamamlandı mı? (sunucu snapshot'ında `false`) */
  ready: boolean;
};

/* ===============================================================
   MODÜL SEVİYESİ MİNİ STORE — React state'i DEĞİL, dış kaynak.
   =============================================================== */

const listeners = new Set<() => void>();

/** Storage erişilemediğinde kullanılan oturum-içi yedek. */
let memoryLocale: Locale = DEFAULT_LOCALE;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    /* `key === null` → storage.clear(); ilgili anahtar veya tümü. */
    if (event.key === null || event.key === ADMIN_LOCALE_STORAGE_KEY) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Client snapshot — `toLocale` güvenli sınırı: bozuk/eski/eksik
 *  değer DEFAULT_LOCALE'e düşer. Primitive döner → React'in
 *  `Object.is` karşılaştırması stabil. */
function readStoredLocale(): Locale {
  try {
    return toLocale(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY));
  } catch {
    /* storage kapalı/erişilemez → yalnız oturum belleği */
    return memoryLocale;
  }
}

/** Server/hydration snapshot — HER ZAMAN TR. */
function readDefaultLocale(): Locale {
  return DEFAULT_LOCALE;
}

function readReady(): boolean {
  return true;
}

function readNotReady(): boolean {
  return false;
}

function writeStoredLocale(next: string): void {
  const safe = toLocale(next);
  memoryLocale = safe;
  try {
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, safe);
  } catch {
    /* yazılamazsa seçim yalnız bu oturumda geçerli olur */
  }
  listeners.forEach((listener) => listener());
}

/* =============================================================== */

const AdminLocaleContext = createContext<AdminLocaleContextValue | null>(null);

/* Provider DIŞINDA kullanıldığında dönen SABİT fallback. Modül
   seviyesinde tanımlı → referansı her render'da aynı kalır.
   Throw ETMİYORUZ: admin component'lerinin provider'sız (örn.
   izole birim testi) render'ı Phase 12'deki TR davranışını aynen
   korumalı. */
const FALLBACK_VALUE: AdminLocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  dictionary: getDictionary(DEFAULT_LOCALE),
  ready: false,
};

export function AdminLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useSyncExternalStore(
    subscribe,
    readStoredLocale,
    readDefaultLocale
  );
  const ready = useSyncExternalStore(subscribe, readReady, readNotReady);

  const setLocale = useCallback((next: string) => {
    writeStoredLocale(next);
  }, []);

  const value = useMemo<AdminLocaleContextValue>(
    () => ({
      locale,
      setLocale,
      dictionary: getDictionary(locale),
      ready,
    }),
    [locale, setLocale, ready]
  );

  return (
    <AdminLocaleContext.Provider value={value}>
      {children}
    </AdminLocaleContext.Provider>
  );
}

/** Admin component'leri için locale + dictionary erişimi.
 *  Provider yoksa TR fallback döner (throw etmez). */
export function useAdminLocale(): AdminLocaleContextValue {
  return useContext(AdminLocaleContext) ?? FALLBACK_VALUE;
}
