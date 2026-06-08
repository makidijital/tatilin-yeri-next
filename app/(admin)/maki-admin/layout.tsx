"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getAdminLogoUrl,
  getAdminIconUrl,
} from "@/lib/admin-branding";
import {
  LayoutDashboard,
  Home,
  Settings,
  LogOut,
  Layers,
  CalendarDays,
  FileText,
  MapPin,
  CreditCard,
  Landmark,
  CalendarRange,
  Menu,
  X,
  Eye,
  Bell,
  ShieldCheck,
  BadgeCheck,
  Activity,
  History,
  Users,
  Palette,
  Inbox,
  HelpCircle,
  Star,
  Sparkles,
  Wallet,
  Share2,
  ArrowDownUp,
} from "lucide-react";

import {
  AdminSessionGuard,
  useAdmin,
} from "@/app/components/admin/AdminSessionGuard";

import { NotificationProvider } from "@/app/components/admin/notifications/NotificationProvider";
import { NotificationBell } from "@/app/components/admin/notifications/NotificationBell";

type MenuItem = {
  name: string;
  href: string;
  icon: any;
  /** SIDEBAR_PERMISSIONS içindeki key — auth bağlandığında filtrelenir */
  permissionKey: string;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    label: "Genel",
    items: [
      {
        name: "Dashboard",
        href: "/maki-admin",
        icon: LayoutDashboard,
        permissionKey: "dashboard",
      },
    ],
  },
  {
    label: "Villalar",
    items: [
      {
        name: "Mülkler",
        href: "/maki-admin/villas",
        icon: Home,
        permissionKey: "villas",
      },
      {
        /* 🛡️ Villa Sırala — drag-drop sıralama ekranı.
           `/maki-admin/villas/siralama` route'unda VillaSortPanel
           render eder. Operasyon ekranından (Mülkler) ayrıştırıldı:
           pagination'a hazırlık + drag-drop UX'in 1000+ villa
           scale'inde uygulanabilir kalması için. `permissionKey:
           "villas"` reuse — yeni permission / role / migration YOK. */
        name: "Villa Sırala",
        href: "/maki-admin/villas/siralama",
        icon: ArrowDownUp,
        permissionKey: "villas",
      },
      {
        name: "Mülk Tipleri",
        href: "/maki-admin/types",
        icon: Layers,
        permissionKey: "villa_types",
      },
      {
        name: "Olanaklar",
        href: "/maki-admin/features",
        icon: Layers,
        permissionKey: "features",
      },
      {
        name: "Kurallar",
        href: "/maki-admin/rules",
        icon: ShieldCheck,
        permissionKey: "rules",
      },
      {
        name: "Fiyata Dahil",
        href: "/maki-admin/price-includes",
        icon: BadgeCheck,
        permissionKey: "price_includes",
      },
      {
        name: "Bölgeler",
        href: "/maki-admin/locations",
        icon: MapPin,
        permissionKey: "locations",
      },
      {
        name: "Villa Listesi",
        href: "/maki-admin/villa-listesi",
        icon: Share2,
        permissionKey: "villa_lists",
      },
      {
        /* 🛡️ Mülk Sahipleri — minimal owner kaydı + villa bağlantısı.
           İkon: mevcut import'lu Users (reuse; import churn yok). */
        name: "Mülk Sahipleri",
        href: "/maki-admin/property-owners",
        icon: Users,
        permissionKey: "property_owners",
      },
    ],
  },
  {
    label: "Rezervasyon",
    items: [
      {
        name: "Rezervasyonlar",
        href: "/maki-admin/reservations",
        icon: CalendarDays,
        permissionKey: "reservations",
      },
      {
        name: "Harici Rezervasyonlar",
        href: "/maki-admin/manual-reservations",
        icon: CalendarRange,
        permissionKey: "manual_reservations",
      },
      {
        /* 🛡️ FAZ 56G — iCal sync external rezervasyonları (Airbnb /
           Booking / VRBO availability blocker'ları). Bunlar GERÇEK
           rezervasyon DEĞİL — read-only operations view. Manuel
           bloklar ile karıştırılmaması için ayrı menu + farklı isim. */
        name: "iCal Rezervasyonları",
        href: "/maki-admin/external-reservations",
        icon: CalendarRange,
        permissionKey: "external_calendars",
      },
      {
        /* 🛡️ FAZ 40 — Concierge teklif talepleri. */
        name: "Teklif Talepleri",
        href: "/maki-admin/offer-requests",
        icon: Sparkles,
        permissionKey: "offer_requests",
      },
      {
        name: "Ödeme Yöntemleri",
        href: "/maki-admin/payment-methods",
        icon: CreditCard,
        permissionKey: "payment_methods",
      },
      {
        name: "Firma Hesap Bilgileri",
        href: "/maki-admin/payment-accounts",
        icon: Landmark,
        permissionKey: "payment_accounts",
      },
    ],
  },
  {
    /* 🛡️ Maki Finans foundation — komisyon raporları, gelir analizi,
       tahsilat, owner payout vb. ileride buraya eklenecek. Şimdilik
       read-only KPI snapshot sayfası. */
    label: "Finans",
    items: [
      {
        name: "Maki Finans",
        href: "/maki-admin/maki-finans",
        icon: Wallet,
        permissionKey: "finance",
      },
    ],
  },
  {
    label: "İçerik",
    items: [
      {
        name: "Sayfalar",
        href: "/maki-admin/pages",
        icon: FileText,
        permissionKey: "pages",
      },
      {
        name: "Menü",
        href: "/maki-admin/menu",
        icon: Layers,
        permissionKey: "menu",
      },
      {
        name: "Anasayfa Koleksiyon",
        href: "/maki-admin/homepage-collection",
        icon: Home,
        permissionKey: "homepage_collection",
      },
      {
        name: "Mesajlar",
        href: "/maki-admin/messages",
        icon: Inbox,
        permissionKey: "messages",
      },
      {
        /* 🛡️ FAZ 25 — Global SSS (site-wide FAQ). */
        name: "Sık Sorulan Sorular",
        href: "/maki-admin/faqs",
        icon: HelpCircle,
        permissionKey: "faqs",
      },
      {
        /* 🛡️ FAZ 33 — Villa Reviews moderation. */
        name: "Yorumlar",
        href: "/maki-admin/reviews",
        icon: Star,
        permissionKey: "reviews",
      },
    ],
  },
  {
    label: "Sistem",
    items: [
      {
        name: "Ayarlar",
        href: "/maki-admin/settings",
        icon: Settings,
        permissionKey: "settings",
      },
      {
        name: "Webmaster",
        href: "/maki-admin/webmaster",
        icon: Palette,
        permissionKey: "webmaster",
      },
      {
        name: "Mail Merkezi",
        href: "/maki-admin/system-logs",
        icon: Activity,
        permissionKey: "system_logs",
      },
      {
        /* 🛡️ FAZ 55 — Admin audit trail listing. Permission key
           "activity_logs" migration 028'de tüm aktif adminlere
           idempotent grant edildi. */
        name: "Aktivite Logları",
        href: "/maki-admin/activity-logs",
        icon: History,
        permissionKey: "activity_logs",
      },
      {
        name: "Kullanıcılar",
        href: "/maki-admin/users",
        icon: Users,
        permissionKey: "users",
      },
    ],
  },
];

