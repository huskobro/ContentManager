import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface AppShellProps {
  mode: "user" | "admin";
}

/** Rota → okunabilir başlık eşleştirmesi */
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/create": "Video Oluştur",
  "/jobs": "İşler",
  "/settings": "Ayarlar",
  "/admin/dashboard": "Admin Dashboard",
  "/admin/modules": "Modül Yönetimi",
  "/admin/providers": "Provider Yönetimi",
  "/admin/global-settings": "Global Ayarlar",
  "/admin/cost-tracker": "Maliyet Takibi",
  "/admin/jobs": "Tüm İşler",
};

export default function AppShell({ mode }: AppShellProps) {
  const { sidebarCollapsed } = useUIStore();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mode={mode} />

      {/* Ana içerik — sidebar genişliğine göre kaydırılır */}
      <div
        className={cn(
          "flex flex-col min-h-screen transition-all duration-200 ease-in-out",
          // Masaüstü: sidebar genişliğine göre sol margin
          sidebarCollapsed ? "lg:ml-[60px]" : "lg:ml-[220px]"
        )}
      >
        <Header mode={mode} pageTitle={pageTitle} />

        {/* Sayfa içeriği */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
