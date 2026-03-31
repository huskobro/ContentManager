/**
 * FloatingComments — Floating speech-bubble comment cards.
 *
 * YTRobot-v3/remotion/src/templates/product-review/components/FloatingComments.tsx
 * kaynaklı kontrollü port.
 *
 * Özellikler:
 *   - 5 mutlak pozisyon (köşeler + kenar)
 *   - Pop-in spring giriş (scale 0.3 → 1)
 *   - Sin-wave floating motion (5px amplitude)
 *   - 3sn sonra fade-out
 *   - Blur backdrop + speech bubble tail
 *   - Stil-bağımlı palet (card bg, border, accent renkleri)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { useLayout } from "./useLayout";
import type { ProductReviewStyle } from "../types";

/** Landscape pozisyonlari */
const POSITIONS_HORIZONTAL = [
  { top: "8%", right: "5%", rotateDeg: 2 },
  { top: "22%", left: "4%", rotateDeg: -1.5 },
  { bottom: "35%", right: "3%", rotateDeg: 1 },
  { bottom: "20%", left: "6%", rotateDeg: -2 },
  { top: "45%", right: "8%", rotateDeg: 0.5 },
];

/** Vertical pozisyonlari — daha dar alana sığması için ayarlanmış */
const POSITIONS_VERTICAL = [
  { top: "12%", right: "3%", rotateDeg: 1.5 },
  { top: "28%", left: "3%", rotateDeg: -1 },
  { bottom: "40%", right: "3%", rotateDeg: 0.5 },
];

const STYLE_PALETTES: Record<string, { cardBg: string; cardBorder: string; accent: string; text: string }> = {
  modern:    { cardBg: "rgba(30,41,59,0.85)",  cardBorder: "rgba(100,116,139,0.3)", accent: "#3B82F6", text: "#E2E8F0" },
  dark:      { cardBg: "rgba(15,23,42,0.9)",   cardBorder: "rgba(51,65,85,0.4)",    accent: "#8B5CF6", text: "#CBD5E1" },
  energetic: { cardBg: "rgba(127,29,29,0.8)",   cardBorder: "rgba(239,68,68,0.3)",   accent: "#EF4444", text: "#FEE2E2" },
  minimal:   { cardBg: "rgba(255,255,255,0.12)", cardBorder: "rgba(255,255,255,0.2)", accent: "#94A3B8", text: "#F1F5F9" },
  premium:   { cardBg: "rgba(30,27,22,0.85)",    cardBorder: "rgba(217,180,100,0.3)", accent: "#F59E0B", text: "#FEF3C7" },
};

const FloatingComment: React.FC<{
  text: string;
  index: number;
  stagger: number;
  palette: typeof STYLE_PALETTES.modern;
}> = ({ text, index, stagger, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();
  const fl = layout.floatingComments;

  const enterFrame = index * stagger;
  const localFrame = Math.max(0, frame - enterFrame);

  // Don't render before entrance
  if (localFrame <= 0) return null;

  // Pop-in spring
  const popSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 10, stiffness: 180 },
  });
  const scale = interpolate(popSpring, [0, 1], [0.3, 1]);

  // Floating motion
  const floatY = 5 * Math.sin((localFrame / fps) * Math.PI * 0.8);

  // Fade-out after ~3 seconds (90 frames at 30fps)
  const fadeOut = interpolate(
    localFrame,
    [fps * 3, fps * 3 + 15],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (fadeOut <= 0) return null;

  const positions = layout.isVertical ? POSITIONS_VERTICAL : POSITIONS_HORIZONTAL;
  const pos = positions[index % positions.length];
  const { rotateDeg, ...posStyle } = pos;

  return (
    <div
      style={{
        position: "absolute" as const,
        ...posStyle,
        transform: `scale(${scale}) translateY(${floatY}px) rotate(${rotateDeg}deg)`,
        opacity: popSpring * fadeOut,
        maxWidth: fl.maxWidth,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          backgroundColor: palette.cardBg,
          backdropFilter: "blur(12px)",
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: Math.round(16 * layout.scale),
          padding: fl.padding,
          display: "flex",
          alignItems: "flex-start",
          gap: Math.round(10 * layout.scale),
        }}
      >
        {/* Avatar dot */}
        <div
          style={{
            width: fl.avatarSize,
            height: fl.avatarSize,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${palette.accent} 0%, ${palette.cardBorder} 100%)`,
            flexShrink: 0,
            marginTop: 2,
          }}
        />
        {/* Comment text */}
        <div
          style={{
            fontSize: fl.fontSize,
            fontWeight: 500,
            color: palette.text,
            fontFamily: "Inter, system-ui, sans-serif",
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};

export const FloatingComments: React.FC<{
  comments: string[];
  style?: ProductReviewStyle;
  stagger?: number; // frame delay between comments
}> = ({ comments, style = "modern", stagger = 40 }) => {
  const layout = useLayout();

  if (!comments || comments.length === 0) return null;

  const palette = STYLE_PALETTES[style] || STYLE_PALETTES.modern;
  const visibleComments = comments.slice(0, layout.floatingComments.maxComments);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {visibleComments.map((text, i) => (
        <FloatingComment
          key={i}
          text={text}
          index={i}
          stagger={stagger}
          palette={palette}
        />
      ))}
    </div>
  );
};
