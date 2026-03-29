import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { WordTiming, SubtitleChunk, SubtitleStyle } from "../types";

const WORDS_PER_LINE = 6;
const FADE_FRAMES = 5;

interface StyleConfig {
  color: string;
  fontWeight: string;
  textShadow: string;
  top: string;
  left: string;
  textAlign: React.CSSProperties["textAlign"];
  fontSizeMultiplier: number;
  background: string;
  padding: string;
  borderRadius: string;
  activeColor: string | null;
  activeTextShadow: string | null;
  activeFontWeight: string | null;
}

export function getStyleConfig(style: SubtitleStyle): StyleConfig {
  switch (style) {
    case "standard":
      return {
        color: "#FFFFFF",
        fontWeight: "700",
        textShadow: "0 2px 4px rgba(0,0,0,0.8)",
        top: "85%",
        left: "50%",
        textAlign: "center",
        fontSizeMultiplier: 1,
        background: "transparent",
        padding: "0",
        borderRadius: "0",
        activeColor: null,
        activeTextShadow: null,
        activeFontWeight: null,
      };

    case "neon_blue":
      return {
        color: "#00F5FF",
        fontWeight: "700",
        textShadow: "0 0 12px #0066FF, 0 0 24px #00AAFF",
        top: "50%",
        left: "50%",
        textAlign: "center",
        fontSizeMultiplier: 1,
        background: "transparent",
        padding: "0",
        borderRadius: "0",
        activeColor: null,
        activeTextShadow:
          "0 0 16px #00CCFF, 0 0 32px #00DDFF, 0 0 48px #00F5FF",
        activeFontWeight: null,
      };

    case "gold":
      return {
        color: "#FFD700",
        fontWeight: "700",
        textShadow: "0 2px 6px #8B6914, 0 0 10px #FFA500",
        top: "85%",
        left: "50%",
        textAlign: "center",
        fontSizeMultiplier: 1,
        background: "transparent",
        padding: "0",
        borderRadius: "0",
        activeColor: null,
        activeTextShadow:
          "0 2px 6px #8B6914, 0 0 14px #FFA500, 0 0 20px #FFD700",
        activeFontWeight: null,
      };

    case "minimal":
      return {
        color: "#FFFFFF",
        fontWeight: "400",
        textShadow: "0 1px 2px #333333",
        top: "85%",
        left: "5%",
        textAlign: "left",
        fontSizeMultiplier: 0.8,
        background: "transparent",
        padding: "0",
        borderRadius: "0",
        activeColor: null,
        activeTextShadow: null,
        activeFontWeight: null,
      };

    case "hormozi":
      return {
        color: "#FFFFFF",
        fontWeight: "800",
        textShadow: "0 2px 8px #000000",
        top: "50%",
        left: "50%",
        textAlign: "center",
        fontSizeMultiplier: 1,
        background: "rgba(0,0,0,0.5)",
        padding: "12px 24px",
        borderRadius: "8px",
        activeColor: "#FFD700",
        activeTextShadow: null,
        activeFontWeight: null,
      };
  }
}

interface SubtitlesProps {
  subtitleChunk: SubtitleChunk;
  style: SubtitleStyle;
  fontSize?: number;
  sceneStartFrame: number;
  sceneDurationFrames: number;
}

function splitIntoLineGroups(words: WordTiming[]): WordTiming[][] {
  const groups: WordTiming[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    groups.push(words.slice(i, i + WORDS_PER_LINE));
  }
  return groups;
}

function findActiveLineIndex(
  lineGroups: WordTiming[][],
  currentTimeSec: number
): number {
  for (let i = lineGroups.length - 1; i >= 0; i--) {
    const group = lineGroups[i];
    if (group.length > 0 && currentTimeSec >= group[0].start) {
      return i;
    }
  }
  return 0;
}

function findActiveWordIndex(
  words: WordTiming[],
  currentTimeSec: number
): number {
  for (let i = words.length - 1; i >= 0; i--) {
    if (currentTimeSec >= words[i].start) {
      return i;
    }
  }
  return -1;
}

