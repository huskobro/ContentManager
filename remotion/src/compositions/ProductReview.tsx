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
import type {
  ProductReviewProps,
  ReviewSection,
  SubtitleChunk,
  SubtitleStyle,
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
  const slideX = interpolate(frame, [0, BADGE_SLIDE_FRAMES], [-120, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const opacity = interpolate(frame, [0, BADGE_SLIDE_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

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
        opacity,
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

  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference * (1 - progress);

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${scaleSpring})`,
      }}
    >
      <div style={{ position: "relative", width: 180, height: 180 }}>
        <svg
          width={180}
          height={180}
          viewBox="0 0 180 180"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <circle
            cx={90}
            cy={90}
            r={70}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={8}
          />
          <circle
            cx={90}
            cy={90}
            r={70}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 90 90)"
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
              fontSize: 48,
              fontWeight: 800,
              color: "#f59e0b",
              lineHeight: 1,
            }}
          >
            {animatedScore.toFixed(1)}
          </span>
          <span
            style={{
              fontSize: 16,
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
}> = ({
  section,
  idx,
  total,
  productName,
  overallScore,
  subtitleChunk,
  subtitleStyle,
  durationFrames,
}) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
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
          top: 24,
          left: 28,
          display: "flex",
          flexDirection: "column",
          gap: 8,
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
          top: 24,
          right: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>
            {productName}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#f59e0b",
            }}
          >
            {overallScore}/10
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
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
            top: "35%",
            left: "8%",
            right: "8%",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: color,
            }}
          >
            {icon}
          </span>
          <span
            style={{
              fontSize: 28,
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
            top: "25%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <ScoreRing score={overallScore} frame={frame} fps={fps} />
        </div>
      )}

      {!showProConHeading && !isVerdict && (
        <div
          style={{
            position: "absolute",
            bottom: 120,
            left: "8%",
            right: "8%",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}
          >
            {section.heading}
          </div>
        </div>
      )}

      {subtitleChunk && (
        <Subtitles
          subtitleChunk={subtitleChunk}
          style={subtitleStyle}
          sceneStartFrame={0}
          sceneDurationFrames={durationFrames}
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
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
