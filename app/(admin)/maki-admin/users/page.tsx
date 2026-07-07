"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  setAdminUserActive,
  SIDEBAR_PERMISSIONS,
  type AdminUser,
  type AdminUserInput,
  type PermissionItem,
} from "@/app/services/admin-user.service";
import {
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Pencil,
  Power,
  Mail as MailIcon,
  X,
  Save,
  Loader2,
  KeyRound,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";

/* ===============================================================
   🔥 ADMIN USERS — multi-user yönetim paneli
   ===============================================================
   - Liste: avatar, ad soyad, email, status, oluşturulma
   - Filtre + arama
   - Yeni kullanıcı / düzenle modal
   - Sidebar permission checkbox grid
   - Aktif/pasif toggle, sil
   - Sadece foundation; mevcut auth yapısı dokunulmadı
   =============================================================== */

/* 🛡️ Central helper (manual UTC→Istanbul math, Intl-bypass-proof). */
import { formatDateTimeTr } from "@/lib/date-format";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";

function formatDateTime(value?: string | null) {
  return formatDateTimeTr(value);
}

type StatusFilter = "all" | "active" | "inactive";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Pasif" },
];

/* group SIDEBAR_PERMISSIONS by group label (display order korunur) */
function groupPermissions(items: PermissionItem[]) {
  const map = new Map<string, PermissionItem[]>();
  items.forEach((p) => {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push(p);
  });
  return Array.from(map.entries()).map(([group, list]) => ({
    group,
    list,
  }));
}

