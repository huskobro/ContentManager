/**
 * PriceBadge — Animated price display with optional discount.
 *
 * YTRobot-v3/remotion/src/templates/product-review/components/PriceBadge.tsx
 * kaynaklı kontrollü port.
 *
 * Özellikler:
 *   - Spring-animated counter (0 → price)
 *   - Slide-up entrance
 *   - Strikethrough original price (varsa)
 *   - İndirim badge'i (red pop-in, 30 frame gecikme)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { useLayout } from "./useLayout";

export const PriceBadge: React.FC<{
  price: number;
  originalPrice?: number;
  currency?: string;
}> = ({ price, originalPrice, currency = "TL" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();
  const pl = layout.priceBadge;

  // Counter animation: 0 → price over 90 frames
  const counterProgress = interpolate(frame, [0, 90], [0, price], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Slide-up entrance
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 160 },
  });
  const slideY = interpolate(enterSpring, [0, 1], [30, 0]);

  // Discount badge pop-in (30 frame delay)
  const hasDiscount = originalPrice && originalPrice > price;
  const discountPct = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;
  const discountSpring = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const formattedPrice = Math.round(counterProgress).toLocaleString("tr-TR");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transform: `translateY(${slideY}px)`,
        opacity: enterSpring,
      }}
    >
      {/* Original price strikethrough */}
      {hasDiscount && (
        <div
          style={{
            fontSize: pl.originalPriceFontSize,
            fontWeight: 500,
            color: "#94A3B8",
            textDecoration: "line-through",
            fontFamily: "Montserrat, Arial, sans-serif",
          }}
        >
          {originalPrice.toLocaleString("tr-TR")} {currency}
        </div>
      )}

      {/* Current price */}
      <div
        style={{
          fontSize: pl.currentPriceFontSize,
          fontWeight: 800,
          color: "#FFFFFF",
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          lineHeight: 1,
          letterSpacing: "0.02em",
        }}
      >
        {formattedPrice} {currency}
      </div>

      {/* Discount badge */}
      {hasDiscount && (
        <div
          style={{
            transform: `scale(${discountSpring})`,
            backgroundColor: "#EF4444",
            borderRadius: Math.round(8 * layout.scale),
            padding: `${Math.round(6 * layout.scale)}px ${Math.round(16 * layout.scale)}px`,
            display: "flex",
            alignItems: "center",
            gap: Math.round(4 * layout.scale),
          }}
        >
          <span
            style={{
              fontSize: pl.discountFontSize,
              fontWeight: 800,
              color: "#fff",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            %{discountPct} INDIRIM
          </span>
        </div>
      )}
    </div>
  );
};
