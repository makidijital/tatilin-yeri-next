import { faqRepository } from "@/lib/db/faq.repository";

/* ===============================================================
   🛡️ FAQ SERVICE — Global Site Frequently Asked Questions
   ===============================================================
   Pattern: rule-item.service / price-include-item.service ile
   aynı architectural feel — master CRUD; ancak FAQ "global"
   olduğu için villa-bağımsız (parent yok).

   USE CASES:
     - Admin /maki-admin/faqs sayfası: getFaqsForAdmin → form
       → replaceFaqs (DELETE+INSERT atomic pattern)
     - Public homepage: getFaqs (cached via getCachedFaqs)
       → accordion render
     - JSON-LD (SEO): aynı data buildFaqJsonLd'a verilir

   CACHE:
     - getFaqs sonuçları `getCachedFaqs` (cache.helpers) ile tag
       "faqs" altında cache'lenir
     - Admin replaceFaqs sonrası revalidateFaqs() invalidate eder

   BACKWARD-COMPAT:
     - Yeni tablo, eski sistem etkilenmez
     - Boş tabloda getFaqs → [] döner, homepage FAQ section
       render edilmez (caller `if (faqs.length === 0)`)
   =============================================================== */

/** Public/admin'in tükettiği minimum FAQ shape. */
export type Faq = {
  id: string;
  question: string;
  answer: string;
};

/** Admin form input — id YOK (replace-all save pattern). */
export type FaqInput = {
  question: string;
  answer: string;
};

const MAX_FAQS = 15;

/* ---------------------------------------------------------------
   📦 GET (public) — yalnız aktif FAQ'lar, sort_order ASC
   ---------------------------------------------------------------
   Homepage cached read path'i. getCachedFaqs bu fonksiyonu sarar.
*/
export async function getFaqs(): Promise<Faq[]> {
  /* FAZ 40: faqRepository delege. */
  const { data, error } = await faqRepository.findActive();

  if (error) {
    console.error("[faq.get] failed:", error.message);
    return [];
  }
  type Row = { id: string; question: string; answer: string };
  return ((data || []) as Row[]).map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
  }));
}

/* ---------------------------------------------------------------
   📦 GET (admin) — tüm FAQ'lar (is_active filtre yok)
   ---------------------------------------------------------------
   Admin formu burada yönetir. Şu an is_active için UI toggle
   yok — replaceFaqs hepsini is_active=true yazıyor. İleride
   "Pasifleştir" toggle'ı eklenirse bu fonksiyon dokunulmaz.
*/
export async function getFaqsForAdmin(): Promise<Faq[]> {
  /* FAZ 40: faqRepository delege. */
  const { data, error } = await faqRepository.findAllForAdmin();

  if (error) {
    console.error("[faq.adminGet] failed:", error.message);
    return [];
  }
  type Row = { id: string; question: string; answer: string };
  return ((data || []) as Row[]).map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
  }));
}

/* ---------------------------------------------------------------
   💾 REPLACE ALL — DELETE + bulk INSERT
   ---------------------------------------------------------------
   Admin save flow. Pattern villa relations'taki RPC pattern'inin
   JS-side eşdeğeri (FAQ global olduğu için parent_id RPC argümanı
   yok). Atomik DEĞİL (DELETE+INSERT iki ayrı statement); ancak:
     - Admin save frekansı çok düşük (günde 1-5)
     - Tek admin tek seferde yazıyor (concurrent risk minimal)
     - Worst case: DELETE OK + INSERT FAIL → tablo boş, admin
       retry'da düzeltir. UX'i bozar ama veri kaybı yok (admin
       form state'inde yine var).

   FİLTRELEME:
     - question / answer trim
     - Boş satırlar (her ikisi de boş veya tek tarafı boş) drop
     - Max 15 (UI'da da enforce edilir, defansif backend guard)

   sort_order: array index → DB'de doğal sıra
   is_active: true (UI'da toggle yok şu an)
*/
export async function replaceFaqs(
  items: FaqInput[]
): Promise<{ ok: boolean; error?: string }> {
  /* Sanitize + filter empty */
  const clean = (items || [])
    .map((i) => ({
      question: (i?.question ?? "").trim(),
      answer: (i?.answer ?? "").trim(),
    }))
    .filter((i) => i.question.length > 0 && i.answer.length > 0);

  if (clean.length > MAX_FAQS) {
    return {
      ok: false,
      error: `En fazla ${MAX_FAQS} SSS kaydedilebilir.`,
    };
  }

  /* DELETE all — Supabase WHERE şart; `not("id","is",null)` =
     "id IS NOT NULL" = tüm satırlar. */
  /* FAZ 40: faqRepository delege. */
  const { error: delErr } = await faqRepository.deleteAll();

  if (delErr) {
    console.error("[faq.replace] delete failed:", delErr.message);
    return { ok: false, error: delErr.message };
  }

  /* Boş payload → DELETE sonrası tablo boş kalır, INSERT atlanır */
  if (clean.length === 0) {
    return { ok: true };
  }

  const payload = clean.map((c, idx) => ({
    question: c.question,
    answer: c.answer,
    sort_order: idx,
    is_active: true,
  }));

  const { error: insErr } = await faqRepository.insertMany(payload);
  if (insErr) {
    console.error("[faq.replace] insert failed:", insErr.message);
    return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

/* ---------------------------------------------------------------
   🗑 DELETE single — admin'in tek satır silmesi için (opsiyonel)
   ---------------------------------------------------------------
   replaceFaqs DELETE+INSERT pattern'i tek save'de tüm değişimleri
   yansıttığı için bu helper UI tarafından doğrudan çağrılmıyor;
   ancak future use cases (örn. "bulk delete" admin toolu) için
   service katmanında hazır.
*/
export async function deleteFaq(id: string): Promise<boolean> {
  if (!id) return false;
  const { error } = await faqRepository.deleteById(id);
  if (error) {
    console.error("[faq.delete] failed:", error.message);
    return false;
  }
  return true;
}