export default function AdminUsersPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // modal state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<AdminUserInput>({
    full_name: "",
    email: "",
    password: "",
    sidebar_permissions: [],
    is_active: true,
  });

  async function load(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    const data = await getAdminUsers();
    setUsers(data);
    if (initial) setLoading(false);
    else setRefreshing(false);
  }

  useEffect(() => {
    load(true);
  }, []);

  /* ---------------- FILTER ---------------- */
  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return users.filter((u) => {
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (!q) return true;
      return (
        normalizeSearchText(u.full_name || "").includes(q) ||
        normalizeSearchText(u.email || "").includes(q)
      );
    });
  }, [users, search, statusFilter]);

  /* ---------------- MODAL HELPERS ---------------- */
  function openCreate() {
    setEditingId(null);
    setFormError(null);
    setForm({
      full_name: "",
      email: "",
      password: "",
      sidebar_permissions: SIDEBAR_PERMISSIONS.map((p) => p.key), // default: tüm yetkiler
      is_active: true,
    });
    setOpen(true);
  }

  function openEdit(u: AdminUser) {
    setEditingId(u.id);
    setFormError(null);
    setForm({
      full_name: u.full_name || "",
      email: u.email || "",
      password: "",
      sidebar_permissions: Array.isArray(u.sidebar_permissions)
        ? u.sidebar_permissions
        : [],
      is_active: u.is_active !== false,
    });
    setOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function togglePerm(key: string, checked: boolean) {
    setForm((prev) => {
      const set = new Set(prev.sidebar_permissions || []);
      if (checked) set.add(key);
      else set.delete(key);
      return {
        ...prev,
        sidebar_permissions: Array.from(set),
      };
    });
  }

  function selectAllPerms(group?: string) {
    setForm((prev) => {
      const set = new Set(prev.sidebar_permissions || []);
      SIDEBAR_PERMISSIONS.forEach((p) => {
        if (!group || p.group === group) set.add(p.key);
      });
      return { ...prev, sidebar_permissions: Array.from(set) };
    });
  }

  function clearAllPerms(group?: string) {
    setForm((prev) => {
      const set = new Set(prev.sidebar_permissions || []);
      SIDEBAR_PERMISSIONS.forEach((p) => {
        if (!group || p.group === group) set.delete(p.key);
      });
      return { ...prev, sidebar_permissions: Array.from(set) };
    });
  }

  /* ---------------- SAVE ---------------- */
  async function handleSave() {
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) {
        /* 🛡️ FAZ 55I — BEFORE snapshot (audit log diff için).
           Mevcut `users` state'inden editingId ile bul; password
           hiç tutulmadığı için snapshot'a girmez. */
        const beforeUser = users.find((u) => u.id === editingId);
        const res = await updateAdminUser(editingId, form);
        if (!res.ok) {
          setFormError(res.error || "Güncellenemedi");
          return;
        }
        /* AUDIT LOG (fail-safe) — sensitive password helper masking
           ile zaten redact edilir; ek olarak after_data'ya hiç eklemiyoruz. */
        if (beforeUser) {
          logActivity({
            action: "admin.updated",
            entity_type: "admin_user",
            entity_id: editingId,
            entity_title: form.email || beforeUser.email || editingId,
            before_data: {
              full_name: beforeUser.full_name,
              email: beforeUser.email,
              sidebar_permissions: Array.isArray(beforeUser.sidebar_permissions)
                ? beforeUser.sidebar_permissions
                : [],
              is_active: beforeUser.is_active,
            },
            after_data: {
              full_name: form.full_name,
              email: form.email,
              sidebar_permissions: form.sidebar_permissions,
              is_active: form.is_active,
            },
          }).catch(() => {});
        }
      } else {
        /* CREATE — server-side endpoint zaten "admin.created" log
           insert eder (extractAdminContextFromRequest). Client log
           DUPLICATE olur, eklenmiyor. */
        const res = await createAdminUser(form);
        if (!res.ok) {
          setFormError(res.error || "Oluşturulamadı");
          return;
        }
      }
      setOpen(false);
      setEditingId(null);
      await load(false);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- ACTIONS ---------------- */
  async function handleToggleActive(u: AdminUser) {
    const nextActive = !u.is_active;
    const ok = await setAdminUserActive(u.id, nextActive);
    if (ok) {
      /* 🛡️ FAZ 55I — Toggle log; admin.updated sub-case with single
         is_active diff. Fail-safe. */
      logActivity({
        action: "admin.updated",
        entity_type: "admin_user",
        entity_id: u.id,
        entity_title: u.email || u.id,
        before_data: { is_active: u.is_active },
        after_data: { is_active: nextActive },
      }).catch(() => {});
      await load(false);
    }
  }

  async function handleDelete(u: AdminUser) {
    const proceed = await confirm({
      title: "Kullanıcı silinsin mi?",
      description: `"${u.full_name || u.email}" kaldırılır. Bu işlem geri alınamaz.`,
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deleteAdminUser(u.id);
    if (ok) {
      await load(false);
      toast.success("Kullanıcı silindi", { id: `user-delete-${u.id}` });
    } else {
      toast.error("Silinemedi", { id: `user-delete-${u.id}` });
    }
  }

  /* ---------------- RENDER ---------------- */
  const groupedPerms = useMemo(
    () => groupPermissions(SIDEBAR_PERMISSIONS),
    []
  );

  return (
    <div className="space-y-10 w-full">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Sistem</p>
          <h1 className="admin-page-header__title flex items-center gap-2.5">
            <UserIcon
              size={22}
              className="text-[var(--admin-accent-strong)]"
            />
            Kullanıcılar
          </h1>
          <p className="admin-page-header__sub">
            Admin paneline erişimi olan kullanıcıları yönet. Her kullanıcının
            sidebar görünürlüğü ayrı kontrol edilir.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            onClick={() => load(false)}
            disabled={refreshing}
            className="admin-btn-ghost"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Yenile
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="admin-btn-primary"
          >
            <Plus size={15} />
            Yeni kullanıcı
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Ad veya e-posta ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                  active
                    ? "bg-[var(--admin-text)] text-white border-[var(--admin-text)]"
                    : "bg-[var(--admin-surface)] text-[var(--admin-muted)] border-[var(--admin-border)] hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-text)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2 ml-auto">
          {filtered.length} kayıt
        </span>
      </div>

      {/* LIST */}
      {loading && (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted)]">
          Yükleniyor…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="admin-card-flat p-14 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center mx-auto">
            <UserIcon
              size={18}
              className="text-[var(--admin-muted)]"
            />
          </div>
          <h3 className="font-display text-[20px] text-[var(--admin-text)] mt-4 tracking-[-0.015em]">
            Kullanıcı yok
          </h3>
          <p className="text-[var(--admin-muted-2)] text-sm mt-2 max-w-sm mx-auto">
            İlk admin kullanıcısını oluşturmak için sağ üstteki butonu kullan.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="admin-table">
          {filtered.map((u) => {
            const initial = (u.full_name || u.email || "?")
              .slice(0, 1)
              .toUpperCase();
            const active = !!u.is_active;
            return (
              <div key={u.id} className="admin-row">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg,#1d4ed8 0%,#06b6d4 55%,#84cc16 100%)",
                  }}>
                  {initial}
                </div>

                {/* Name + email */}
                <div className="min-w-0 flex-[1.4]">
                  <p className="text-[14px] font-semibold text-[var(--admin-text)] truncate leading-tight">
                    {u.full_name || "—"}
                  </p>
                  <p className="text-[12px] text-[var(--admin-muted)] truncate mt-0.5 flex items-center gap-1.5">
                    <MailIcon size={11} />
                    {u.email || "—"}
                  </p>
                </div>

                {/* Status */}
                <div className="hidden md:block shrink-0">
                  <span
                    className={`admin-badge ${
                      active
                        ? "admin-badge--confirmed"
                        : "admin-badge--neutral"
                    }`}
                  >
                    <span className="admin-badge__dot" />
                    {active ? "Aktif" : "Pasif"}
                  </span>
                </div>

                {/* Permissions count */}
                <div className="hidden lg:block shrink-0 min-w-[100px]">
                  <span className="admin-badge admin-badge--info">
                    <ShieldCheck size={11} />
                    {(u.sidebar_permissions || []).length} yetki
                  </span>
                </div>

                {/* Created */}
                <div className="text-right shrink-0 min-w-[140px]">
                  <p className="text-[12.5px] text-[var(--admin-text)] tabular-nums">
                    {formatDateTime(u.created_at)}
                  </p>
                  {u.last_login_at && (
                    <p className="text-[11px] text-[var(--admin-muted-2)] mt-0.5">
                      Son giriş: {formatDateTime(u.last_login_at)}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u)}
                    className="admin-icon-btn"
                    title={active ? "Pasifleştir" : "Aktifleştir"}
                    aria-label="Aktif/pasif"
                  >
                    <Power
                      size={14}
                      className={
                        active
                          ? "text-emerald-600"
                          : "text-[var(--admin-muted)]"
                      }
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="admin-icon-btn"
                    title="Düzenle"
                    aria-label="Düzenle"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(u)}
                    className="admin-icon-btn"
                    title="Sil"
                    aria-label="Sil"
                  >
                    <Trash2 size={14} className="text-rose-600" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020617]/45 backdrop-blur-sm">
          <div className="admin-card-flat w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--admin-surface)]">
            {/* MODAL HEADER */}
            <div className="admin-card__header sticky top-0 bg-[var(--admin-surface)] z-10">
              <div>
                <h3 className="admin-card__title">
                  {editingId ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
                </h3>
                <p className="admin-card__sub">
                  Sidebar erişimi yetki listesinden kontrol edilir.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="admin-icon-btn"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-6 space-y-6">
              {/* PROFILE FIELDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <UserIcon size={12} className="text-[var(--admin-accent-strong)]" />
                    Ad Soyad
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) =>
                      setForm({ ...form, full_name: e.target.value })
                    }
                    className="input"
                    placeholder="Burhan Dayıoğlu"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <MailIcon size={12} className="text-[var(--admin-accent-strong)]" />
                    E-posta
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="input"
                    placeholder="ornek@domain.com"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <KeyRound
                      size={12}
                      className="text-[var(--admin-accent-strong)]"
                    />
                    Şifre
                    {editingId && (
                      <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--admin-muted-2)] ml-1">
                        (boş bırakırsan değişmez)
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={form.password || ""}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="input"
                    placeholder={editingId ? "••••••••" : "Yeni şifre"}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)]">
                    Durum
                  </label>
                  <div className="flex items-center gap-3 bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] rounded-xl px-4 py-2.5">
                    <span className="text-sm text-[var(--admin-text)]">
                      {form.is_active ? "Aktif" : "Pasif"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, is_active: !form.is_active })
                      }
                      className={`relative w-10 h-5.5 ml-auto rounded-full transition shrink-0 ${
                        form.is_active
                          ? "bg-[var(--admin-accent)]"
                          : "bg-[var(--admin-border-strong)]"
                      }`}
                      style={{ width: 40, height: 22 }}
                      aria-label="Aktif/pasif"
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          form.is_active ? "left-[20px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* PERMISSIONS GRID */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <ShieldCheck
                      size={12}
                      className="text-[var(--admin-accent-strong)]"
                    />
                    Sidebar Yetkileri
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllPerms()}
                      className="text-[11.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)] underline-offset-2 hover:underline"
                    >
                      Tümünü seç
                    </button>
                    <span className="text-[11px] text-[var(--admin-muted-2)]">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => clearAllPerms()}
                      className="text-[11.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)] underline-offset-2 hover:underline"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {groupedPerms.map(({ group, list }) => (
                    <div
                      key={group}
                      className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-bg-soft)]/60 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--admin-muted-2)]">
                          {group}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => selectAllPerms(group)}
                            className="text-[10.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
                          >
                            Tümü
                          </button>
                          <span className="text-[10px] text-[var(--admin-muted-2)]">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => clearAllPerms(group)}
                            className="text-[10.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
                          >
                            Hiçbiri
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {list.map((p) => {
                          const checked = (form.sidebar_permissions || []).includes(
                            p.key
                          );
                          return (
                            <label
                              key={p.key}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition text-[13px] ${
                                checked
                                  ? "bg-[var(--admin-accent-soft)] border-[var(--admin-accent)] text-[var(--admin-text)]"
                                  : "bg-[var(--admin-surface)] border-[var(--admin-border)] text-[var(--admin-muted)] hover:border-[var(--admin-border-strong)]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  togglePerm(p.key, e.target.checked)
                                }
                                className="!w-3.5 !h-3.5 accent-[var(--admin-accent)]"
                              />
                              <span className="truncate">{p.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-[12.5px] text-rose-800">
                  {formError}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2 border-t border-[var(--admin-border)] bg-[var(--admin-surface)] sticky bottom-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="admin-btn-ghost"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="admin-btn-primary"
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Kaydediliyor…
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    {editingId ? "Güncelle" : "Oluştur"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
