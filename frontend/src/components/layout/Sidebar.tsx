import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  ListVideo,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Plug,
  BarChart3,
  Sliders,
  FileText,
  Rss,
  Palette,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface SidebarProps {
  mode: "user" | "admin";
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const USER_NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "Video Oluştur", to: "/create", icon: <PlusCircle size={18} /> },
  { label: "İşler", to: "/jobs", icon: <ListVideo size={18} /> },
  { label: "Ayarlar", to: "/settings", icon: <Settings size={18} /> },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Admin Dashboard", to: "/admin/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "Modül Yönetimi", to: "/admin/modules", icon: <Boxes size={18} /> },
  { label: "Provider Yönetimi", to: "/admin/providers", icon: <Plug size={18} /> },
  { label: "Global Ayarlar", to: "/admin/global-settings", icon: <Sliders size={18} /> },
  { label: "Master Promptlar", to: "/admin/prompts", icon: <FileText size={18} /> },
  { label: "Haber Kaynakları", to: "/admin/news-sources", icon: <Rss size={18} /> },
  { label: "Kategori→Stil", to: "/admin/category-style-mappings", icon: <Palette size={18} /> },
  { label: "Maliyet Takibi", to: "/admin/cost-tracker", icon: <BarChart3 size={18} /> },
  { label: "Tüm İşler", to: "/admin/jobs", icon: <ListVideo size={18} /> },
];

export default function Sidebar({ mode }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } =
    useUIStore();
  const navigate = useNavigate();
  const navItems = mode === "admin" ? ADMIN_NAV : USER_NAV;

  return (
    <>
      {/* ── Mobil overlay ── */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={cn(
          // Temel layout
          "fixed left-0 top-0 z-30 flex h-screen flex-col",
          "border-r border-sidebar-border bg-sidebar",
          "transition-all duration-200 ease-in-out",
          // Masaüstü genişliği: daraltılmış ↔ açık
          sidebarCollapsed ? "w-[60px]" : "w-[220px]",
          // Mobilde: kapalıysa ekran dışı, açıksa görünür
          mobileSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo / Başlık */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-sidebar-border px-3",
            sidebarCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!sidebarCollapsed && (
            <button
              onClick={() => navigate(mode === "admin" ? "/admin/dashboard" : "/dashboard")}
              className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
                CM
              </span>
              <span>ContentManager</span>
            </button>
          )}
          {sidebarCollapsed && (
            <button
              onClick={() => navigate(mode === "admin" ? "/admin/dashboard" : "/dashboard")}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              CM
            </button>
          )}
        </div>

        {/* Navigasyon */}
        <nav className="flex-1 overflow-y-auto py-4">
          {/* Mod etiketi */}
          {!sidebarCollapsed && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {mode === "admin" ? "Admin Paneli" : "İçerik Üretimi"}
            </p>
          )}

          <ul className="space-y-0.5 px-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                      "transition-colors duration-100",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      sidebarCollapsed && "justify-center"
                    )
                  }
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Mod geçişi — user'dan admin'e */}
          {mode === "user" && !sidebarCollapsed && (
            <div className="mt-4 border-t border-sidebar-border pt-4 px-2">
              <NavLink
                to="/admin/dashboard"
                className="flex items-center gap-3 rounded-md px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <ShieldCheck size={16} />
                <span>Admin Paneli</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* Daralt / Genişlet butonu — yalnızca masaüstü */}
        <div className="hidden lg:block border-t border-sidebar-border p-2">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-2 text-xs text-muted-foreground",
              "hover:bg-sidebar-accent hover:text-foreground transition-colors",
              sidebarCollapsed && "justify-center"
            )}
            title={sidebarCollapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : (
              <>
                <ChevronLeft size={16} />
                <span className="ml-2">Daralt</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
