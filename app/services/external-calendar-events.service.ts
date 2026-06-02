import { supabase } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";

/* ===============================================================
   🛡️ FAZ 56G — EXTERNAL CALENDAR EVENTS (admin read-only)
   ===============================================================
   /maki-admin/external-reservations admin ekranı için listeleme +
   KPI helper'ları. RLS authenticated SELECT zaten açık (migration
   029) → admin browser session JWT ile direct okur. Anon erişim
   YOK.

   READ-ONLY contract:
     • Bu service yalnız SELECT yapar.
     • INSERT/UPDATE/DELETE policy YOK (sync pipeline service-role
       sorumluluğu — admin client buradan yazamaz).
     • External event'ler reservation lifecycle'a hiç bağlanmaz;
       payment/mail/status pipeline tetiklenmez.

   EMBED:
     external_calendar_events
       └── source: external_calendar_sources (source_name, is_active,
                                              last_success_at, last_error)
       └── villa:  villa (id, title, slug)
=============================================================== */

export type ExternalEventListItem = {
  id: string;
  villa_id: string;
  source_id: string;
  external_uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  status: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  source: {
    id: string;
    source_name: string;
    is_active: boolean | null;
    last_success_at: string | null;
    last_error: string | null;
  } | null;
  villa: {
    id: string;
    title: string | null;
    slug: string | null;
  } | null;
};

export type ExternalEventListFilters = {
  villa_id?: string;
  source_id?: string;
  is_active?: boolean | null;
  /** ISO date YYYY-MM-DD; overlap filter: start_date < to AND end_date > from */
  from?: string | null;
  to?: string | null;
  /** summary veya villa title substring */
  search?: string | null;
  limit?: number;
  offset?: number;
};

