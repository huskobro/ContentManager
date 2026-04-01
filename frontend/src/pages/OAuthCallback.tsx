/**
 * OAuthCallback — OAuth popup callback sayfası.
 *
 * Bu sayfa popup window'da açılır. URL parametrelerini okur,
 * opener (ana pencere) 'e postMessage gönderir ve kendini kapatır.
 *
 * Desteklenen URL parametreleri:
 *   ?oauth_success=1                → başarı
 *   ?oauth_error=<error_code>       → hata
 *
 * Ana pencere (PlatformAccountManager veya ChannelManager) window.addEventListener("message", ...)
 * ile bu mesajı dinler.
 */

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("oauth_success");
    const error = params.get("oauth_error");

    const message = success
      ? { type: "oauth_result", status: "success" }
      : { type: "oauth_result", status: "error", error: error ?? "unknown" };

    // opener'a mesaj gönder (aynı origin — güvenli)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
    }

    // Küçük gecikme → mesajın alınması için zaman tanı, sonra kapat
    const timer = setTimeout(() => {
      window.close();
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <Loader2 className="animate-spin text-primary" size={28} />
        <p className="text-sm text-muted-foreground">Tamamlanıyor…</p>
      </div>
    </div>
  );
}
