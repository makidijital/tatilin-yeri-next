import "server-only";

import { Pool, type PoolConfig } from "pg";

/* ===============================================================
   🛡️ NATIVE POSTGRESQL — CONNECTION POOL (server-only)
   ===============================================================
   AMAÇ:
     PostgreSQL'e DOĞRUDAN bağlantı (tek sürücü: pg). Tek `pg.Pool`
     singleton; tüm veri erişimi buradan geçer. Tek app rolü
     (bağlantı string'indeki kullanıcı); RLS yok.

   ⚠️ `import "server-only"`:
     `pg` yalnız Node runtime'ında çalışır (browser'da yok). Bu modül
     client bundle'a sızarsa BUILD HATA. Native DB erişimi yalnız
     server (route handler / server component / *.server modülleri).

   ⚠️ LAZY INIT (build/SSR güvenli):
     Pool ilk `getPgPool()` çağrısında kurulur. `DATABASE_URL` eksikse
     YALNIZ çağrı anında throw eder; modül import'u throw ETMEZ →
     build ve import grafiği güvenli (s3StorageProvider ile aynı desen).

   ENV (server-only, runtime):
     DATABASE_URL            postgres://user:pass@host:5432/dbname
     PGSSLMODE               "require" | "verify-full" | (boş = SSL yok)
     PG_POOL_MAX             (default 10)
     PG_IDLE_TIMEOUT_MS      (default 30000)
     PG_CONNECT_TIMEOUT_MS   (default 10000)
   =============================================================== */

let pool: Pool | null = null;

function resolveSsl(): PoolConfig["ssl"] {
  const mode = (process.env.PGSSLMODE || "").trim().toLowerCase();
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full" || mode === "verify-ca") {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

function buildConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL tanımlı değil — native PostgreSQL bağlantısı için zorunlu (server-only)."
    );
  }
  return {
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
    ssl: resolveSsl(),
  };
}

/**
 * Lazy singleton `pg.Pool`. İlk çağrıda kurulur, sonrası cached.
 * Idle client hataları process'i düşürmesin diye pool 'error'
 * event'i yakalanır (loglanır, yeni bağlantı havuzdan alınır).
 */
export function getPgPool(): Pool {
  if (pool) return pool;
  const created = new Pool(buildConfig());
  created.on("error", (err: Error) => {
    console.error("[pg.pool] idle client error", err);
  });
  pool = created;
  return pool;
}

/**
 * Pool'u kapat (graceful shutdown / test teardown). Tekrar
 * `getPgPool()` çağrılırsa yeni pool kurulur.
 */
export async function closePgPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