/* ---------------------------------------------
   🔥 SIDEBAR PERMISSION FILTER
   - currentPermissions === null → tümünü göster (auth henüz bağlanmamış)
   - dizi geldiğinde sadece o key'lere sahip item'lar görünür
   - Boş gruplar otomatik gizlenir
---------------------------------------------- */
function filterMenuByPermissions(
  groups: MenuGroup[],
  perms: string[] | null
): MenuGroup[] {
  if (perms === null) return groups;
  const allowed = new Set(perms);
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => allowed.has(i.permissionKey)),
    }))
    .filter((g) => g.items.length > 0);
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  /* ---------------------------------------------
     🔥 LOGIN ROUTE — sidebar/topbar dışında render
     AdminSessionGuard yine sarmalar (cookie marker
     senkronizasyonu için), ama UI bypass eder.
  ---------------------------------------------- */
  if (pathname === "/maki-admin/login") {
    return (
      <AdminSessionGuard>
        <NotificationProvider>
          <main>{children}</main>
        </NotificationProvider>
      </AdminSessionGuard>
    );
  }

  return (
    <AdminSessionGuard>
      <NotificationProvider>
        <AdminShell>{children}</AdminShell>
      </NotificationProvider>
    </AdminSessionGuard>
  );
}

/* ---------------------------------------------
   🔥 AdminBrandMark — admin-logo.webp varsa render eder;
   <img onError> → "M" hardcoded fallback'a düşer.
   Hem sidebar Logo Link'i hem de mobil drawer için aynı mark.
   storage'a hiç logo yüklenmemişse UI bozulmaz; "M" rozeti kalır.
---------------------------------------------- */
function AdminBrandMark() {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) {
    return <span className="admin-brand-mark">M</span>;
  }
  return (
    <span
      className="admin-brand-mark"
      style={{
        padding: 0,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getAdminLogoUrl()}
        alt="Admin"
        onError={() => setImgFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </span>
  );
}

/* ---------------------------------------------
   🔥 useAdminFavicon — admin section'a özel favicon.
   Strateji:
     1. Document'taki MEVCUT <link rel="icon|shortcut icon">
        elemanlarını bul (Next.js'in default favicon.ico link'i
        burada zaten var) ve hrefs'lerini admin-icon URL'i ile
        OVERRIDE et. Yeni link inject etmek yerine var olanı
        düzenleyerek "iki favicon link'i" kafa karışıklığını
        önler — browser tutarlı şekilde admin icon'unu gösterir.
     2. Hiç favicon link yoksa (edge case) kendi link'imizi
        ekleriz; bu durumu data-admin-favicon-injected flag'i
        ile cleanup'ta tanırız.
     3. Cleanup (admin layout unmount olunca, public siteye
        nav): saklanmış orijinal href'leri restore et — public
        site default favicon'una otomatik döner.

   Hydration safety: SSR HTML'de Next.js'in default link tag'i
   var; bu hook useEffect içinde post-mount çalışır, React
   tree dışındaki <head> elemanlarını DOM API ile düzenler →
   hydration mismatch yok.
---------------------------------------------- */
function useAdminFavicon(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const url = getAdminIconUrl();
    if (!url) return;

    type Saved = {
      el: HTMLLinkElement;
      originalHref: string;
      originalType: string;
      injected: boolean;
    };
    const saved: Saved[] = [];

    const existing = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );

    if (existing.length > 0) {
      existing.forEach((el) => {
        saved.push({
          el,
          originalHref: el.getAttribute("href") || "",
          originalType: el.getAttribute("type") || "",
          injected: false,
        });
        el.setAttribute("href", url);
        el.setAttribute("type", "image/webp");
      });
    } else {
      const link = document.createElement("link");
      link.setAttribute("rel", "icon");
      link.setAttribute("type", "image/webp");
      link.setAttribute("href", url);
      link.setAttribute("data-admin-favicon-injected", "true");
      document.head.appendChild(link);
      saved.push({
        el: link,
        originalHref: "",
        originalType: "",
        injected: true,
      });
    }

    return () => {
      saved.forEach(({ el, originalHref, originalType, injected }) => {
        if (injected) {
          if (el.parentNode) el.parentNode.removeChild(el);
          return;
        }
        if (originalHref) {
          el.setAttribute("href", originalHref);
        } else {
          el.removeAttribute("href");
        }
        if (originalType) {
          el.setAttribute("type", originalType);
        } else {
          el.removeAttribute("type");
        }
      });
    };
  }, []);
}

