/**
 * BreakingNewsOverlay — "SON DAKİKA" flash bileşeni.
 *
 * YTRobot-v3/remotion/src/templates/news-bulletin/components/BreakingNewsOverlay.tsx
 * kaynaklı kontrollü port.
 *
 * Özellikler:
 *   - Spring-animated slide-in badge (soldan) + network name (sağdan)
 *   - Stil-bağımlı iki tonlu gradient renk sistemi
 *   - 3 hızlı sin-wave flash pulse (ilk 30 frame)
 *   - Arrow-head clipPath badge şekli
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { useLayout } from "./useLayout";
import type { BulletinStyle } from "../types";

const STYLE_COLORS: Record<string, { color: string; darkColor: string }> = {
  breaking:      { color: "#DC2626", darkColor: "#991B1B" },
  tech:          { color: "#8B5CF6", darkColor: "#6D28D9" },
  corporate:     { color: "#3B82F6", darkColor: "#1D4ED8" },
  sport:         { color: "#10B981", darkColor: "#047857" },
  finance:       { color: "#F59E0B", darkColor: "#B45309" },
  weather:       { color: "#06B6D4", darkColor: "#0E7490" },
  science:       { color: "#A855F7", darkColor: "#7C3AED" },
  entertainment: { color: "#EC4899", darkColor: "#BE185D" },
  dark:          { color: "#475569", darkColor: "#1E293B" },
};

const getLabel = (style: BulletinStyle, lang?: string): string => {
  if (style === "breaking") return lang === "en" ? "BREAKING NEWS" : "SON DAKİKA";
  return lang === "en" ? "LIVE" : "CANLI";
};

export const BreakingNewsOverlay: React.FC<{
  networkName?: string;
  style?: BulletinStyle;
  lang?: string;
  /** Overlay'in gösterildiği frame aralığı (from/to, composition-relative) */
  startFrame?: number;
  durationFrames?: number;
}> = ({
  networkName = "",
  style = "breaking",
  lang = "tr",
  startFrame = 0,
  durationFrames = 60,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();
  const bl = layout.breakingOverlay;

  if (frame >= durationFrames) return null;

  const colors = STYLE_COLORS[style] || STYLE_COLORS.breaking;
  const label = getLabel(style, lang);

  // Badge slide-in from left
  const badgeSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 200 },
  });
  const badgeX = interpolate(badgeSpring, [0, 1], [-600, 0]);

  // Network name slide-in from right (8 frame delay)
  const nameSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 14, stiffness: 200 },
  });
  const nameX = interpolate(nameSpring, [0, 1], [400, 0]);

  // Flash pulse — 3 quick flashes in first 30 frames
  const flashIntensity = frame < 30
    ? 0.15 * Math.abs(Math.sin((frame / 30) * Math.PI * 3))
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: bl.topPosition,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        pointerEvents: "none",
      }}
    >
      {/* Flash overlay */}
      {flashIntensity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: -200,
            backgroundColor: `rgba(255,255,255,${flashIntensity})`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Badge */}
      <div
        style={{
          transform: `translateX(${badgeX}px)`,
          display: "flex",
          alignItems: "center",
          height: bl.badgeHeight,
          background: `linear-gradient(135deg, ${colors.color} 0%, ${colors.darkColor} 100%)`,
          clipPath: `polygon(0 0, calc(100% - ${Math.round(20 * layout.scale)}px) 0, 100% 50%, calc(100% - ${Math.round(20 * layout.scale)}px) 100%, 0 100%)`,
          padding: bl.badgePadding,
        }}
      >
        <span
          style={{
            fontFamily: "'Bebas Neue', Oswald, Impact, sans-serif",
            fontSize: bl.badgeFontSize,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>

      {/* Network name */}
      {networkName && (
        <div
          style={{
            transform: `translateX(${nameX}px)`,
            display: "flex",
            alignItems: "center",
            height: bl.badgeHeight,
            backgroundColor: "rgba(0,0,0,0.75)",
            paddingLeft: Math.round(16 * layout.scale),
            paddingRight: Math.round(24 * layout.scale),
          }}
        >
          <span
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: bl.networkFontSize,
              fontWeight: 600,
              color: "#E2E8F0",
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
            }}
          >
            {networkName}
          </span>
        </div>
      )}
    </div>
  );
};
