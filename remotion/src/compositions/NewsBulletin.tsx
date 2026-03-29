/**
 * NewsBulletin composition — haber bülteni modülü.
 *
 * Her haber öğesi bir sahne olarak render edilir:
 *   - Arka plan görsel (haber görseli / stock footage)
 *   - Lower-third grafik (başlık + kaynak + kategori)
 *   - Tarih damgası overlay'i
 *   - TTS ses + altyazı
 *
 * Faz 8'de eklenecek:
 *   - Animasyonlu lower-third giriş/çıkış
 *   - Kategori renk kodlama
 *   - Haber arası geçiş animasyonları
 *   - Kayan yazı (ticker) bileşeni
 */

import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { NewsBulletinProps, NewsItem } from "../types";

export const NewsBulletin: React.FC<NewsBulletinProps> = ({
  title,
  items,
  subtitleStyle,
  settings,
  dateStamp,
}) => {
  const { fps } = useVideoConfig();

  if (items.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0a0a1a",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 14,
              color: "#f59e0b",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginBottom: 12,
            }}
          >
            Haber Bülteni
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0" }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              marginTop: 16,
              maxWidth: 400,
            }}
          >
            Haber verisi bekleniyor. RSS pipeline tamamlandığında bu
            composition otomatik olarak doldurulur.
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 12,
              color: "#475569",
            }}
          >
            {settings.width}x{settings.height} · {settings.fps}fps ·{" "}
            Tarih: {dateStamp.slice(0, 10)} · Altyazı: {subtitleStyle}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {items.map((item: NewsItem, idx: number) => {
        const durationFrames = Math.ceil(item.durationInSeconds * fps);
        const from = frameOffset;
        frameOffset += durationFrames;

        return (
          <Sequence
            key={idx}
            from={from}
            durationInFrames={durationFrames}
            name={`Haber ${idx + 1}: ${item.headline.slice(0, 40)}`}
          >
            <AbsoluteFill
              style={{
                backgroundColor: "#0f172a",
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {/* Arka plan — Faz 8'de <Video>/<Img> */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 13, color: "#475569" }}>
                  {item.visualType === "video" ? "🎬" : "🖼️"}{" "}
                  {item.visualSrc || `haber_${idx + 1}`}
                </div>
              </div>

              {/* Tarih damgası — sol üst */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  left: 24,
                  fontSize: 13,
                  color: "#94a3b8",
                  fontWeight: 500,
                }}
              >
                {dateStamp.slice(0, 10)}
              </div>

              {/* Haber numarası — sağ üst */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  right: 24,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                {idx + 1} / {items.length}
              </div>

              {/* Lower-third grafik */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)",
                  padding: "60px 40px 32px",
                }}
              >
                {item.category && (
                  <div
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#f59e0b",
                      marginBottom: 8,
                      padding: "2px 8px",
                      borderRadius: 3,
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                    }}
                  >
                    {item.category}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#fff",
                    lineHeight: 1.3,
                    marginBottom: 6,
                  }}
                >
                  {item.headline}
                </div>
                {item.source && (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>
                    Kaynak: {item.source}
                  </div>
                )}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
