import "server-only";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

import type { StorageProvider } from "./storage.provider";
import type {
  StorageRemoveResult,
  StorageSignedUrlResult,
  StorageUploadOptions,
  StorageUploadResult,
} from "./storage.types";
import { resolveCdnPublicUrl } from "./cdn.config";

/* ===============================================================
   🛡️ FAZ C / ADIM 1 — S3-COMPATIBLE STORAGE PROVIDER (server-only)
   ===============================================================
   AMAÇ:
     Provider-agnostic WRITE/REMOVE katmanı (R2 / AWS S3 / B2 / MinIO /
     Hetzner — hepsi aynı S3 API). YALNIZ server tarafında kullanılır
     (route handler'lar). Secret (`S3_SECRET_ACCESS_KEY`) NEXT_PUBLIC
     DEĞİL → client bundle'a sızmaz; `import "server-only"` ile
     build-time guard.

   ⚠️ ADIM 1 KAPSAMI — ALTYAPI, DORMANT:
     Bu dosya HİÇBİR yere bağlı değil. Hiçbir mevcut ekran/akış bunu
     çağırmaz. `storageProvider` (barrel) AYNEN Supabase'de
     (upload/remove). Sistem %100 Supabase çalışmaya devam eder.
     Bağlama (seam switch) sonraki adımda yapılacak.

   ⚠️ LAZY INIT:
     S3Client yalnız ilk gerçek upload/remove çağrısında kurulur
     (getClient). Env eksikse YALNIZ çağrı anında throw eder; modül
     yüklenmesi (import) throw ETMEZ → build/SSR güvenli.

   ENV (server-only, runtime):
     S3_ENDPOINT           (R2: https://<acct>.r2.cloudflarestorage.com)
     S3_REGION             (R2: "auto")
     S3_ACCESS_KEY_ID
     S3_SECRET_ACCESS_KEY

   ⚠️ DAVRANIŞ PARİTESİ (supabase-storage.provider ile):
     remove → bulk + 3 attempt + exponential backoff (200ms/400ms) +
              idempotent ("not found" / eksik key success sayılır).
     upload → result envelope; throw etmez.
   =============================================================== */

