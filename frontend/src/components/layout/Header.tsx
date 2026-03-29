import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, Menu, ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface HeaderProps {
  mode: "user" | "admin";
  pageTitle?: string;
}

export default function Header({ mode, pageTitle }: HeaderProps) {
  const { theme, toggleTheme, setMobileSidebarOpen, adminUnlocked, unlockAdmin, lockAdmin } =
    useUIStore();
  const navigate = useNavigate();

  // Admin PIN modal durumu
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    // PIN backend'den de doğrulanabilir; şu an localStorage'daki PIN ile karşılaştır.
    // Gerçek doğrulama Faz 4'te POST /api/v1/admin/verify-pin endpoint'i ile yapılacak.
    const storedPin = localStorage.getItem("cm-admin-pin") ?? "0000";
    if (pinInput === storedPin) {
      unlockAdmin();
      setPinModalOpen(false);
      setPinInput("");
      setPinError(false);
      navigate("/admin/dashboard");
    } else {
      setPinError(true);
      setPinInput("");
    }
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/95 backdrop-blur-sm px-4 gap-3">
        {/* Hamburger — yalnızca mobil */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Menüyü aç"
        >
          <Menu size={20} />
        </button>

        {/* Sayfa başlığı */}
        <div className="flex-1 min-w-0">
          {pageTitle && (
            <h1 className="text-sm font-semibold text-foreground truncate">{pageTitle}</h1>
          )}
          {mode === "admin" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 dark:text-amber-400">
              <ShieldCheck size={12} />
              Admin Modu
            </span>
          )}
        </div>

        {/* Sağ eylemler */}
        <div className="flex items-center gap-2">
          {/* Dark / Light toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              "transition-colors"
            )}
            aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
            title={theme === "dark" ? "Açık Tema" : "Koyu Tema"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Admin kilit toggle */}
          {mode === "user" ? (
            <button
              onClick={() => setPinModalOpen(true)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                "transition-colors"
              )}
              title="Admin Paneli"
            >
              <KeyRound size={14} />
              <span className="hidden sm:inline">Admin</span>
            </button>
          ) : (
            <button
              onClick={() => {
                lockAdmin();
                navigate("/dashboard");
              }}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
                "transition-colors"
              )}
              title="Admin Kilitle"
            >
              <ShieldOff size={14} />
              <span className="hidden sm:inline">Kilitle</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Admin PIN Modal ── */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Admin Girişi</h2>
                <p className="text-xs text-muted-foreground">PIN kodunuzu girin</p>
              </div>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setPinError(false);
                  }}
                  placeholder="••••"
                  autoFocus
                  className={cn(
                    "w-full rounded-lg border bg-input px-4 py-2.5 text-center text-lg tracking-[0.5em]",
                    "text-foreground placeholder:text-muted-foreground",
                    "outline-none focus:ring-2 focus:ring-ring",
                    "transition-colors",
                    pinError ? "border-destructive focus:ring-destructive/50" : "border-border"
                  )}
                />
                {pinError && (
                  <p className="mt-1.5 text-xs text-destructive text-center">
                    Hatalı PIN. Tekrar deneyin.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinModalOpen(false);
                    setPinInput("");
                    setPinError(false);
                  }}
                  className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={pinInput.length === 0}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  Giriş
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
