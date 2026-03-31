/**
 * VideoEffects — Video renk/stil efekt overlay'leri.
 *
 * YTRobot-v3/remotion/src/Scene.tsx (lines 331-396) kaynaklı kontrollü port.
 *
 * Desteklenen efektler:
 *   - none: overlay yok
 *   - vignette: kenar karartma (radial gradient)
 *   - warm: sıcak ton overlay (turuncu, multiply)
 *   - cool: soğuk ton overlay (mavi, multiply)
 *   - cinematic: üst/alt letterbox barları (%10.5 yükseklik)
 */

import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { VideoEffect } from "../types";

export const VideoEffectOverlay: React.FC<{
  effect: VideoEffect;
}> = ({ effect }) => {
  const { height } = useVideoConfig();

  if (effect === "none") return null;

  if (effect === "vignette") {
    return (
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.75) 100%)",
          pointerEvents: "none",
        }}
      />
    );
  }

  if (effect === "warm") {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "rgba(255,140,0,0.12)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
    );
  }

  if (effect === "cool") {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "rgba(0,100,255,0.10)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
    );
  }

  if (effect === "cinematic") {
    const barHeight = Math.round(height * 0.105);
    return (
      <>
        {/* Top letterbox bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: barHeight,
            backgroundColor: "#000",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
        {/* Bottom letterbox bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: barHeight,
            backgroundColor: "#000",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      </>
    );
  }

  return null;
};
