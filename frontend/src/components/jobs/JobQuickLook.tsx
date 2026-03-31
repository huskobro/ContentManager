/**
 * JobQuickLook — Space tuşu veya tek tıkla açılan minimalist önizleme modalı.
 *
 * İçerik: Video oynatıcı, başlık, durum rozeti, format, dil.
 * Aksiyonlar: Senaryoyu Kopyala | YouTube Meta Kopyala | Videoyu İndir
 * Alt buton: "Tüm Detayları Gör" → Deep Dive Sheet açar.
 *
 * Space Toggle Davranışı:
 *   - Modal AÇIKKEN Space tuşu içerideki butonu TETİKLEMEZ.
 *   - Capture aşamasında (önce) yakalanır, preventDefault + stopPropagation.
 *   - " " ve "Spacebar" (eski tarayıcı değeri) ikisi de desteklenir.
 *   - input/textarea/contenteditable içindeyse Space engellenmez.
 *   - Modal KAPANIR (ESC ile aynı davranış).
 *
 * ESC Katmanı:
 *   useDismissOnEsc ile kayıtlıdır (priority=10 → diğer handler'lardan önce).
 *   Radix Dialog kendi ESC'sini de yönetir; iki katman çakışmaz çünkü
 *   Radix, onOpenChange(false) çağrır ve biz de onClose'u dışarıdan alırız.
 *
 * Scope Yönetimi:
 *   Modal açıkken altındaki liste scope'u pasif olur (keyboardStore stack).
 *   Bunun için JobList/AdminJobs anyPanelOpen=true ile disabled:{true} verir.
 */

import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Download,
  Copy,
  ExternalLink,
  FileVideo,
  PlayCircle,
} from "lucide-react";
import { type Job } from "@/stores/jobStore";
import { STATUS_CONFIG, MODULE_INFO, getModuleIcon } from "@/lib/constants";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface Props {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onOpenDeepDive: () => void;
}

