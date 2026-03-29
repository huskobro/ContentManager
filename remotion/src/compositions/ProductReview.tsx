/**
 * ProductReview composition — ürün inceleme modülü.
 *
 * Bölüm yapısı: hook → overview → pros → cons → verdict
 * Her bölüm ayrı bir Sequence olarak render edilir.
 *
 * Faz 8'de eklenecek:
 *   - Puan gösterge animasyonu (verdict bölümünde)
 *   - Pro/Con ikon animasyonları (✓ / ✕)
 *   - Bölüm geçiş efektleri
 *   - Ürün karşılaştırma overlay
 */

import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ProductReviewProps, ReviewSection } from "../types";

/** Bölüm tipine göre renk kodlama */
const SECTION_COLORS: Record<string, string> = {
  hook: "#8b5cf6",
  overview: "#3b82f6",
  pros: "#10b981",
  cons: "#ef4444",
  verdict: "#f59e0b",
};

const SECTION_LABELS: Record<string, string> = {
  hook: "Giriş",
  overview: "Genel Bakış",
  pros: "Artılar",
  cons: "Eksiler",
  verdict: "Sonuç",
};

export const ProductReview: React.FC<ProductReviewProps> = ({
  title,
  productName,
  overallScore,
  sections,
  subtitleStyle,
  settings,
}) => {
  const { fps } = useVideoConfig();

  if (sections.length === 0) {
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
              color: "#10b981",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginBottom: 12,
            }}
          >
            Ürün İnceleme
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0" }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#94a3b8",
              marginTop: 8,
            }}
          >
            {productName} · Puan: {overallScore}/10
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              marginTop: 16,
              maxWidth: 400,
            }}
          >
            İnceleme verisi bekleniyor. Pipeline tamamlandığında bu
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

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {sections.map((section: ReviewSection, idx: number) => {
        const durationFrames = Math.ceil(section.durationInSeconds * fps);
        const from = frameOffset;
        frameOffset += durationFrames;
        const color = SECTION_COLORS[section.type] || "#64748b";
        const label = SECTION_LABELS[section.type] || section.type;

        return (
          <Sequence
            key={idx}
            from={from}
            durationInFrames={durationFrames}
            name={`${label}: ${section.heading.slice(0, 30)}`}
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
                  {section.visualType === "video" ? "🎬" : "🖼️"}{" "}
                  {section.visualSrc || `bolum_${idx + 1}`}
                </div>
              </div>

              {/* Bölüm etiketi — sol üst */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  left: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: color,
                    padding: "3px 10px",
                    borderRadius: 4,
                    backgroundColor: `${color}22`,
                    border: `1px solid ${color}44`,
                  }}
                >
                  {label}
                </div>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {idx + 1} / {sections.length}
                </span>
              </div>

              {/* Ürün adı + puan — sağ üst */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  right: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: "#94a3b8",
                }}
              >
                <span>{productName}</span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#f59e0b",
                  }}
                >
                  {overallScore}/10
                </span>
              </div>

              {/* Bölüm başlığı + altyazı */}
              <div
                style={{
                  position: "absolute",
                  bottom: 60,
                  left: "8%",
                  right: "8%",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#fff",
                    marginBottom: 12,
                  }}
                >
                  {section.heading}
                </div>
                <div
                  style={{
                    display: "inline-block",
                    padding: "8px 20px",
                    borderRadius: 6,
                    backgroundColor: "rgba(0,0,0,0.7)",
                    color: "#e2e8f0",
                    fontSize: 18,
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {section.narration.slice(0, 140)}
                  {section.narration.length > 140 ? "…" : ""}
                </div>
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