export const Subtitles: React.FC<SubtitlesProps> = ({
  subtitleChunk,
  style,
  fontSize = 48,
  sceneStartFrame,
  sceneDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = subtitleChunk.words;
  if (words.length === 0) {
    return null;
  }

  const relativeFrame = frame - sceneStartFrame;
  const currentTimeSec = relativeFrame / fps;

  const config = getStyleConfig(style);
  const effectiveFontSize = fontSize * config.fontSizeMultiplier;

  const lineGroups = splitIntoLineGroups(words);
  const activeLineIndex = findActiveLineIndex(lineGroups, currentTimeSec);
  const activeLine = lineGroups[activeLineIndex];

  if (!activeLine || activeLine.length === 0) {
    return null;
  }

  const lineStartFrame = activeLine[0].start * fps + sceneStartFrame;
  const lineEndFrame =
    activeLineIndex < lineGroups.length - 1
      ? lineGroups[activeLineIndex + 1][0].start * fps + sceneStartFrame
      : sceneStartFrame + sceneDurationFrames;

  const fadeInOpacity = interpolate(
    frame,
    [lineStartFrame, lineStartFrame + FADE_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const fadeOutOpacity = interpolate(
    frame,
    [lineEndFrame - FADE_FRAMES, lineEndFrame],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const opacity = Math.min(fadeInOpacity, fadeOutOpacity);

  const activeWordIndexInLine = findActiveWordIndex(activeLine, currentTimeSec);

  const isCenter =
    config.textAlign === "center" && config.left === "50%";

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top: config.top,
    left: config.left,
    transform: isCenter
      ? "translate(-50%, -50%)"
      : "translateY(-50%)",
    width: isCenter ? "90%" : "90%",
    textAlign: config.textAlign,
    opacity,
    display: "flex",
    flexWrap: "wrap",
    justifyContent:
      config.textAlign === "center"
        ? "center"
        : config.textAlign === "left"
          ? "flex-start"
          : "flex-end",
    gap: "0 8px",
    background: config.background,
    padding: config.padding,
    borderRadius: config.borderRadius,
  };

  return (
    <div style={containerStyle}>
      {activeLine.map((word, idx) => {
        const isActive = idx === activeWordIndexInLine;
        const wordStyle = buildWordStyle(
          style,
          config,
          isActive,
          effectiveFontSize,
          fps,
          frame,
          word,
          sceneStartFrame
        );
        return (
          <span key={`${activeLineIndex}-${idx}`} style={wordStyle}>
            {word.text}
          </span>
        );
      })}
    </div>
  );
};

function buildWordStyle(
  styleName: SubtitleStyle,
  config: StyleConfig,
  isActive: boolean,
  fontSize: number,
  fps: number,
  frame: number,
  word: WordTiming,
  sceneStartFrame: number
): React.CSSProperties {
  let color = config.color;
  let textShadow = config.textShadow;
  let fontWeight: React.CSSProperties["fontWeight"] = config.fontWeight as React.CSSProperties["fontWeight"];
  let transform = "scale(1)";

  if (isActive) {
    switch (styleName) {
      case "hormozi":
        color = config.activeColor ?? color;
        break;

      case "neon_blue":
        textShadow = config.activeTextShadow ?? textShadow;
        break;

      case "gold": {
        textShadow = config.activeTextShadow ?? textShadow;
        const wordStartFrame = word.start * fps + sceneStartFrame;
        const shimmerProgress = spring({
          frame: frame - wordStartFrame,
          fps,
          config: { damping: 15, stiffness: 120, mass: 0.5 },
        });
        const scale = interpolate(shimmerProgress, [0, 1], [1, 1.05], {
          extrapolateRight: "clamp",
        });
        transform = `scale(${scale})`;
        break;
      }

      case "standard":
        textShadow = "0 2px 4px rgba(0,0,0,0.8), 0 0 8px rgba(255,255,255,0.3)";
        break;

      case "minimal":
        fontWeight = "600";
        break;
    }
  }

  return {
    color,
    fontSize,
    fontWeight,
    textShadow,
    fontFamily: "Inter, Arial, sans-serif",
    lineHeight: 1.4,
    transition: "color 0.1s ease, text-shadow 0.1s ease",
    display: "inline-block",
    transform,
  };
}
