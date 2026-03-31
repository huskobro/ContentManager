import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";

/**
 * Sayfa bileşenleri.
 * Faz 3: User sayfaları tam işlevsel.
 * Faz 4: Admin sayfaları tam işlevsel.
 */
import Dashboard from "@/pages/user/Dashboard";
import CreateVideo from "@/pages/user/CreateVideo";
import JobList from "@/pages/user/JobList";
import JobDetail from "@/pages/user/JobDetail";
import UserSettings from "@/pages/user/UserSettings";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import GlobalSettings from "@/pages/admin/GlobalSettings";
import ModuleManager from "@/pages/admin/ModuleManager";
import ProviderManager from "@/pages/admin/ProviderManager";
import AdminJobs from "@/pages/admin/AdminJobs";
import CostTracker from "@/pages/admin/CostTracker";
import PromptManager from "@/pages/admin/PromptManager";
import NewsSourceManager from "@/pages/admin/NewsSourceManager";
import CategoryStyleMappingManager from "@/pages/admin/CategoryStyleMappingManager";

export default function App() {
  return (
    <Routes>
      {/* ── Kullanıcı arayüzü ── */}
      <Route element={<AppShell mode="user" />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create" element={<CreateVideo />} />
        <Route path="/jobs" element={<JobList />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/settings" element={<UserSettings />} />
      </Route>

      {/* ── Admin arayüzü ── */}
      <Route element={<AppShell mode="admin" />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/global-settings" element={<GlobalSettings />} />
        <Route path="/admin/modules" element={<ModuleManager />} />
        <Route path="/admin/providers" element={<ProviderManager />} />
        <Route path="/admin/jobs" element={<AdminJobs />} />
        <Route path="/admin/cost-tracker" element={<CostTracker />} />
        <Route path="/admin/prompts" element={<PromptManager />} />
        <Route path="/admin/news-sources" element={<NewsSourceManager />} />
        <Route path="/admin/category-style-mappings" element={<CategoryStyleMappingManager />} />
      </Route>

      {/* Bilinmeyen route'ları dashboard'a yönlendir */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
