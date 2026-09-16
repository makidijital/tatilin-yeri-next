-- ============================================================================
-- Migration 083 — villa_translations: Accommodation Layout (Bedroom/Bathroom)
-- ============================================================================
-- PHASE 10E — Oda/banyo ADI çevirileri (EN/DE).
--
-- ADDITIVE ONLY. Mevcut migration'lar (082 dahil) DEĞİŞTİRİLMEDİ.
-- Mevcut kolonlara, verilere, constraint'lere ve trigger'lara DOKUNULMAZ.
--
-- NEDEN villa_translations (ayrı tablo DEĞİL):
--   • Grain zaten doğru: UNIQUE (villa_id, locale).
--   • Oda/banyo kayıtlarının STABİL BİR ID'Sİ YOK (villa.bedroom_layout /
--     villa.bathroom_layout saf JSONB array — bkz. migration 047), bu yüzden
--     FK'lı ayrı bir translation tablosu kurulamaz.
--   • Generic translation repository field-agnostic (`select("*")` +
--     `fields: Record<string, unknown>` spread) → repository'ye HİÇ
--     dokunulmadan yeni kolon çalışır.
--
-- VERİ ŞEKLİ (application layer'da doğrulanır —
--                lib/villa-layout-translation.helper.ts):
--   [
--     { "i": 0, "tr": "Ana Yatak Odası", "name": "Master Bedroom" },
--     { "i": 1, "tr": "Çocuk Odası",     "name": "Children's Bedroom" }
--   ]
--     i    → çeviri yazıldığı andaki TR layout index'i
--     tr   → çeviri yazıldığı andaki TR kaynak adı (DRIFT GUARD)
--     name → EN/DE karşılığı ("" = bu satır çevrilmemiş)
--
--   Dizi, TR layout'un POZİSYONEL AYNASIDIR: uzunluğu TR layout uzunluğuna
--   eşit olmalıdır. Çevrilmemiş satırlar `name: ""` ile yerini korur —
--   böylece hem kısmi çeviri mümkün olur hem de uzunluk karşılaştırması
--   anlamlı bir yapısal kontrol olarak kalır.
--
-- DRIFT KORUMASI (kritik — sessizce yanlış odaya çeviri bağlamak YASAK):
--   Okuma sırasında çeviri şu durumlarda KULLANILMAZ, TR'ye fallback edilir:
--     • dizi geçersiz/bozuk
--     • dizi uzunluğu ≠ TR layout uzunluğu   (oda/banyo sayısı değişmiş)
--     • herhangi bir kaydın `i` değeri pozisyonuyla uyuşmuyor
--     • kaydın `tr` değeri o anki TR adıyla birebir aynı değil (satır bazlı)
--
-- NULL SEMANTİĞİ: NULL = "bu locale için layout çevirisi girilmemiş"
--   → public tarafta TR fallback (migration 047'nin NULL semantiği ile aynı).
--
-- INDEX YOK: bu kolonlarla query/sort/filter yapılmaz (saklama amaçlı).
-- CHECK constraint YOK: JSON şema doğrulaması application layer'da
--   (082'deki diğer çeviri kolonlarıyla aynı ilke).
-- TRIGGER YOK: villa_translations_touch_updated_at (082) zaten satır
--   seviyesinde çalışıyor, yeni kolon otomatik kapsanır.
--
-- ⚠️ BU MIGRATION HENÜZ PROD/DB ÜZERİNDE ÇALIŞTIRILMADI — yalnız dosya
--    olarak hazırlandı (Phase 10E Batch 1 görev tanımı).
-- ============================================================================

alter table public.villa_translations
  add column if not exists bedroom_layout jsonb,
  add column if not exists bathroom_layout jsonb;

comment on column public.villa_translations.bedroom_layout is
  'Oda adı çevirileri. Shape: [{i, tr, name}]. i=TR index, tr=source TR name, name=translated name.';

comment on column public.villa_translations.bathroom_layout is
  'Banyo adı çevirileri. Shape: [{i, tr, name}]. i=TR index, tr=source TR name, name=translated name.';

-- Rollback:
-- alter table public.villa_translations drop column if exists bedroom_layout;
-- alter table public.villa_translations drop column if exists bathroom_layout;
