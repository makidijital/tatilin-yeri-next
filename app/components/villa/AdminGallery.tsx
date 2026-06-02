"use client";

import { useRef, useState } from "react";
import { storageProvider } from "@/lib/storage";

/* ===============================================================
   🛡️ UPLOAD SIZE GUARD — production hardening
   ===============================================================
   8 MB per-file cap. Gerekçe:
     • Modern DSLR / akıllı telefon yüksek-çözünürlük JPEG 3-6 MB
     • Pro / RAW / 8K source dosyalar bu sınırın üstünde (admin
       gönderirse browser canvas pipeline kasar — `convertToWebP`
       `createImageBitmap` üzerinde 50+ MB image dekoderi browser'ı
       freeze edebilir, mobile admin için kritik)
     • Client-side WebP dönüşümü zaten %50-70 küçültür; admin
       genelde 5-10 MB kaynak dosya yükler → 1-3 MB WebP elde eder
     • 8 MB üst sınır production "kazara dev dosya seçti" tipi
       hatalar için yeterli; gerçek kullanım %99 altında kalır

   Limit aşıldığında: pre-validation, `convertToWebP`/upload başlatma
   YOK; admin'e açıkça bildir (mevcut `alert(...)` UX pattern'i;
   line 107 villaId guard'ı ile aynı). 10 dosyalık batch'te
   bazıları büyükse: valid'ler devam eder, büyükler skip, kullanıcıya
   hangileri olduğu liste halinde söylenir.
=============================================================== */
const MAX_UPLOAD_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_UPLOAD_FILE_SIZE_LABEL = "8 MB";
import {
  updateImageOrder,
  setCoverImage,
  type VillaImage,
} from "@/app/services/villa-image.service";
import {
  VILLA_IMAGES_BUCKET,
  buildVillaImagePath,
  nextGallerySequenceFromUrls,
} from "@/lib/villa-image.helpers";

/* ===============================================================
   🛡️ ADMIN GALLERY — villa image upload + reorder + cover toggle
   ===============================================================
   STORAGE PATH SOURCE-OF-TRUTH (Faz 7 refactor):
     Path üretimi artık `lib/villa-image.helpers` üzerinden.
     Yeni format: villas/{slug}__{shortId}/gallery-NNNN-XXXX.webp
     Eski format hala okunabilir (read backward-compat); yeni
     upload yeni klasöre düşer.

   ORPHAN PREVENTION:
     Upload başarılı + DB insert başarısız ise storage dosyası
     temizlenir. `onUploaded` artık `Promise<boolean | void>`
     döndürebilir; `false` döndürürse rollback tetiklenir.
     Backward-compat: `void`/`undefined` → eski davranış (başarı
     varsayımı). Hiçbir caller bozulmaz.
   =============================================================== */

type Props = {
  /* 🛡️ Faz 9 hardening: `images: any[]` → `VillaImage[]`. Service
     katmanından gelen row tipi (id, villa_id, image_url, ...).
     Caller `getVillaImages` zaten bu tipi döndürüyordu. */
  images: VillaImage[];
  villaId: string;
  /** 🛡️ Yeni: villa slug — readable storage folder için.
   *  Opsiyonel (geriye dönük uyum); verilmezse "villa" generic slug
   *  kullanılır, shortId yine villa.id'den deterministik. */
  villaSlug?: string | null;
  /** DB insert sonucu. `false` → AdminGallery storage rollback yapar.
   *  `void`/`undefined`/`true` → başarı varsayımı (mevcut davranış). */
  onUploaded: (url: string) => Promise<boolean | void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: () => Promise<void>;
};