// ─── Guard: metinsel input alanı mı? ────────────────────────────────────────
function isTextInput(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute("role");
  return (
    role === "textbox" ||
    role === "combobox" ||
    role === "searchbox" ||
    role === "spinbutton"
  );
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export function JobQuickLook({ job, open, onClose, onOpenDeepDive }: Props) {
  const addToast = useUIStore((s) => s.addToast);

  // onClose'u ref'e al — stale closure riski yok
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /**
   * Space Toggle Fix — Tam Güvenilir İmplementasyon
   *
   * Modal açıkken Space tuşu:
   *   1. capture:true → DOM'a inmeden yakalanır (butonlara ulaşmaz)
   *   2. Metin girişi alanı değilse → preventDefault + stopPropagation
   *   3. Modal kapanır
   *
   * Desteklenen Space değerleri:
   *   - " "        → Modern tarayıcılar (Chrome, Firefox, Safari, Edge)
   *   - "Spacebar" → IE/Edge eski sürümleri (artık nadir ama güvenlik için)
   */
  useEffect(() => {
    if (!open) return;

    function handleSpaceCapture(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Spacebar") return;

      // Metin girişi alanlarında Space'i engelleme
      if (isTextInput(e.target)) return;

      // Modifier tuşlarla Space — sistem kısayolu olabilir, dokunma
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // IME kompozisyon sırasında engelleme
      if (e.isComposing) return;

      // Space'i yakala: buton/link default davranışını (tıklama) ve
      // alttaki liste navigation handler'larını engelle
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Space → modal kapat
      onCloseRef.current();
    }

    // capture:true → event path'inin en üstünde, diğer listener'lardan önce
    window.addEventListener("keydown", handleSpaceCapture, true);
    return () => window.removeEventListener("keydown", handleSpaceCapture, true);
  }, [open]);

  if (!job) return null;

  const statusCfg = STATUS_CONFIG[job.status];
  const modMeta   = MODULE_INFO[job.module_key];
  const modLabel  = modMeta?.label ?? job.module_key;

  const completedSteps = job.steps.filter((s) => s.status === "completed").length;
  const totalSteps     = job.steps.length;
  const pct            = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  async function handleDownload() {
    try {
      const response = await fetch(`/api/jobs/${job!.id}/output`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "İndirme hatası" }));
        addToast({ type: "error", title: "İndirme başarısız", description: err.detail });
        return;
      }
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `video_${job!.id.substring(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast({ type: "success", title: "Video indiriliyor..." });
    } catch {
      addToast({ type: "error", title: "İndirme başarısız" });
    }
  }

  function handleCopyScript() {
    const scriptStep = job!.steps.find((s) => s.key === "script");
    const artifact   = scriptStep?.output_artifact ?? "";
    if (!artifact) {
      addToast({ type: "info", title: "Senaryo henüz hazır değil" });
      return;
    }
    navigator.clipboard.writeText(artifact).then(
      () => addToast({ type: "success", title: "Senaryo kopyalandı" }),
      () => addToast({ type: "error", title: "Kopyalama başarısız" })
    );
  }

  function handleCopyMeta() {
    const meta = `Başlık: ${job!.title}\nDil: ${job!.language?.toUpperCase() ?? "—"}\nModül: ${modLabel}`;
    navigator.clipboard.writeText(meta).then(
      () => addToast({ type: "success", title: "Video meta kopyalandı" }),
      () => addToast({ type: "error", title: "Kopyalama başarısız" })
    );
  }

  function handleDeepDive() {
    onClose();
    // Kısa gecikme — Radix Dialog kapanma animasyonuna izin ver
    setTimeout(onOpenDeepDive, 80);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel */}
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-card shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            "focus:outline-none"
          )}
          aria-label={`${job.title} — Hızlı Önizleme`}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Kapat butonu */}
          <Dialog.Close asChild>
            <button
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Önizlemeyi kapat"
            >
              <X size={14} />
            </button>
          </Dialog.Close>

          {/* Video Önizleme */}
          <div
            className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-black"
            aria-hidden="true"
          >
            {job.status === "completed" && job.output_path ? (
              <video
                src={`/api/jobs/${job.id}/output`}
                className="h-full w-full object-contain"
                controls
                preload="metadata"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center space-y-2">
                  {job.status === "running" || job.status === "queued" ? (
                    <>
                      <PlayCircle size={40} className="mx-auto text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">İşleniyor... %{pct}</p>
                    </>
                  ) : (
                    <>
                      <FileVideo size={40} className="mx-auto text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">Video mevcut değil</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* İçerik */}
          <div className="p-4 space-y-3">
            {/* Başlık + rozet */}
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="text-sm font-semibold text-foreground leading-tight flex-1 min-w-0 truncate">
                {job.title}
              </Dialog.Title>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                  statusCfg.color,
                  statusCfg.bg
                )}
                aria-label={`Durum: ${statusCfg.label}`}
              >
                {statusCfg.label}
              </span>
            </div>

            {/* Meta bilgiler */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {getModuleIcon(job.module_key, 12)}
                {modLabel}
              </span>
              {job.language && (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="uppercase">{job.language}</span>
                </>
              )}
            </div>

            {/* İlerleme çubuğu */}
            <div
              className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tamamlanma yüzdesi"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  job.status === "failed"    ? "bg-red-400" :
                  job.status === "completed" ? "bg-emerald-400" : "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Yayın özeti */}
            {job.publishTargets && job.publishTargets.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Platform Yayını
                </p>
                {job.publishTargets.map((t) => {
                  const statusColor =
                    t.status === "published" ? "text-emerald-500" :
                    t.status === "failed"    ? "text-red-500" :
                    t.status === "publishing" ? "text-blue-500" :
                    "text-muted-foreground";
                  const statusLabel =
                    t.status === "published" ? "Yayınlandı" :
                    t.status === "failed"    ? "Başarısız" :
                    t.status === "publishing" ? "Yayınlanıyor..." :
                    t.status === "skipped"   ? "Atlandı" : "Bekliyor";
                  return (
                    <div key={t.id} className="flex items-center justify-between">
                      <span className="text-xs text-foreground capitalize">{t.platform}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                        {t.external_url && (
                          <a
                            href={t.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Yayında aç"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Aksiyon butonları */}
            <div className="flex items-center gap-2 pt-1" role="group" aria-label="Hızlı aksiyonlar">
              <button
                onClick={handleCopyScript}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Senaryoyu panoya kopyala"
              >
                <Copy size={12} />
                Senaryo
              </button>
              <button
                onClick={handleCopyMeta}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Video meta bilgisini kopyala"
              >
                <ExternalLink size={12} />
                Meta Kopyala
              </button>
              {job.status === "completed" && (
                <button
                  onClick={handleDownload}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  aria-label="Videoyu indir"
                >
                  <Download size={12} />
                  İndir
                </button>
              )}
            </div>

            {/* Tüm Detayları Gör */}
            <button
              onClick={handleDeepDive}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
              aria-label="Detay panelini aç"
            >
              Tüm Detayları Gör
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
