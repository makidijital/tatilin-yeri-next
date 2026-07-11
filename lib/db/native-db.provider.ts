import "server-only";

import type { QueryResultRow } from "pg";

import { getPgPool } from "./pg.client";

/* ===============================================================
   🛡️ POSTGRESQL DB PROVIDER (server-only)
   ===============================================================
   PostgreSQL veri erişim implementasyonu (tek sürücü: pg). Builder
   emülasyonu YOK, embed motoru YOK, ORM YOK — tek yol: parametreli
   ham SQL + fonksiyon çağrısı (RPC).

   KONTRAT:
     query          → çok satır; `{ data: rows, error }`
     queryOne       → tam 1 satır (0 veya >1 → error)
     queryMaybeOne  → 0 veya 1 satır (0 → data:null, >1 → error)
     rpc            → PostgreSQL fonksiyonu çağırır
                      (`SELECT * FROM fn(key => $n, ...)`).

   ⚠️ SONUÇ ZARFI: `{ data, error }` — kararlı sözleşme. Provider
     THROW ETMEZ; hatayı `error` alanına koyar.

   ⚠️ `import "server-only"`: `pg` yalnız server. Client bundle'a
     sızarsa BUILD HATA.

   ⚠️ TEK ROL — RLS YOK:
     Tek app rolüyle konuşur; ayrı yetki-rolü ayrımı ve RLS burada
     YOKTUR. Yetkilendirme uygulama katmanında yapılır — bu provider'ın
     sorumluluğu değil.
   =============================================================== */

/** DB hata zarfı. Standart PostgreSQL hata alanları (`code` = SQLSTATE,
 *  `details` = pg `detail`, `hint`) `Error`'a eklenir → caller'lar
 *  (ör. `error.code === "23505"`) değişmeden çalışır. */
export type DbError = Error & {
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/** Çok-satır sonuç zarfı `{ data, error }`. `count` yalnız sayım
 *  istendiğinde, `status` diagnostic amaçlı doldurulur. */
export type DbResult<T> = {
  data: T[] | null;
  error: DbError | null;
  count?: number | null;
  status?: number;
};

/** Tek-satır sonuç zarfı. */
export type DbSingleResult<T> = {
  data: T | null;
  error: DbError | null;
  status?: number;
};

/** DB seam kontratı — veri erişim yüzeyi. */
export interface NativeDbProvider {
  /** Parametreli ham SQL → çok satır. */
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbResult<T>>;

  /** Tam 1 satır bekler (0 veya >1 → error). */
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbSingleResult<T>>;

  /** 0 veya 1 satır (0 → data:null; >1 → error). */
  queryMaybeOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbSingleResult<T>>;

  /** PostgreSQL fonksiyon çağrısı (named-arg). */
  rpc<T extends QueryResultRow = QueryResultRow>(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<DbResult<T>>;

  /** Statement'ı çalıştırır, ETKİLENEN satır sayısını döndürür
   *  (DELETE/UPDATE sayımı; RETURNING gerektirmez). */
  affectedCount(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ count: number | null; error: Error | null }>;
}

/* SQL identifier guard — fonksiyon/argüman adları koddan gelen sabitler,
   yine de defensive: yalnız [A-Za-z_][A-Za-z0-9_]* kabul edilir
   (parametreler zaten $n ile parametrelenir; identifier'lar quote
   edilemeyeceği için doğrulanır). */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** pg hatasını `DbError`'a çevirir: PostgreSQL `code`/`detail`/`hint`
 *  alanlarını (varsa) `code`/`details`/`hint` olarak yüzeye taşır. */
function toError(err: unknown): DbError {
  const base = err instanceof Error ? err : new Error(String(err));
  const pg = base as { code?: string; detail?: string; hint?: string };
  const dbErr = base as DbError;
  dbErr.code = pg.code;
  dbErr.details = pg.detail ?? null;
  dbErr.hint = pg.hint ?? null;
  return dbErr;
}

async function runQuery<T extends QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<DbResult<T>> {
  try {
    const result = await getPgPool().query<T>(
      text,
      params ? (params as unknown[]) : undefined
    );
    return { data: result.rows, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export const nativeDbProvider: NativeDbProvider = {
  query: runQuery,

  async queryOne<T extends QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbSingleResult<T>> {
    const { data, error } = await runQuery<T>(text, params);
    if (error) return { data: null, error };
    const rows = data ?? [];
    if (rows.length === 0) {
      return { data: null, error: new Error("queryOne: satır bulunamadı (0)") };
    }
    if (rows.length > 1) {
      return {
        data: null,
        error: new Error(`queryOne: birden fazla satır (${rows.length})`),
      };
    }
    return { data: rows[0], error: null };
  },

  async queryMaybeOne<T extends QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbSingleResult<T>> {
    const { data, error } = await runQuery<T>(text, params);
    if (error) return { data: null, error };
    const rows = data ?? [];
    if (rows.length === 0) return { data: null, error: null };
    if (rows.length > 1) {
      return {
        data: null,
        error: new Error(`queryMaybeOne: birden fazla satır (${rows.length})`),
      };
    }
    return { data: rows[0], error: null };
  },

  async rpc<T extends QueryResultRow>(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<DbResult<T>> {
    if (!IDENT_RE.test(fn)) {
      return { data: null, error: new Error(`rpc: geçersiz fonksiyon adı "${fn}"`) };
    }
    const entries = Object.entries(args ?? {});
    const params: unknown[] = [];
    const named: string[] = [];
    for (const [key, value] of entries) {
      if (!IDENT_RE.test(key)) {
        return { data: null, error: new Error(`rpc: geçersiz argüman adı "${key}"`) };
      }
      params.push(value);
      named.push(`${key} => $${params.length}`);
    }
    const text = `SELECT * FROM ${fn}(${named.join(", ")})`;
    return runQuery<T>(text, params);
  },

  async affectedCount(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ count: number | null; error: Error | null }> {
    try {
      const result = await getPgPool().query(
        text,
        params ? (params as unknown[]) : undefined
      );
      return { count: result.rowCount, error: null };
    } catch (err) {
      return { count: null, error: toError(err) };
    }
  },
};

/** DB provider (tek app rolü). */
export const dbNative = nativeDbProvider;
