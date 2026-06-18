"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import BlogPostForm, { type BlogFormInitial } from "../BlogPostForm";

/* ===============================================================
   🛡️ Blog — Yazı Düzenle (admin). GET /api/admin/blog/[id] → form.
   pages [id] deseni (client fetch + form). edit mode wrapper.
   =============================================================== */
export default function EditBlogPost() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [initial, setInitial] = useState<BlogFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await adminFetch(`/api/admin/blog/${id}`);
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: BlogFormInitial;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.data) {
          setError(json.error || "Kayıt yüklenemedi");
          return;
        }
        setInitial(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Yükleme hatası");
      }
    })();
  }, [id]);

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">İçerik</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Blog yazısını düzenle
        </h1>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !initial ? (
        <div className="flex items-center gap-2 text-[var(--color-stone-500)]">
          <Loader2 size={16} className="animate-spin" />
          Yükleniyor…
        </div>
      ) : (
        <BlogPostForm mode="edit" initial={initial} />
      )}
    </div>
  );
}
