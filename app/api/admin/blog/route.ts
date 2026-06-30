import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { blogServerRepository } from "@/lib/db/blog.repository.server";
import { sanitizeHtml } from "@/lib/html-sanitize";

/* ===============================================================
   🛡️ /api/admin/blog — BLOG CRUD partial (admin-only)
   ===============================================================
   GET   → admin list (DRAFT dahil — is_active filtresi YOK)
   POST  → blog_posts insert

   Pages CRUD route deseninin aynası: authorizeAdminCaller (Bearer) +
   dbAdmin (service-role, RLS bypass). body → sanitizeHtml (XSS).
   is_active=true ve published_at boşsa published_at=now() set edilir.
   pages/villa/reservation sistemlerine DOKUNMAZ.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — admin list (created_at DESC; draft + yayın hepsi). */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { data, error } = await blogServerRepository.listAll();

  if (error) {
    console.error("[admin.blog.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Listelenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data: data || [] });
}

/* POST — blog_posts insert. body sanitize + is_active→published_at. */
type BlogInsertInput = {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  body?: unknown;
  cover_image?: unknown;
  category?: unknown;
  author?: unknown;
  seo_title?: unknown;
  seo_description?: unknown;
  og_image?: unknown;
  is_active?: unknown;
};

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  let body: BlogInsertInput;
  try {
    body = (await req.json()) as BlogInsertInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const title = str(body.title);
  const slug = str(body.slug);
  if (!title || !slug) {
    return NextResponse.json(
      { ok: false, error: "Başlık ve slug zorunlu" },
      { status: 400 }
    );
  }

  const isActive = body.is_active === true;
  const payload = {
    title,
    slug,
    excerpt: str(body.excerpt),
    body: typeof body.body === "string" ? sanitizeHtml(body.body) : null,
    cover_image: str(body.cover_image),
    category: str(body.category),
    author: str(body.author),
    seo_title: str(body.seo_title),
    seo_description: str(body.seo_description),
    og_image: str(body.og_image),
    is_active: isActive,
    published_at: isActive ? new Date().toISOString() : null,
  };

  const { data, error } = await blogServerRepository.insert(payload);

  if (error) {
    console.error("[admin.blog.insert] FAILED", error.message);
    /* 23505 = unique slug çakışması */
    const dup = (error as { code?: string }).code === "23505";
    return NextResponse.json(
      {
        ok: false,
        error: dup
          ? "Bu slug zaten kullanılıyor"
          : error.message || "Eklenemedi",
      },
      { status: dup ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