export default function AdminGallery({
  images,
  villaId,
  villaSlug = null,
  onUploaded,
  onDelete,
  onReorder,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔥 DEBUG (çok önemli)
  console.log("🚀 villaId:", villaId);

  function handleClick() {
    inputRef.current?.click();
  }

  // 🔥 WEBP + resize
  async function convertToWebP(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);

    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / bitmap.width);

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context alınamadı");

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("WebP dönüşüm başarısız"));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        0.8
      );
    });
  }

  // 🔥 upload
  async function handleFiles(files: FileList | null) {
    if (!files) return;

    // 🚨 GUARD (en kritik)
    if (!villaId || villaId === "undefined") {
      console.error("❌ villaId YOK → upload iptal");
      alert("Villa ID bulunamadı");
      return;
    }

    /* 🛡️ SIZE VALIDATION — pre-convert, pre-upload.
       Per-file 8 MB cap (üst yorum bloğu gerekçe). Geçersiz dosyalar
       skip edilir; geçerliler kalan akışa devam eder. Tüm batch iptal
       edilmez — admin'in 10 valid + 2 büyük dosya seçimi 10 dosyayı
       yükler, 2'sini bildirip atlar.

       NOT: client-side `<input accept="image/*">` MIME tipini
       filter'lar; ek mime guard eklemiyoruz (admin trust + browser
       filter yeterli; sunucu tarafı Supabase upload'ı `image/webp`
       contentType ile zorlar). */
    const allFiles = Array.from(files);
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];

    for (const file of allFiles) {
      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / 1024 / 1024).toFixed(1);
        oversizedFiles.push(`• ${file.name} (${sizeMb} MB)`);
      } else {
        validFiles.push(file);
      }
    }

    if (oversizedFiles.length > 0) {
      /* 🛡️ Mevcut UX pattern (line 107 villaId guard'ı) `alert(...)`.
         Inline error UI yerine alert tercihi — minimal-diff +
         component'te toast helper henüz wired değil. */
      alert(
        `Aşağıdaki dosyalar ${MAX_UPLOAD_FILE_SIZE_LABEL} sınırını aştığı için yüklenmedi:\n\n` +
          oversizedFiles.join("\n") +
          `\n\nLütfen dosyaları küçültüp tekrar deneyin.`
      );
    }

    if (validFiles.length === 0) {
      /* Hiç geçerli dosya yok → loading state'e girmeden çık. */
      return;
    }

    setLoading(true);

    try {
      /* 🛡️ NEW PATH STRATEGY (Faz 7):
         Path: villas/{slug}__{shortId}/gallery-NNNN-XXXX.webp
         - shortId: villa.id ilk 8 hex (deterministic, stable).
         - Slug: readability; folder slug değişse bile RENAME edilmez.
         - NNNN: villa-içi monotonik seq; mevcut dosyaların max+1'i.
         - XXXX: race koruması (concurrent upload).

         Eski kayıtlar farklı path'te (uuid/uuid.webp) — DB'de full URL
         tuttuğumuz için reads etkilenmez; bu döngü yalnız YENİ
         uploadların pathini değiştirir. */
      const existingUrls = images.map((i) => i?.image_url as string | null);
      let seq = nextGallerySequenceFromUrls(existingUrls);

      for (const file of validFiles) {
        const blob = await convertToWebP(file);

        const villaForPath = { id: villaId, slug: villaSlug };
        const fileName = buildVillaImagePath(villaForPath, seq, "webp");

        /* 🛡️ upsert: false — yeni path artık deterministik prefix +
           rand4 suffix kullandığı için file collision riski 1/65536.
           Çakışırsa bu yükleme atlanır; user retry → fresh rand4 ile
           dener. Race koruması yeterli.
           FAZ 38: storageProvider.upload delege. */
        const upRes = await storageProvider.upload(
          VILLA_IMAGES_BUCKET,
          fileName,
          blob,
          { contentType: "image/webp", upsert: false }
        );

        if (!upRes.ok) {
          console.error("❌ Upload error:", upRes.error);
          // Seq'i ilerletmeyelim; bir sonraki dosyada aynı seq tekrar
          // denensin (filename'deki random suffix farklı olacak).
          continue;
        }

        const publicUrl = storageProvider.getPublicUrl(
          VILLA_IMAGES_BUCKET,
          fileName
        );

        /* 🛡️ ORPHAN PREVENTION:
           onUploaded → addVillaImage → DB insert. Eski signature
           Promise<void> idi; artık opsiyonel boolean kabul ediyor
           (backward-compat). `false` dönerse storage rollback yapıp
           bir sonraki dosyaya geçiyoruz.
           FAZ 38: storageProvider.remove delege (retry + idempotent
           provider içinde). */
        const dbResult = await onUploaded(publicUrl || "");
        if (dbResult === false) {
          console.error("❌ DB insert failed; rolling back storage:", fileName);
          try {
            await storageProvider.remove(VILLA_IMAGES_BUCKET, [fileName]);
          } catch (rollbackErr) {
            console.error("❌ storage rollback failed:", rollbackErr);
          }
          continue;
        }

        // Başarılı → bir sonraki dosya için seq +1
        seq++;
      }
    } catch (err) {
      console.error("🔥 Upload pipeline error:", err);
    } finally {
      setLoading(false);
    }
  }

  // 🔥 drag reorder
  async function handleDrop(dropIndex: number) {
    if (dragIndex === null) return;

    const updated = [...images];
    const dragged = updated[dragIndex];

    updated.splice(dragIndex, 1);
    updated.splice(dropIndex, 0, dragged);

    const payload = updated.map((img, i) => ({
      id: img.id,
      sort_order: i,
    }));

    await updateImageOrder(payload);
    await onReorder();
  }

  return (
    <div className="space-y-6">
      {/* 🔥 UPLOAD BOX */}
      <div
        onClick={handleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-gray-400 rounded-xl p-10 text-center cursor-pointer hover:border-black transition"
      >
        <p className="text-sm text-gray-600">
          {loading ? "Yükleniyor..." : "Sürükle bırak veya tıkla"}
        </p>
        {/* 🛡️ Upload size hint — mevcut dashed-box stiliyle uyumlu;
           küçük, ikincil renkte. Admin gözüne çarpacak kadar görünür,
           UX'i bozmaz. */}
        <p className="text-xs text-gray-400 mt-2">
          Maksimum dosya boyutu: {MAX_UPLOAD_FILE_SIZE_LABEL}
        </p>
      </div>

      {/* 🔥 INPUT */}
      <input
        type="file"
        ref={inputRef}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        accept="image/*"
        multiple
      />

      {/* 🔥 GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((img, index) => (
          <div
            key={img.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="relative group border rounded-xl overflow-hidden cursor-move"
          >
            <img
              src={img.image_url}
              className="w-full h-40 object-cover"
            />

            {/* 🔥 COVER */}
            {img.is_cover && (
              <span className="absolute top-2 left-2 bg-black text-white text-xs px-2 py-1 rounded">
                Kapak
              </span>
            )}

            {/* 🔥 ACTIONS */}
            <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={async () => {
  await setCoverImage(img.id, img.villa_id);
  await onReorder(); // 🔥 UI anında güncellenir
}}
                className="flex-1 bg-white text-xs py-1 rounded hover:bg-gray-200"
              >
                Kapak
              </button>

              <button
                onClick={() => onDelete(img.id)}
                className="flex-1 bg-red-500 text-white text-xs py-1 rounded hover:bg-red-600"
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}