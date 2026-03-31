import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  OffthreadVideo,
  Img,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  spring,
} from "remotion";
import { Subtitles } from "../components/Subtitles";
import { PriceBadge } from "../components/PriceBadge";
import { StarRating } from "../components/StarRating";
import { FloatingComments } from "../components/FloatingComments";
import { useLayout } from "../components/useLayout";
import type {
  ProductReviewProps,
  ReviewSection,
  SubtitleChunk,
  SubtitleStyle,
  SubtitleAnimation,
  SubtitleFont,
  ProductReviewStyle,
} from "../types";

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

const SECTION_ICONS: Record<string, string> = {
  hook: "⚡",
  overview: "📋",
  pros: "✓",
  cons: "✕",
  verdict: "⭐",
};

const CROSSFADE_FRAMES = 12;
const DEFAULT_DURATION_SECONDS = 5;
const SCORE_ANIM_FRAMES = 30;
const BADGE_SLIDE_FRAMES = 15;

const SectionBadge: React.FC<{
  color: string;
  label: string;
  icon: string;
  frame: number;
  fps: number;
}> = ({ color, label, icon, frame, fps }) => {
  // Spring-based entrance (YTRobot-v3 pattern)
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const slideX = interpolate(enterSpring, [0, 1], [-120, 0]);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        color: color,
        padding: "4px 12px",
        borderRadius: 6,
        backgroundColor: `${color}22`,
        border: `1.5px solid ${color}55`,
        transform: `translateX(${slideX}px)`,
        opacity: enterSpring,
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
};

