/**
 * NewsTicker — Kayan haber şeridi bileşeni.
 *
 * YTRobot-v3/remotion/src/templates/news-bulletin/components/NewsTicker.tsx
 * kaynaklı kontrollü port.
 *
 * Özellikler:
 *   - Sonsuz yatay scroll (metin 3x tekrarlanır, modüler wrap)
 *   - Sol'da stil-bağımlı "HABERLER" / "NEWS" accent badge
 *   - Kenar fade efektleri (sol 80px, sağ 120px)
 *   - 9 stil variasyonu (accent renkleri)
 *   - Ayırıcı: " ◆ " her haber arasında
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { useLayout } from "./useLayout";
import type { TickerItem, BulletinStyle } from "../types";

const SEPARATOR = "   ◆   ";

const ACCENT_COLORS: Record<string, string> = {
  breaking: "#DC2626",
  tech: "#8B5CF6",
  corporate: "#3B82F6",
  sport: "#10B981",
  finance: "#F59E0B",
  weather: "#06B6D4",
  science: "#A855F7",
  entertainment: "#EC4899",
  dark: "#64748B",
};

const getLabel = (lang?: string): string => {
  return lang === "en" ? "NEWS" : "HABERLER";
};

export const NewsTicker: React.FC<{
  items: TickerItem[];
  style?: BulletinStyle;
  lang?: string;
}> = ({ items, style = "corporate", lang = "tr" }) => {
  const frame = useCurrentFrame();
  const layout = useLayout();
  const tl = layout.ticker;

  if (!items || items.length === 0) return null;

  const rawText = items.map((t) => t.text).join(SEPARATOR);
  // 3x tekrar — scroll sirasinda bosluk olusmasini engeller
  const fullText = `${rawText}${SEPARATOR}${rawText}${SEPARATOR}${rawText}`;
  const singleWidth = (rawText.length + SEPARATOR.length) * tl.charWidth;

  const offset = (frame * tl.speed) % singleWidth;
  const x = -offset;

  const accent = ACCENT_COLORS[style] || ACCENT_COLORS.corporate;
  const label = getLabel(lang);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: tl.height,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* Sol accent badge */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          padding: `0 ${Math.round(16 * layout.scale)}px`,
          height: "100%",
          backgroundColor: accent,
          fontFamily: "'Bebas Neue', Oswald, Impact, sans-serif",
          fontSize: tl.badgeFontSize,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </div>

      {/* Scroll container */}
      <div
        style={{
          position: "relative",
          flex: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Sol fade */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: tl.fadeLeft,
            background: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, transparent 100%)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
        {/* Sag fade */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: tl.fadeRight,
            background: "linear-gradient(to left, rgba(0,0,0,0.85) 0%, transparent 100%)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />

        {/* Kayan metin */}
        <div
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            transform: `translateX(${x}px)`,
            fontFamily: "Montserrat, Arial, sans-serif",
            fontSize: tl.fontSize,
            fontWeight: 600,
            color: "#F1F5F9",
            letterSpacing: "0.01em",
          }}
        >
          {fullText}
        </div>
      </div>
    </div>
  );
};
