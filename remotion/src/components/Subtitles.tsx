/**
 * Subtitles — Karaoke animasyonlu altyazı render bileşeni.
 *
 * İki bağımsız eksen:
 *   1. SubtitleStyle (standard/neon_blue/gold/minimal/hormozi)
 *      → Renk, konum, arka plan, aktif kelime vurgulama
 *   2. SubtitleAnimation (hype/explosive/vibrant/minimal_anim/none)
 *      → Satır giriş efekti, kelime-seviye ölçek animasyonu
 *      (YTRobot-v3/remotion/src/Scene.tsx'ten port)
 *
 * Font sistemi: SubtitleFont ile @remotion/google-fonts destekli
 * font ailesi seçimi (varsayılan: Inter).
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { useLayout } from "./useLayout";
import type {
  WordTiming,
  SubtitleChunk,
  SubtitleStyle,
  SubtitleAnimation,
  SubtitleFont,
} from "../types";

// ─── Font sistemi (YTRobot-v3 port) ─────────────────────────────────────────

// Google Fonts yükleme — @remotion/google-fonts paketi gerektirir.
// Paket yoksa veya font yüklenemezse fallback olarak sistem fontları kullanılır.
let _fontsLoaded = false;
const FONT_MAP: Record<string, string> = {
  inter: "Inter, system-ui, sans-serif",
  roboto: "Roboto, Arial, sans-serif",
  montserrat: "Montserrat, Arial, sans-serif",
  oswald: "Oswald, Arial, sans-serif",
  bebas: "'Bebas Neue', Impact, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Arial, Helvetica, sans-serif",
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadFont: loadInter } = require("@remotion/google-fonts/Inter");
  const { loadFont: loadRoboto } = require("@remotion/google-fonts/Roboto");
  const { loadFont: loadMontserrat } = require("@remotion/google-fonts/Montserrat");
  const { loadFont: loadOswald } = require("@remotion/google-fonts/Oswald");
  const { loadFont: loadBebas } = require("@remotion/google-fonts/BebasNeue");

  const interInfo = loadInter();
  const robotoInfo = loadRoboto();
  const montserratInfo = loadMontserrat();
  const oswaldInfo = loadOswald();
  const bebasInfo = loadBebas();

  FONT_MAP.inter = interInfo.fontFamily + ", system-ui, sans-serif";
  FONT_MAP.roboto = robotoInfo.fontFamily + ", Arial, sans-serif";
  FONT_MAP.montserrat = montserratInfo.fontFamily + ", Arial, sans-serif";
  FONT_MAP.oswald = oswaldInfo.fontFamily + ", Arial, sans-serif";
  FONT_MAP.bebas = bebasInfo.fontFamily + ", Impact, sans-serif";
  _fontsLoaded = true;
} catch {
  // @remotion/google-fonts yüklü değilse fallback fontlar kullanılır
}

function getFontFamily(font?: SubtitleFont): string {
  return FONT_MAP[font ?? "inter"] ?? FONT_MAP.inter;
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

const WORDS_PER_LINE = 6;
const FADE_FRAMES = 5;

// ─── Stil konfigürasyonu ─────────────────────────────────────────────────────

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

// ─── Animasyon yardımcıları (YTRobot-v3/Scene.tsx port) ─────────────────────

/** Safe lerp — sıfır aralık koruması */
function lerp(a: number, b: number, t: number): number {
  if (a === b) return a;
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Overshoot zoom — 0→peakScale→1 bounce */
function zoomIn(
  t: number,
  startScale: number,
  overshoot: number,
  peakFrac: number
): number {
  if (t <= 0) return startScale;
  if (t >= 1) return 1;
  if (t < peakFrac) {
    return lerp(startScale, 1 + overshoot, t / peakFrac);
  }
  return lerp(1 + overshoot, 1, (t - peakFrac) / (1 - peakFrac));
}

/** Dip-bounce pop — dips below 1 then bounces up */
function popIn(
  t: number,
  startScale: number,
  dipScale: number,
  dipFrac: number,
  overshoot: number,
  peakFrac: number
): number {
  if (t <= 0) return startScale;
  if (t >= 1) return 1;
  if (t < dipFrac) return lerp(startScale, dipScale, t / dipFrac);
  const t2 = (t - dipFrac) / (1 - dipFrac);
  if (t2 < peakFrac) return lerp(dipScale, 1 + overshoot, t2 / peakFrac);
  return lerp(1 + overshoot, 1, (t2 - peakFrac) / (1 - peakFrac));
}

// ─── Yardımcı fonksiyonlar ──────────────────────────────────────────────────

interface SubtitlesProps {
  subtitleChunk: SubtitleChunk;
  style: SubtitleStyle;
  fontSize?: number;
  sceneStartFrame: number;
  sceneDurationFrames: number;
  /** Animasyon preset'i (opsiyonel — varsayılan "none") */
  animation?: SubtitleAnimation;
  /** Font ailesi (opsiyonel — varsayılan "inter") */
  font?: SubtitleFont;
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

// ─── Vertical layout yardımcıları ────────────────────────────────────────────

/**
 * Vertical modda altyazi pozisyonunu ayarlar.
 * Landscape'te top: 85% olan icerik, vertical'de 75%'e kaydirilir
 * cunku alt kisimda daha fazla alan kullanilir (safe area, ticker vb.)
 */
function adjustTopForVertical(top: string): string {
  const match = top.match(/^(\d+)%$/);
  if (!match) return top;
  const pct = parseInt(match[1], 10);
  // 85% → 75%, 50% → 45% (daha ortaya dogru kaydir)
  if (pct >= 80) return `${pct - 10}%`;
  if (pct >= 45) return `${pct - 5}%`;
  return top;
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────

export const Subtitles: React.FC<SubtitlesProps> = ({
  subtitleChunk,
  style,
  fontSize: fontSizeOverride,
  sceneStartFrame,
  sceneDurationFrames,
  animation = "none",
  font,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();

  // Layout-aware font boyutu: override yoksa layout'tan al
  const fontSize = fontSizeOverride ?? layout.subtitle.fontSize;

  const words = subtitleChunk.words;
  if (words.length === 0) {
    return null;
  }

  const relativeFrame = frame - sceneStartFrame;
  const currentTimeSec = relativeFrame / fps;

  const config = getStyleConfig(style);
  const effectiveFontSize = fontSize * config.fontSizeMultiplier;
  const fontFamily = getFontFamily(font);

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

  const baseOpacity = Math.min(fadeInOpacity, fadeOutOpacity);

  // ── Animasyon preset: satır giriş efekti ──
  const introFrames = 10;
  let lineTransform = "";
  let lineAnimOpacity = 1;

  if (animation === "hype") {
    const introProgress = interpolate(
      relativeFrame - activeLine[0].start * fps,
      [0, introFrames],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    lineAnimOpacity = introProgress;
    lineTransform = `translateY(${lerp(12, 0, introProgress)}px)`;
  } else if (animation === "explosive") {
    const introProgress = interpolate(
      relativeFrame - activeLine[0].start * fps,
      [0, introFrames],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    lineAnimOpacity = introProgress;
    lineTransform = `translateX(${lerp(-60, 0, introProgress)}px)`;
  } else if (animation === "vibrant") {
    const introProgress = interpolate(
      relativeFrame - activeLine[0].start * fps,
      [0, introFrames],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    lineAnimOpacity = introProgress;
  }

  const activeWordIndexInLine = findActiveWordIndex(activeLine, currentTimeSec);

  const isCenter =
    config.textAlign === "center" && config.left === "50%";

  // Vertical modda stil pozisyonlarini ayarla
  const effectiveTop = layout.isVertical
    ? adjustTopForVertical(config.top)
    : config.top;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top: effectiveTop,
    left: config.left,
    transform: isCenter
      ? `translate(-50%, -50%) ${lineTransform}`
      : `translateY(-50%) ${lineTransform}`,
    width: isCenter
      ? layout.subtitle.containerWidth
      : layout.subtitle.containerWidth,
    textAlign: config.textAlign,
    opacity: baseOpacity * lineAnimOpacity,
    display: "flex",
    flexWrap: "wrap",
    justifyContent:
      config.textAlign === "center"
        ? "center"
        : config.textAlign === "left"
          ? "flex-start"
          : "flex-end",
    gap: `0 ${layout.subtitle.wordGap}px`,
    background: config.background,
    padding: config.padding,
    borderRadius: config.borderRadius,
  };

  return (
    <div style={containerStyle}>
      {activeLine.map((word, idx) => {
        const isActive = idx === activeWordIndexInLine;
        const isPast = idx < activeWordIndexInLine;
        const wordStyle = buildWordStyle(
          style,
          config,
          isActive,
          isPast,
          effectiveFontSize,
          fontFamily,
          fps,
          frame,
          word,
          sceneStartFrame,
          animation,
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

// ─── Kelime stili oluşturucu ─────────────────────────────────────────────────

function buildWordStyle(
  styleName: SubtitleStyle,
  config: StyleConfig,
  isActive: boolean,
  isPast: boolean,
  fontSize: number,
  fontFamily: string,
  fps: number,
  frame: number,
  word: WordTiming,
  sceneStartFrame: number,
  animation: SubtitleAnimation,
): React.CSSProperties {
  let color = config.color;
  let textShadow = config.textShadow;
  let fontWeight: React.CSSProperties["fontWeight"] = config.fontWeight as React.CSSProperties["fontWeight"];
  let transform = "scale(1)";
  let opacity = 1;

  // ── Stil bazlı aktif kelime vurgulama (mevcut sistem) ──
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

  // ── Animasyon preset bazlı kelime efektleri (YTRobot-v3 port) ──
  if (animation !== "none") {
    const wordStartFrame = word.start * fps + sceneStartFrame;
    const wordEndFrame = word.end * fps + sceneStartFrame;
    const wordDurFrames = Math.max(1, wordEndFrame - wordStartFrame);
    const wordProgress = Math.max(0, Math.min(1, (frame - wordStartFrame) / wordDurFrames));

    switch (animation) {
      case "hype": {
        const wordScale = zoomIn(wordProgress, 0.8, 0.05, 0.7);
        if (isActive) {
          transform = `scale(${wordScale})`;
          textShadow = `
            -1px -1px 0 #000, 1px -1px 0 #000,
            -1px 1px 0 #000, 1px 1px 0 #000,
            0 0 12px ${config.activeColor ?? "#FFD700"}
          `;
          color = config.activeColor ?? "#FFD700";
        } else if (isPast) {
          opacity = 0.9;
          color = "#FFFFFF";
        } else {
          opacity = 0.45;
          color = "#DDDDDD";
        }
        break;
      }

      case "explosive": {
        const wordScale = zoomIn(wordProgress, 0.5, 0.1, 0.7);
        if (isActive) {
          transform = `scale(${wordScale})`;
          color = "#FFFFFF";
          textShadow = "0 0 8px #FFAA00, 0 0 16px #FF8800, 0 0 24px #FF0000";
        } else if (isPast) {
          color = config.activeColor ?? "#FFD700";
          opacity = 0.9;
        } else {
          color = config.activeColor ?? "#FFD700";
          opacity = 0.5;
        }
        break;
      }

      case "vibrant": {
        const wordScale = popIn(wordProgress, 0.95, 0.9, 0.5, 0.05, 0.8);
        if (isActive) {
          transform = `scale(${wordScale})`;
          color = config.activeColor ?? config.color;
          textShadow = `0 0 6px ${config.activeColor ?? config.color}`;
        } else if (isPast) {
          opacity = 0.85;
        } else {
          opacity = 0.4;
        }
        break;
      }

      case "minimal_anim": {
        if (isActive) {
          color = config.activeColor ?? config.color;
        } else if (isPast) {
          opacity = 0.8;
        } else {
          opacity = 0.5;
        }
        break;
      }
    }
  }

  return {
    color,
    fontSize,
    fontWeight,
    textShadow,
    fontFamily,
    lineHeight: 1.4,
    transition: "color 0.1s ease, text-shadow 0.1s ease",
    display: "inline-block",
    transform,
    opacity,
  };
}
