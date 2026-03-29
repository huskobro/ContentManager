import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  Video,
  Img,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  spring,
} from "remotion";
import { Subtitles } from "../components/Subtitles";
import type { NewsBulletinProps, NewsItem, SubtitleChunk, SubtitleStyle } from "../types";

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

export const NewsBulletin: React.FC<NewsBulletinProps> = ({
  title,
  items,
  subtitles,
  subtitleStyle,
  settings,
  dateStamp,
}) => {
  const { fps } = useVideoConfig();
  const globalFrame = useCurrentFrame();

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
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeInOpacity = isFirst
    ? 1
    : interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
        extrapolateRight: "clamp",
      });

  const lowerThirdTranslateY = interpolate(
    frame,
    [0, LOWER_THIRD_SLIDE_FRAMES],
    [80, 0],
    { extrapolateRight: "clamp" }
  );

  const lowerThirdOpacity = interpolate(
    frame,
    [0, LOWER_THIRD_SLIDE_FRAMES],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const categoryColor = getCategoryColor(item.category);

  return (
    <AbsoluteFill
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        opacity: fadeInOpacity,
      }}
    >
      <AbsoluteFill>
        {item.visualSrc ? (
          item.visualType === "video" ? (
            <Video
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

      <div
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          fontSize: 13,
          color: "#ffffff",
          fontWeight: 600,
          padding: "4px 10px",
          backgroundColor: "rgba(0,0,0,0.45)",
          borderRadius: 4,
        }}
      >
        {dateStamp.slice(0, 10)}
      </div>

      <div
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          fontSize: 13,
          color: "#ffffff",
          fontWeight: 600,
          padding: "4px 10px",
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
            top: "60%",
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
            />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)",
          padding: "60px 40px 32px",
          transform: `translateY(${lowerThirdTranslateY}px)`,
          opacity: lowerThirdOpacity,
        }}
      >
        {item.category && (
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#ffffff",
              marginBottom: 8,
              padding: "3px 10px",
              borderRadius: 4,
              backgroundColor: categoryColor,
            }}
          >
            {item.category}
          </div>
        )}
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.3,
            marginBottom: 6,
          }}
        >
          {item.headline}
        </div>
        {item.source && (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
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
