/**
 * StandardVideo composition — genel amaçlı video modülü.
 *
 * Sahne yapısı:
 *   Her sahne bir arka plan görsel (video/image) + TTS ses + altyazı katmanı içerir.
 *   Sahneler sıralı olarak birleştirilir; toplam süre sahnelerin toplamıdır.
 *
 * Faz 8'de eklenecek:
 *   - Ken Burns efekti (zoom/pan animasyonu)
 *   - Karaoke altyazı animasyonu (kelime bazlı renk geçişi)
 *   - Sahne geçiş efektleri (crossfade)
 *   - Vignette ve sinematik bantlar
 */

import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { StandardVideoProps, SceneData } from "../types";

export const StandardVideo: React.FC<StandardVideoProps> = ({
  title,
  scenes,
  subtitleStyle,
  settings,
}) => {
  const { fps } = useVideoConfig();

  // Sahne yoksa bilgi ekranı göster (Remotion Studio'da preview için)
  if (scenes.length === 0) {
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
              color: "#3b82f6",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginBottom: 12,
            }}
          >
            Standard Video
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
            Sahne verisi bekleniyor. Backend pipeline tamamlandığında bu
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
            Altyazı: {subtitleStyle}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Sahneleri sıralı Sequence olarak yerleştir
  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes.map((scene: SceneData) => {
        const sceneDurationFrames = Math.ceil(scene.durationInSeconds * fps);
        const from = frameOffset;
        frameOffset += sceneDurationFrames;

        return (
          <Sequence
            key={scene.index}
            from={from}
            durationInFrames={sceneDurationFrames}
            name={`Sahne ${scene.index + 1}`}
          >
            <AbsoluteFill
              style={{
                backgroundColor: "#0f172a",
                justifyContent: "center",
                alignItems: "center",
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {/* Arka plan görsel — Faz 8'de <Video>/<Img> ile değiştirilecek */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "#0f172a",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 13, color: "#475569" }}>
                  {scene.visualType === "video" ? "🎬" : "🖼️"}{" "}
                  {scene.visualSrc || `sahne_${scene.index + 1}`}
                </div>
              </div>

              {/* Altyazı katmanı — Faz 8'de WordTiming tabanlı animasyon */}
              <div
                style={{
                  position: "absolute",
                  bottom: 80,
                  left: "10%",
                  right: "10%",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    padding: "8px 20px",
                    borderRadius: 6,
                    backgroundColor: "rgba(0,0,0,0.7)",
                    color: "#fff",
                    fontSize: 22,
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {scene.narration.slice(0, 120)}
                  {scene.narration.length > 120 ? "…" : ""}
                </div>
              </div>

              {/* Sahne numarası overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  right: 24,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                {scene.index + 1} / {scenes.length}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