export type ExternalEventListResult = {
  items: ExternalEventListItem[];
  total: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listExternalCalendarEvents(
  filters: ExternalEventListFilters = {}
): Promise<ExternalEventListResult> {
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number(filters.limit) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(filters.offset) || 0);

  let q = supabase
    .from("external_calendar_events")
    .select(
      `id, villa_id, source_id, external_uid,
       start_date, end_date, summary, status, is_active,
       last_seen_at, created_at,
       source:source_id ( id, source_name, is_active,
                          last_success_at, last_error ),
       villa:villa_id ( id, title, slug )`,
      { count: "exact" }
    )
    .order("start_date", { ascending: true })
    .range(offset, offset + limit - 1);

  if (filters.villa_id) q = q.eq("villa_id", filters.villa_id);
  if (filters.source_id) q = q.eq("source_id", filters.source_id);
  if (typeof filters.is_active === "boolean") {
    q = q.eq("is_active", filters.is_active);
  }
  /* Overlap filter: range [from, to) — half-open. */
  if (filters.from) q = q.gt("end_date", filters.from);
  if (filters.to) q = q.lt("start_date", filters.to);
  /* Search: summary contains substring (case-insensitive).
     Villa title search'i client-side filter ile yapacağız çünkü
     PostgREST embed üzerinde ilike şu an güvenilir çalışmıyor. */
  if (filters.search && filters.search.trim()) {
    q = q.ilike("summary", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await q;
  if (error) {
    console.error("[external-calendar-events.list] FAILED", error.message);
    return { items: [], total: 0 };
  }

  /* Embed-select TS narrowing — Supabase returns unknown shape. */
  const items = ((data as unknown) as ExternalEventListItem[]) || [];
  return { items, total: count ?? 0 };
}

/* ===============================================================
   KPI — admin ekran header kartları
=============================================================== */
export type ExternalCalendarKpi = {
  activeEventsCount: number;
  activeSourcesCount: number;
  lastSuccessAt: string | null;
  errorSourcesCount: number;
};

export async function getExternalCalendarKpi(): Promise<ExternalCalendarKpi> {
  /* Tek round-trip yerine 4 paralel head-count query — minimal payload. */
  const [eventsRes, activeSourcesRes, errorSourcesRes, latestSourceRes] =
    await Promise.all([
      supabase
        .from("external_calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("external_calendar_sources")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("external_calendar_sources")
        .select("id", { count: "exact", head: true })
        .not("last_error", "is", null),
      supabase
        .from("external_calendar_sources")
        .select("last_success_at")
        .not("last_success_at", "is", null)
        .order("last_success_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  return {
    activeEventsCount: eventsRes.count ?? 0,
    activeSourcesCount: activeSourcesRes.count ?? 0,
    errorSourcesCount: errorSourcesRes.count ?? 0,
    lastSuccessAt:
      (latestSourceRes.data as { last_success_at: string | null } | null)
        ?.last_success_at ?? null,
  };
}

/* ===============================================================
   FILTER OPTIONS — villa + source selector listeleri
   Hafif: yalnız id+name; admin select'lerinde dropdown.
=============================================================== */
export type FilterOption = { id: string; label: string; is_active?: boolean };

export async function getExternalCalendarFilterOptions(): Promise<{
  villas: FilterOption[];
  sources: FilterOption[];
}> {
  const [villasRes, sourcesRes] = await Promise.all([
    /* Yalnız external event'i olan villaları getirmek için DISTINCT
       gerekir; alternatif olarak tüm aktif villaları çekmek daha
       basit ama dropdown'ı kalabalıklaştırır. İlk PR'da basit yol:
       Yalnız external_calendar_sources'ı olan villaları join'le. */
    supabase
      .from("external_calendar_sources")
      .select("villa:villa_id ( id, title )")
      .eq("is_active", true),
    /* FAZ 56G+ — is_active da çekilir → "Pasifleri Temizle" buton'unun
       enable/disable kararında kullanılır. Aktif kaynaklar purge edilemez. */
    supabase
      .from("external_calendar_sources")
      .select("id, source_name, is_active, villa:villa_id ( title )")
      .order("source_name", { ascending: true }),
  ]);

  type VillaRow = { villa: { id: string; title: string | null } | null };
  type SourceRow = {
    id: string;
    source_name: string;
    is_active: boolean | null;
    villa: { title: string | null } | null;
  };

  const villaMap = new Map<string, FilterOption>();
  for (const r of ((villasRes.data as unknown) as VillaRow[]) || []) {
    const v = r?.villa;
    if (v?.id) {
      villaMap.set(v.id, { id: v.id, label: v.title || v.id });
    }
  }

  const sources: FilterOption[] = (
    ((sourcesRes.data as unknown) as SourceRow[]) || []
  ).map((s) => ({
    id: s.id,
    label:
      s.source_name +
      (s.villa?.title ? " · " + s.villa.title : ""),
    is_active: s.is_active ?? true,
  }));

  return {
    villas: Array.from(villaMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "tr")
    ),
    sources,
  };
}

/* ===============================================================
   🛡️ FAZ 56G+ — INACTIVE EVENT COUNT (per source)
   ===============================================================
   "Pasifleri Temizle (N)" buton label'ı için. authenticated SELECT
   (RLS migration 029'da açık) → admin client doğrudan head-count
   query'si atar. */
export async function countInactiveEventsForSource(
  sourceId: string
): Promise<number> {
  const id = (sourceId || "").toString().trim();
  if (!id) return 0;
  const { count, error } = await supabase
    .from("external_calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("source_id", id)
    .eq("is_active", false);
  if (error) {
    console.warn(
      "[external-calendar-events.countInactive] FAILED",
      error.message
    );
    return 0;
  }
  return count ?? 0;
}

/* ===============================================================
   🛡️ FAZ 56G+ — PURGE INACTIVE (source-scoped, hard delete)
   ===============================================================
   YALNIZ:
     source.is_active = false   (kaynak tamamen pasif — frozen state)
     event.is_active  = false   (event zaten pasif)
   KORUMA:
     • Aktif kaynaklar source-of-truth — purge edilemez (sync geri getirir)
     • Aktif eventler ASLA silinmez
     • UPDATE/DELETE policy yok → admin client direkt yazamaz; route
       service-role ile çalışır
=============================================================== */

export type PurgeInactiveEventsResult =
  | { ok: true; sourceId: string; deletedCount: number }
  | { ok: false; error: string };

export async function purgeInactiveEventsForSource(
  sourceId: string
): Promise<PurgeInactiveEventsResult> {
  const id = (sourceId || "").toString().trim();
  if (!id) return { ok: false, error: "source id gerekli" };
  try {
    const res = await adminFetch(
      `/api/admin/external-calendars/sources/${encodeURIComponent(id)}/purge-inactive`,
      { method: "POST" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      source_id?: string;
      deleted_count?: number;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      sourceId: json.source_id || id,
      deletedCount: Number(json.deleted_count) || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, error: msg };
  }
}

/* ===============================================================
   🛡️ FAZ 56G+ — DEACTIVATE EVENT (admin soft toggle)
   ===============================================================
   Yalnız soft-deactivate. Hard delete YOK. Yeni satır:
     is_active = false
     manually_deactivated = true   (migration 032)
     updated_at = now()
   Migration 032'nin `manually_deactivated` bayrağı sonraki sync'lerin
   event'i geri diriltememesini garanti eder (sync post-upsert sweep
   bu flag'i okuyup is_active'i tekrar false'a düşürür).

   RLS:
     external_calendar_events tablosu authenticated INSERT/UPDATE/DELETE
     policy yok → admin client direkt UPDATE yapamaz. Bu helper bir
     admin route (POST /api/admin/external-calendars/events/:id/
     deactivate) çağırır; route service-role ile UPDATE atar.

   IDEMPOTENT:
     Zaten is_active=false ise yine başarılı; route response'da
     `already_inactive: true` döner.

   ACTIVITY LOG:
     `external_calendar_event.deactivated` route içinde fail-safe
     loglanır; bu helper UI tarafından çağrılır, log endpoint
     üzerinden tetiklenir.
=============================================================== */

export type DeactivateExternalEventResult =
  | { ok: true; id: string; alreadyInactive: boolean }
  | { ok: false; error: string };

export async function deactivateExternalCalendarEvent(
  eventId: string
): Promise<DeactivateExternalEventResult> {
  const id = (eventId || "").toString().trim();
  if (!id) return { ok: false, error: "event id gerekli" };
  try {
    const res = await adminFetch(
      `/api/admin/external-calendars/events/${encodeURIComponent(id)}/deactivate`,
      { method: "POST" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      already_inactive?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      id: json.id || id,
      alreadyInactive: !!json.already_inactive,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, error: msg };
  }
}