const REMOVE_MAX_ATTEMPTS = 3;
const REMOVE_BASE_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint) {
    throw new Error("S3_ENDPOINT env değişkeni tanımlı değil (server-only)");
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY env değişkenleri tanımlı değil (server-only)"
    );
  }

  cachedClient = new S3Client({
    region,
    endpoint,
    /* R2 + custom endpoint → path-style en güvenli. */
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

/* Body'yi S3 SDK'nın güvenle kabul ettiği Uint8Array'e normalize et.
   Interface body tipi: Blob | ArrayBuffer | Uint8Array. */
async function toUint8Array(
  body: Blob | ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  /* Blob (veya arrayBuffer() destekleyen herhangi bir nesne). */
  const ab = await (body as Blob).arrayBuffer();
  return new Uint8Array(ab);
}

/* ===============================================================
   🛡️ R2 BOUNDARY — LOGICAL → PHYSICAL BUCKET MAPPING
   ===============================================================
   Bucket adları kodun her yerinde MANTIKSAL kalır ("site-assets" /
   "villa-images"). R2/S3 fiziksel bucket adları yeniden adlandırıldı
   (yazvillam-*). Bu çeviri YALNIZ burada — S3 komutuna `Bucket`
   verilmeden hemen önce — uygulanır.

   ⚠️ KAPSAM: Sadece write/remove (PutObject/DeleteObjects). READ
   (getPublicUrl → CDN) MANTIKSAL isimle kalır; CDN domain bazlı,
   bucket adı path'te yok → çeviri uygulanmaz. Supabase provider,
   allow-list'ler, storage.constants AYNEN korunur.

   ENV-OVERRIDE (server-only; secret değil): tanımlıysa env kazanır,
   yoksa fiziksel default kullanılır, bilinmeyen bucket pass-through.
     S3_BUCKET_SITE_ASSETS   (default: yazvillam-site-assets)
     S3_BUCKET_VILLA_IMAGES  (default: yazvillam-villa-images)
   =============================================================== */
const R2_PHYSICAL_BUCKET_DEFAULTS: Record<string, string> = {
  "site-assets": "yazvillam-site-assets",
  "villa-images": "yazvillam-villa-images",
};

function toPhysicalBucket(bucket: string): string {
  const envOverride: Record<string, string | undefined> = {
    "site-assets": process.env.S3_BUCKET_SITE_ASSETS,
    "villa-images": process.env.S3_BUCKET_VILLA_IMAGES,
  };
  const override = envOverride[bucket]?.trim();
  if (override) return override;
  return R2_PHYSICAL_BUCKET_DEFAULTS[bucket] ?? bucket;
}

export const s3StorageProvider: StorageProvider = {
  /* ===============================================================
     UPLOAD — tek obje PUT
     ===============================================================
     ⚠️ upsert NOTU: S3 PUT default overwrite'tır (= upsert:true).
     `upsert:false` (galeri) için S3'te native fail-if-exists yok;
     galeri path'leri rand4 suffix taşıdığından collision ~1/65536 →
     overwrite-on-collision kabul edilebilir (audit'te MEDIUM olarak
     işaretliydi). ContentType + CacheControl iletilir.
  =============================================================== */
  async upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    try {
      const client = getClient();
      const Body = await toUint8Array(body);
      await client.send(
        new PutObjectCommand({
          Bucket: toPhysicalBucket(bucket),
          Key: path,
          Body,
          ContentType: options?.contentType,
          CacheControl: options?.cacheControl,
        })
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "S3 upload hatası";
      return { ok: false, error: msg };
    }
  },

  /* ===============================================================
     REMOVE — bulk delete + retry + idempotent
     ===============================================================
     S3 DeleteObjects eksik key'de hata vermez (idempotent). Kısmi
     hata `res.Errors` ile gelir; başarısız key'ler retry edilir.
     Davranış supabase-storage.provider.remove ile parite.
  =============================================================== */
  async remove(
    bucket: string,
    paths: string[]
  ): Promise<StorageRemoveResult> {
    if (!paths || paths.length === 0) {
      return { ok: true, failed: [], attempts: 0 };
    }
    const uniquePaths = Array.from(
      new Set(
        paths.filter((p) => typeof p === "string" && p.trim().length > 0)
      )
    );
    if (uniquePaths.length === 0) {
      return { ok: true, failed: [], attempts: 0 };
    }

    let pending = uniquePaths;
    let attempt = 0;
    let lastErrorMsg = "";

    while (attempt < REMOVE_MAX_ATTEMPTS && pending.length > 0) {
      attempt++;
      try {
        const client = getClient();
        const res = await client.send(
          new DeleteObjectsCommand({
            Bucket: toPhysicalBucket(bucket),
            Delete: {
              Objects: pending.map((Key) => ({ Key })),
              Quiet: true,
            },
          })
        );
        const errors = res.Errors ?? [];
        if (errors.length === 0) {
          return { ok: true, failed: [], attempts: attempt };
        }
        /* Yalnız hatalı key'leri tekrar dene. */
        pending = errors
          .map((e) => e.Key)
          .filter((k): k is string => typeof k === "string");
        lastErrorMsg =
          errors[0]?.Message || errors[0]?.Code || "S3 delete partial fail";
      } catch (err) {
        lastErrorMsg = err instanceof Error ? err.message : "S3 delete hatası";
      }
      if (attempt < REMOVE_MAX_ATTEMPTS && pending.length > 0) {
        await sleep(REMOVE_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }

    if (pending.length === 0) {
      return { ok: true, failed: [], attempts: attempt };
    }

    console.error("[storage.s3.remove] FAILED_AFTER_RETRY", {
      bucket,
      paths: pending,
      attempts: attempt,
      lastError: lastErrorMsg,
    });
    return { ok: false, failed: pending, attempts: attempt };
  },

  /* ===============================================================
     PUBLIC URL — read CDN (Faz B) ile aynı formül
     ===============================================================
     Bu provider read için kullanılmıyor (barrel getPublicUrl Faz B'de
     CDN-aware); yine de interface bütünlüğü için CDN base'e delege
     eder. STORAGE_DRIVER=supabase iken null döner.
  =============================================================== */
  getPublicUrl(bucket: string, path: string): string | null {
    return resolveCdnPublicUrl(bucket, path);
  },

  /* ===============================================================
     SIGNED URL — Adım 1'de NOT-IMPLEMENTED (caller yok; public bucket)
  =============================================================== */
  async createSignedUrl(
    _bucket: string,
    _path: string,
    _expiresIn: number
  ): Promise<StorageSignedUrlResult> {
    void _bucket;
    void _path;
    void _expiresIn;
    return {
      ok: false,
      error: "[storage.s3.createSignedUrl] NOT_IMPLEMENTED (Faz C Adım 1)",
    };
  },

  async exists(_bucket: string, _path: string): Promise<boolean> {
    void _bucket;
    void _path;
    throw new Error("[storage.s3.exists] NOT_IMPLEMENTED (Faz C Adım 1)");
  },
};