const ScoreRing: React.FC<{
  score: number;
  frame: number;
  fps: number;
}> = ({ score, frame, fps }) => {
  const layout = useLayout();
  const sr = layout.scoreRing;

  const animatedScore = interpolate(frame, [0, SCORE_ANIM_FRAMES], [0, score], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const progress = interpolate(
    frame,
    [0, SCORE_ANIM_FRAMES],
    [0, score / 10],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const circumference = 2 * Math.PI * sr.radius;
  const strokeDashoffset = circumference * (1 - progress);
  const center = sr.size / 2;

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });

  // Glow pulse on gauge (YTRobot-v3/ScoreCard.tsx port)
  const glowIntensity = 0.3 + 0.2 * Math.sin((frame / fps) * Math.PI * 2);
  const scoreColor = score >= 8 ? "#10b981" : score >= 6 ? "#f59e0b" : score >= 4 ? "#f97316" : "#ef4444";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${scaleSpring})`,
        filter: `drop-shadow(0 0 ${8 + glowIntensity * 12}px ${scoreColor}66)`,
      }}
    >
      <div style={{ position: "relative", width: sr.size, height: sr.size }}>
        <svg
          width={sr.size}
          height={sr.size}
          viewBox={`0 0 ${sr.size} ${sr.size}`}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <circle
            cx={center}
            cy={center}
            r={sr.radius}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={sr.strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={sr.radius}
            fill="none"
            stroke={scoreColor}
            strokeWidth={sr.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: sr.scoreFontSize,
              fontWeight: 800,
              color: scoreColor,
              lineHeight: 1,
            }}
          >
            {animatedScore.toFixed(1)}
          </span>
          <span
            style={{
              fontSize: sr.divisionFontSize,
              color: "#94a3b8",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            / 10
          </span>
        </div>
      </div>
    </div>
  );
};

const BackgroundVisual: React.FC<{
  visualSrc: string;
  visualType: "video" | "image";
}> = ({ visualSrc, visualType }) => {
  if (!visualSrc) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0f172a" }} />
    );
  }

  if (visualType === "video") {
    return (
      <OffthreadVideo
        src={visualSrc}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  return (
    <Img
      src={visualSrc}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
      pointerEvents: "none",
    }}
  />
);

const CrossfadeIn: React.FC<{
  frame: number;
  durationFrames: number;
}> = ({ frame, durationFrames }) => {
  const fadeIn = interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const fadeOut = interpolate(
    frame,
    [durationFrames - CROSSFADE_FRAMES, durationFrames],
    [1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        opacity: 1 - opacity,
        pointerEvents: "none",
      }}
    />
  );
};

const SectionRenderer: React.FC<{
  section: ReviewSection;
  idx: number;
  total: number;
  productName: string;
  overallScore: number;
  subtitleChunk: SubtitleChunk | undefined;
  subtitleStyle: SubtitleStyle;
  durationFrames: number;
  subtitleAnimation?: SubtitleAnimation;
  subtitleFont?: SubtitleFont;
  price?: number;
  originalPrice?: number;
  currency?: string;
  starRating?: number;
  reviewCount?: number;
  topComments?: string[];
  reviewStyle?: ProductReviewStyle;
}> = ({
  section,
  idx,
  total,
  productName,
  overallScore,
  subtitleChunk,
  subtitleStyle,
  durationFrames,
  subtitleAnimation,
  subtitleFont,
  price,
  originalPrice,
  currency = "TL",
  starRating,
  reviewCount,
  topComments,
  reviewStyle = "modern",
}) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const layout = useLayout();
  const color = SECTION_COLORS[section.type] || "#64748b";
  const label = SECTION_LABELS[section.type] || section.type;
  const icon = SECTION_ICONS[section.type] || "●";

  const showProConHeading =
    section.type === "pros" || section.type === "cons";
  const isVerdict = section.type === "verdict";

  return (
    <AbsoluteFill
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <BackgroundVisual
        visualSrc={section.visualSrc}
        visualType={section.visualType}
      />

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {section.audioSrc ? <Audio src={section.audioSrc} /> : null}

      <div
        style={{
          position: "absolute",
          top: layout.safeArea.top + Math.round(4 * layout.scale),
          left: layout.safeArea.left + Math.round(4 * layout.scale),
          display: "flex",
          flexDirection: "column",
          gap: Math.round(8 * layout.scale),
        }}
      >
        <SectionBadge
          color={color}
          label={label}
          icon={icon}
          frame={frame}
          fps={fps}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: layout.safeArea.top + Math.round(4 * layout.scale),
          right: layout.safeArea.right + Math.round(4 * layout.scale),
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: Math.round(4 * layout.scale),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: Math.round(10 * layout.scale),
          }}
        >
          <span style={{ fontSize: Math.round(14 * layout.scale), color: "#94a3b8", fontWeight: 500 }}>
            {productName}
          </span>
          <span
            style={{
              fontSize: Math.round(15 * layout.scale),
              fontWeight: 700,
              color: "#f59e0b",
            }}
          >
            {overallScore}/10
          </span>
        </div>
        <span
          style={{
            fontSize: layout.overlay.counterFontSize,
            color: "#64748b",
            fontWeight: 500,
          }}
        >
          {idx + 1} / {total}
        </span>
      </div>

      {showProConHeading && (
        <div
          style={{
            position: "absolute",
            top: layout.proCon.topPosition,
            left: layout.proCon.horizontalPadding,
            right: layout.proCon.horizontalPadding,
            display: "flex",
            alignItems: "center",
            gap: Math.round(12 * layout.scale),
          }}
        >
          <span
            style={{
              fontSize: layout.proCon.iconFontSize,
              fontWeight: 800,
              color: color,
            }}
          >
            {icon}
          </span>
          <span
            style={{
              fontSize: layout.proCon.headingFontSize,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {section.heading}
          </span>
        </div>
      )}

      {isVerdict && (
        <div
          style={{
            position: "absolute",
            top: layout.scoreRing.topPosition,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: Math.round(16 * layout.scale),
          }}
        >
          <ScoreRing score={overallScore} frame={frame} fps={fps} />

          {/* Star rating — verdict sahnesinde score ring altinda */}
          {starRating != null && starRating > 0 && (
            <StarRating
              rating={starRating}
              reviewCount={reviewCount}
              starSize={layout.starRating.starSize}
            />
          )}

          {/* Price badge — verdict sahnesinde star rating altinda */}
          {price != null && price > 0 && (
            <PriceBadge
              price={price}
              originalPrice={originalPrice}
              currency={currency}
            />
          )}
        </div>
      )}

      {!showProConHeading && !isVerdict && (
        <div
          style={{
            position: "absolute",
            bottom: Math.round(layout.isVertical ? 180 : 120) * layout.scale,
            left: layout.proCon.horizontalPadding,
            right: layout.proCon.horizontalPadding,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: Math.round(22 * layout.scale),
              fontWeight: 700,
              color: "#fff",
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}
          >
            {section.heading}
          </div>
        </div>
      )}

      {/* Floating comments — overview ve pros sahnelerinde */}
      {(section.type === "overview" || section.type === "pros") &&
        topComments &&
        topComments.length > 0 && (
          <FloatingComments
            comments={topComments}
            style={reviewStyle}
            stagger={40}
          />
        )}

      {subtitleChunk && (
        <Subtitles
          subtitleChunk={subtitleChunk}
          style={subtitleStyle}
          sceneStartFrame={0}
          sceneDurationFrames={durationFrames}
          animation={subtitleAnimation}
          font={subtitleFont}
        />
      )}

      <Vignette />

      <CrossfadeIn frame={frame} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};

export const ProductReview: React.FC<ProductReviewProps> = ({
  title,
  productName,
  overallScore,
  sections,
  subtitles,
  subtitleStyle,
  settings,
  subtitleAnimation,
  subtitleFont,
  price,
  originalPrice,
  currency = "TL",
  starRating,
  reviewCount,
  topComments,
  reviewStyle = "modern",
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
        const durationFrames = Math.ceil(
          (section.durationInSeconds || DEFAULT_DURATION_SECONDS) * fps
        );
        const from = frameOffset;
        frameOffset += durationFrames;
        const label = SECTION_LABELS[section.type] || section.type;
        const subtitleChunk: SubtitleChunk | undefined = subtitles[idx];

        return (
          <Sequence
            key={idx}
            from={from}
            durationInFrames={durationFrames}
            name={`${label}: ${section.heading.slice(0, 30)}`}
          >
            <SectionRenderer
              section={section}
              idx={idx}
              total={sections.length}
              productName={productName}
              overallScore={overallScore}
              subtitleChunk={subtitleChunk}
              subtitleStyle={subtitleStyle}
              durationFrames={durationFrames}
              subtitleAnimation={subtitleAnimation}
              subtitleFont={subtitleFont}
              price={price}
              originalPrice={originalPrice}
              currency={currency}
              starRating={starRating}
              reviewCount={reviewCount}
              topComments={topComments}
              reviewStyle={reviewStyle}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