function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Admin section'da tarayıcı sekmesi favicon'unu admin-icon.webp
  // yapar; public site nav olunca cleanup link'i kaldırır.
  useAdminFavicon();

  /* ---------------------------------------------
     🔥 CURRENT USER PERMISSIONS (auth-bağlı)
     - admin null iken (initial loading): tümünü göster
       (AdminSessionGuard zaten render'ı bloklayacak,
        bu state pratikte sadece authenticated phase'de
        kullanılır)
     - admin yüklü ise: sidebar_permissions kullan
  ---------------------------------------------- */
  const { admin, signOut } = useAdmin();
  const currentPermissions: string[] | null = admin
    ? admin.sidebar_permissions
    : null;

  const visibleGroups = filterMenuByPermissions(
    menuGroups,
    currentPermissions
  );

  const adminInitial = (admin?.full_name || admin?.email || "M")
    .trim()
    .charAt(0)
    .toUpperCase() || "M";

  const handleLogout = async (): Promise<void> => {
    await signOut();
  };

  /* 🛡️ ACTIVE STATE — longest prefix match.
     Eski koşul: `pathname === href || pathname.startsWith(href + "/")`
     üç noktada (currentItem / currentGroup / sidebar item active) ayrı
     ayrı uygulanıyordu. Birden çok item aynı pathname'i match ettiğinde
     (örn. /maki-admin/villas/siralama hem "Mülkler" hem "Villa Sırala"
     için TRUE), `flatMap.find` ilk eşleşeni alıyordu → "Mülkler" item
     yanlışlıkla aktif görünüyor + sayfa başlığı yanlış oluyordu.

     Yeni mantık: tüm menü item href'leri arasında pathname'i match eden
     **en uzun href** belirlenir; aktif item yalnız bu href ile birebir
     eşleşendir. Eş anlamlı: en spesifik route kazanır. Bu sayede
     `/villas/siralama` için yalnız "Villa Sırala" aktif olur, `/villas`
     ve `/villas/ekle` için yalnız "Mülkler" aktif olur. Gelecekte
     eklenecek alt-rotalar için ek değişiklik gerekmez. */
  const allHrefs = menuGroups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter(
      (h) => pathname === h || pathname.startsWith(h + "/")
    )
    .reduce(
      (longest, current) =>
        current.length > longest.length ? current : longest,
      ""
    );

  // Active page title (for top bar)
  const currentItem = menuGroups
    .flatMap((g) => g.items)
    .find((item) => item.href === activeHref);
  const currentGroup = menuGroups.find((g) =>
    g.items.some((item) => item.href === activeHref)
  );
  const currentTitle = currentItem?.name || "Admin";
  const currentEyebrow = currentGroup?.label || "Admin";

  return (
    <div className="admin-shell flex min-h-screen">
      {/* SIDEBAR (desktop) + DRAWER (mobile) */}
      <aside
        className={`
          admin-sidebar
          fixed md:static inset-y-0 left-0 z-50
          w-72 md:w-[260px] shrink-0
          flex flex-col
          transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 flex items-center justify-between">
          <Link href="/maki-admin" className="admin-brand">
            <AdminBrandMark />
            <span className="admin-brand-text">
              <span className="admin-brand-name block">Maki Dijital</span>
              <span className="admin-brand-sub block">Admin · CRM</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-[var(--admin-sidebar-text)] hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-[var(--admin-sidebar-border)]" />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="admin-sidebar-group-label px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  /* 🛡️ Aktif item = longest prefix match (yukarıda
                     hesaplanan `activeHref`). currentItem ile birebir
                     aynı kaynak — UI tutarlılığı garanti. */
                  const active = item.href === activeHref;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`admin-nav-item ${active ? "is-active" : ""}`}
                    >
                      <Icon size={15} className="admin-icon shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — admin info + logout */}
        <div className="px-3 py-4 border-t border-[var(--admin-sidebar-border)] space-y-2">
          {admin && (
            <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
              <p className="text-[12px] font-semibold text-[var(--admin-sidebar-text)] truncate leading-tight">
                {admin.full_name || "Admin"}
              </p>
              <p className="text-[10.5px] text-[var(--admin-sidebar-text)]/70 truncate mt-0.5">
                {admin.email}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="admin-nav-item w-full text-left hover:!text-rose-300"
          >
            <LogOut size={15} className="admin-icon shrink-0" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* OVERLAY for mobile */}
      {open && (
        <button
          aria-label="Kapat"
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-[#020617]/45 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOPBAR */}
        <header className="admin-topbar h-16 flex items-center justify-between px-5 md:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setOpen(true)}
              className="md:hidden admin-icon-btn -ml-2"
              aria-label="Menü"
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0">
              <p className="admin-page-eyebrow leading-none">
                {currentEyebrow}
              </p>
              <h2 className="font-display text-[17px] tracking-[-0.015em] text-[var(--admin-text)] truncate leading-tight mt-0.5">
                {currentTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Siteyi Görüntüle — public site, yeni sekme (arama kutusu kaldırıldı) */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-2 admin-btn-ghost"
            >
              <Eye size={15} />
              Siteyi Görüntüle
            </a>

            {/* Notification — unified center (preview + persistent log) */}
            <NotificationBell />

            {/* Avatar — initial admin adı/emailden */}
            <div
              className="admin-avatar"
              title={
                admin
                  ? `${admin.full_name || ""} (${admin.email})`
                  : ""
              }
            >
              {adminInitial}
            </div>
          </div>
        </header>

        {/* PAGE — fluid SaaS workspace (Linear/Attio-vari geniş alan) */}
        <main className="flex-1 w-full px-5 md:px-8 lg:px-10 xl:px-12 py-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
