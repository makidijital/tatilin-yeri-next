import { createBrowserClient } from "@supabase/ssr";

/* ===============================================================
   🛡️ SUPABASE ANON CLIENT — COMPAT ENTRY (SSR-AWARE)
   ===============================================================
   ⚠️ FAZ 2 — BROWSER CLIENT CUTOVER:
     Bu dosyanın **API yüzeyi** değişmedi — 36 caller'ın hiçbiri
     dokunulmaz:
       import { supabase } from "@/lib/supabase";
       supabase.from("villa").select("*")
       supabase.auth.signInWithPassword({ email, password })
       supabase.auth.onAuthStateChange(cb)
       supabase.storage.from(bucket).getPublicUrl(path)
       ...
     Hepsi BYTE-IDENTICAL davranır.

     Değişen TEK ŞEY: session storage layer.
       ESKI: localStorage (createClient default)
       YENİ: cookies   (createBrowserClient — @supabase/ssr)

     Cookie-backed session, faz 3'te middleware'e eklenecek
     `updateSession` helper sayesinde sunucu tarafına otomatik
     akar → RSC + route handler `cookies()` üzerinden authenticated
     kullanıcıyı görür → `auth.uid()` NULL olmaz → RLS doğru çalışır.

   ⚠️ BEKLENEN DAVRANIŞ DEĞIŞIKLIĞI:
     • Mevcut admin oturumları (localStorage'da kalan) **bir kerelik**
       geçersiz olur — herkes yeniden login olmak zorunda. Bu
       beklenen ve geri-dönüşsüz (localStorage'dan cookie'ye eski
       session taşınmaz).
     • Ondan sonraki tüm login akışları cookies'e yazar; davranış
       normal hale gelir.

   ⚠️ FAZ 4 KAPSAMI (BU TURDA YAPILMAYACAK):
     RSC ve route handler'ları henüz `@/lib/supabase/server`
     (createServerClient) kullanmıyor; "şu an" anon `db` server-side
     çağrıldığında cookie'leri kendi başına okumaz — eski silent
     anon davranış sürer. Migration faz 4'te dosya-bazlı yapılacak.
     Bu faz **sadece browser tarafının cookie-backed olmasını**
     sağlar — sunucu tarafının istemini Faz 3 middleware ile
     hazırlar.

   ⚠️ AdminSessionGuard MARKER COOKIE LOGIC:
     `admin-session=1` marker cookie ayrı bir mekanizma; middleware
     redirect hint'i için kullanılıyor. Bu cutover marker cookie
     logic'ini ETKİLEMEZ — paralel çalışır. `AdminSessionGuard`
     dokunulmadı; `onAuthStateChange` listener'ı `createBrowserClient`
     altında da aynı API ile tetiklenir.

   🛡️ TYPE SAFETY NOTE (legacy yorum — aynen korundu):
     types/database.ts içinde manuel yazılmış Database / Row / Insert /
     Update tipleri MEVCUT — ama `createBrowserClient<Database>()` ile
     generic bağlanmadı çünkü embed-select inference'ı strict;
     `select("*, related:other(field)")` pattern'i `never` dönüyor ve
     40+ sayfa kırılıyor. Client untyped kalır; service/resolver
     katmanı `RowOf<"villa">` tipi ile çalışır.

   ⚠️ SİNGLETON DAVRANISI:
     `createSupabaseBrowserClient()` (lib/supabase/client.ts) iç
     singleton tutar; bu modül onu çağırdığında aynı client referansı
     döner. Onun dışında bu modülün eski "module-level singleton"
     davranışı korunur — `supabase` import edilen her yerden aynı
     instance.
=============================================================== */

/* Direct createBrowserClient kullanıyoruz çünkü bu modül **default
   browser entry** — modül-yüklemesinde tek bir client oluşur, eski
   `createClient(...)` davranışıyla simetrik. lib/supabase/client.ts
   factory'sini import etmek yerine direct çağırıyoruz; modül başına
   bir kez (Node.js modül cache'i singleton garantili). */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
