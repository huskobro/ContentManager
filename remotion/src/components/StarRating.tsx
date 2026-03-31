/**
 * StarRating — Animated 5-star rating display.
 *
 * YTRobot-v3/remotion/src/templates/product-review/components/StarRating.tsx
 * kaynaklı kontrollü port.
 *
 * Özellikler:
 *   - 5 SVG yıldız, sıralı dolum animasyonu (8 frame stagger)
 *   - Kısmi dolum (fractional rating desteği: 4.2 gibi)
 *   - Rating sayısı + yorum sayısı gösterimi
 *   - Spring entrance animation
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

const Star: React.FC<{
  fill: number; // 0-1 arası doluluk
  size: number;
  color: string;
  delay: number; // frame delay
  frame: number;
  fps: number;
}> = ({ fill, size, color, delay, frame, fps }) => {
  const fillProgress = interpolate(
    frame,
    [delay, delay + 15],
    [0, fill],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Empty star */}
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: "absolute" }}>
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={`${color}30`}
          stroke={`${color}50`}
          strokeWidth={0.5}
        />
      </svg>
      {/* Filled star (clipped) */}
      <div style={{ position: "absolute", width: `${fillProgress * 100}%`, height: "100%", overflow: "hidden" }}>
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={color}
          />
        </svg>
      </div>
    </div>
  );
};

export const StarRating: React.FC<{
  rating: number;     // 0-5 arası, kesirli
  reviewCount?: number;
  starSize?: number;
  color?: string;
}> = ({
  rating,
  reviewCount,
  starSize = 40,
  color = "#FFD700",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 160 },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        opacity: enterSpring,
        transform: `scale(${enterSpring})`,
      }}
    >
      {/* Stars row */}
      <div style={{ display: "flex", gap: Math.round(starSize * 0.15), alignItems: "center" }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, rating - i));
          return (
            <Star
              key={i}
              fill={fill}
              size={starSize}
              color={color}
              delay={i * 8}
              frame={frame}
              fps={fps}
            />
          );
        })}
      </div>

      {/* Rating number + review count */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: starSize * 0.9,
            fontWeight: 800,
            color: "#F5F5F5",
            fontFamily: "Inter, system-ui, sans-serif",
            lineHeight: 1,
          }}
        >
          {rating.toFixed(1)}
        </span>
        {reviewCount != null && reviewCount > 0 && (
          <span
            style={{
              fontSize: starSize * 0.4,
              color: "#94A3B8",
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 500,
            }}
          >
            ({reviewCount.toLocaleString("tr-TR")} yorum)
          </span>
        )}
      </div>
    </div>
  );
};
