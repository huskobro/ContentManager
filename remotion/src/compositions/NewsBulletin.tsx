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
import { NewsTicker } from "../components/NewsTicker";
import { BreakingNewsOverlay } from "../components/BreakingNewsOverlay";
import { useLayout } from "../components/useLayout";
import type { NewsBulletinProps, NewsItem, SubtitleChunk, SubtitleStyle, SubtitleAnimation, SubtitleFont, TickerItem, BulletinStyle } from "../types";

const CATEGORY_COLORS: Record<string, string> = {
  ekonomi: "#10b981",
  spor: "#3b82f6",
  teknoloji: "#8b5cf6",
  siyaset: "#ef4444",
  dunya: "#f59e0b",
};

const getCategoryColor = (category?: string): string => {
  if (!category) return "#64748b";
  return CATEGORY_COLORS[category.toLowerCase()] ?? "#64748b";
};

const DEFAULT_DURATION_SECONDS = 5;
const FADE_IN_FRAMES = 12;
const LOWER_THIRD_SLIDE_FRAMES = 15;
const FADEOUT_FRAMES = 20;

export const NewsBulletin: React.FC<NewsBulletinProps> = ({
  title,
  items,
  subtitles,
  subtitleStyle,
  settings,
  dateStamp,
  subtitleAnimation,
  subtitleFont,
  ticker,
  bulletinStyle = "corporate",
  networkName,
  lang = "tr",
}) => {
  const { fps } = useVideoConfig();
  const globalFrame = useCurrentFrame();

  const isBreaking = bulletinStyle === "breaking";

  if (items.length === 0) {
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
              color: "#f59e0b",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginBottom: 12,
            }}
          >
            Haber Bülteni
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
            Haber verisi bekleniyor. RSS pipeline tamamlandiginda bu
            composition otomatik olarak doldurulur.
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 12,
              color: "#475569",
            }}
          >
            {settings.width}x{settings.height} &middot; {settings.fps}fps
            &middot; Tarih: {dateStamp.slice(0, 10)} &middot; Altyazi:{" "}
            {subtitleStyle}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {items.map((item: NewsItem, idx: number) => {
        const durationSeconds =
          item.durationInSeconds > 0
            ? item.durationInSeconds
            : DEFAULT_DURATION_SECONDS;
        const durationFrames = Math.ceil(durationSeconds * fps);
        const from = frameOffset;
        frameOffset += durationFrames;

        const subtitleChunk: SubtitleChunk | undefined = subtitles[idx];

        return (
          <Sequence
            key={idx}
            from={from}
            durationInFrames={durationFrames}
            name={`Haber ${idx + 1}: ${item.headline.slice(0, 40)}`}
          >
            <NewsItemScene
              item={item}
              index={idx}
              total={items.length}
              dateStamp={dateStamp}
              subtitleChunk={subtitleChunk}
              subtitleStyle={subtitleStyle}
              durationFrames={durationFrames}
              isFirst={idx === 0}
              subtitleAnimation={subtitleAnimation}
              subtitleFont={subtitleFont}
            />
          </Sequence>
        );
      })}

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Breaking news overlay — sadece breaking stilde, ilk 60 frame */}
      {isBreaking && (
        <Sequence from={20} durationInFrames={60} name="Breaking Flash">
          <BreakingNewsOverlay
            networkName={networkName}
            style={bulletinStyle}
            lang={lang}
            durationFrames={60}
          />
        </Sequence>
      )}

      {/* Ticker bar — frame 30'dan itibaren sürekli */}
      {ticker && ticker.length > 0 && (
        <Sequence from={30} name="News Ticker">
          <NewsTicker
            items={ticker}
            style={bulletinStyle}
            lang={lang}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

interface NewsItemSceneProps {
  item: NewsItem;
  index: number;
  total: number;
  dateStamp: string;
  subtitleChunk: SubtitleChunk | undefined;
  subtitleStyle: SubtitleStyle;
  durationFrames: number;
  isFirst: boolean;
  subtitleAnimation?: SubtitleAnimation;
  subtitleFont?: SubtitleFont;
}

const NewsItemScene: React.FC<NewsItemSceneProps> = ({
  item,
  index,
  total,
  dateStamp,
  subtitleChunk,
  subtitleStyle,
  durationFrames,
  isFirst,
  subtitleAnimation,
  subtitleFont,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();

  const fadeInOpacity = isFirst
    ? 1
    : interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
        extrapolateRight: "clamp",
      });

  // ── Spring-based lower-third (YTRobot-v3/LowerThird.tsx port) ──
  // 3-phase entrance: accent bar → panel slide-up → headline slide
  const accentBarScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 220 },
  });
  const panelSlide = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const headlineSlide = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 16, stiffness: 160 },
  });

  // Fade-out in last frames (YTRobot-v3 pattern)
  const fadeOutOpacity = interpolate(
    frame,
    [durationFrames - FADEOUT_FRAMES, durationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const panelTranslateY = interpolate(panelSlide, [0, 1], [80, 0]);
  const headlineTranslateX = interpolate(headlineSlide, [0, 1], [-60, 0]);

  const categoryColor = getCategoryColor(item.category);

  // Live indicator pulse (YTRobot-v3 pattern)
  const liveIndicatorOpacity = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 2);

  return (
    <AbsoluteFill
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        opacity: fadeInOpacity * fadeOutOpacity,
      }}
    >
      <AbsoluteFill>
        {item.visualSrc ? (
          item.visualType === "video" ? (
            <OffthreadVideo
              src={item.visualSrc}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Img
              src={item.visualSrc}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        ) : (
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
            }}
          />
        )}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)",
        }}
      />

      {item.audioSrc ? <Audio src={item.audioSrc} /> : null}

      {/* Top bar: date + live indicator + counter */}
      <div
        style={{
          position: "absolute",
          top: layout.overlay.counterTop,
          left: layout.safeArea.left,
          display: "flex",
          alignItems: "center",
          gap: Math.round(12 * layout.scale),
        }}
      >
        <div
          style={{
            fontSize: layout.overlay.badgeFontSize,
            color: "#ffffff",
            fontWeight: 600,
            padding: layout.overlay.badgePadding,
            backgroundColor: "rgba(0,0,0,0.45)",
            borderRadius: 4,
          }}
        >
          {dateStamp.slice(0, 10)}
        </div>
        {/* Pulsing live indicator (YTRobot-v3 port) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: Math.round(6 * layout.scale),
            padding: layout.overlay.badgePadding,
            backgroundColor: "rgba(220,38,38,0.8)",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              width: Math.round(8 * layout.scale),
              height: Math.round(8 * layout.scale),
              borderRadius: "50%",
              backgroundColor: "#fff",
              opacity: liveIndicatorOpacity,
            }}
          />
          <span style={{ fontSize: Math.round(11 * layout.scale), fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            CANLI
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: layout.overlay.counterTop,
          right: layout.overlay.counterRight,
          fontSize: layout.overlay.badgeFontSize,
          color: "#ffffff",
          fontWeight: 600,
          padding: layout.overlay.badgePadding,
          backgroundColor: "rgba(0,0,0,0.45)",
          borderRadius: 4,
        }}
      >
        {index + 1} / {total}
      </div>

      {subtitleChunk && subtitleChunk.words.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: layout.isVertical ? "45%" : "55%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Subtitles
              subtitleChunk={subtitleChunk}
              style={subtitleStyle}
              sceneStartFrame={0}
              sceneDurationFrames={durationFrames}
              animation={subtitleAnimation}
              font={subtitleFont}
            />
        </div>
      )}

      {/* Spring-animated lower third (YTRobot-v3 port) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)",
          padding: layout.lowerThird.padding,
          transform: `translateY(${panelTranslateY}px)`,
          opacity: panelSlide,
        }}
      >
        {/* Accent bar (YTRobot-v3 port) */}
        <div
          style={{
            width: layout.lowerThird.accentBarWidth,
            height: layout.lowerThird.accentBarHeight,
            backgroundColor: categoryColor,
            marginBottom: Math.round(12 * layout.scale),
            transformOrigin: "left",
            transform: `scaleX(${accentBarScale})`,
          }}
        />
        {item.category && (
          <div
            style={{
              display: "inline-block",
              fontSize: layout.lowerThird.categoryFontSize,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#ffffff",
              marginBottom: Math.round(8 * layout.scale),
              padding: `${Math.round(3 * layout.scale)}px ${Math.round(10 * layout.scale)}px`,
              borderRadius: 4,
              backgroundColor: categoryColor,
            }}
          >
            {item.category}
          </div>
        )}
        <div
          style={{
            fontSize: layout.lowerThird.headlineFontSize,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.3,
            marginBottom: Math.round(6 * layout.scale),
            transform: `translateX(${headlineTranslateX}px)`,
            opacity: headlineSlide,
          }}
        >
          {item.headline}
        </div>
        {item.source && (
          <div style={{ fontSize: layout.lowerThird.sourceFontSize, color: "#94a3b8", opacity: headlineSlide }}>
            Kaynak: {item.source}
          </div>
        )}
      </div>

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
