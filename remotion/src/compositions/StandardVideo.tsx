/**
 * StandardVideo composition — genel amacli video modulu.
 *
 * Sahne yapisi:
 *   Her sahne bir arka plan gorsel (video/image) + TTS ses + altyazi katmani icerir.
 *   Sahneler sirali olarak birlestirilir; toplam sure sahnelerin toplamidir.
 *   Ken Burns efekti, crossfade gecisleri ve vignette overlay desteklenir.
 */

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
} from "remotion";
import { Subtitles } from "../components/Subtitles";
import type { StandardVideoProps, SceneData, SubtitleChunk } from "../types";

const CROSSFADE_FRAMES = 10;
const DEFAULT_SCENE_DURATION_SECONDS = 5;

const getSafeDuration = (durationInSeconds: number | undefined): number => {
  if (!durationInSeconds || isNaN(durationInSeconds) || durationInSeconds <= 0) {
    return DEFAULT_SCENE_DURATION_SECONDS;
  }
  return durationInSeconds;
};

const hasValidSrc = (src: string | undefined): src is string => {
  return typeof src === "string" && src.trim().length > 0;
};

const FallbackBackground: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    }}
  />
);

const SceneVisual: React.FC<{
  scene: SceneData;
  sceneIndex: number;
  sceneDurationFrames: number;
  kenBurnsEnabled: boolean;
  kenBurnsZoom: number;
  fps: number;
}> = ({ scene, sceneIndex, sceneDurationFrames, kenBurnsEnabled, kenBurnsZoom, fps }) => {
  const frame = useCurrentFrame();

  const isZoomOut = sceneIndex % 2 === 1;
  const scaleStart = isZoomOut ? 1.0 + kenBurnsZoom : 1.0;
  const scaleEnd = isZoomOut ? 1.0 : 1.0 + kenBurnsZoom;

  const scale = kenBurnsEnabled
    ? interpolate(frame, [0, sceneDurationFrames], [scaleStart, scaleEnd], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const visualStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  };

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  const transformStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    transform: `scale(${scale})`,
    transformOrigin: "center center",
  };

  if (!hasValidSrc(scene.visualSrc)) {
    return <FallbackBackground />;
  }

  return (
    <div style={containerStyle}>
      <div style={transformStyle}>
        {scene.visualType === "video" ? (
          <OffthreadVideo src={scene.visualSrc} style={visualStyle} />
        ) : (
          <Img src={scene.visualSrc} style={visualStyle} />
        )}
      </div>
    </div>
  );
};

const SceneContent: React.FC<{
  scene: SceneData;
  sceneIndex: number;
  totalScenes: number;
  sceneDurationFrames: number;
  subtitleChunk: SubtitleChunk | undefined;
  sceneStartFrame: number;
  kenBurnsEnabled: boolean;
  kenBurnsZoom: number;
  fps: number;
  subtitleStyle: StandardVideoProps["subtitleStyle"];
}> = ({
  scene,
  sceneIndex,
  totalScenes,
  sceneDurationFrames,
  subtitleChunk,
  sceneStartFrame,
  kenBurnsEnabled,
  kenBurnsZoom,
  fps,
  subtitleStyle,
}) => {
  const frame = useCurrentFrame();

  const crossfadeOpacity =
    sceneIndex > 0
      ? interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <AbsoluteFill style={{ opacity: crossfadeOpacity }}>
      <SceneVisual
        scene={scene}
        sceneIndex={sceneIndex}
        sceneDurationFrames={sceneDurationFrames}
        kenBurnsEnabled={kenBurnsEnabled}
        kenBurnsZoom={kenBurnsZoom}
        fps={fps}
      />

      {hasValidSrc(scene.audioSrc) && <Audio src={scene.audioSrc} volume={1} />}

      {subtitleChunk && (
        <Subtitles
          subtitleChunk={subtitleChunk}
          style={subtitleStyle}
          sceneStartFrame={sceneStartFrame}
          sceneDurationFrames={sceneDurationFrames}
        />
      )}

      <div
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          fontSize: 13,
          color: "rgba(255, 255, 255, 0.5)",
          fontFamily: "Inter, system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
          textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
        }}
      >
        {sceneIndex + 1} / {totalScenes}
      </div>
    </AbsoluteFill>
  );
};

export const StandardVideo: React.FC<StandardVideoProps> = ({
  title,
  scenes,
  subtitles,
  subtitleStyle,
  settings,
  kenBurnsEnabled,
  kenBurnsZoom,
}) => {
  const { fps } = useVideoConfig();

  if (scenes.length === 0) {
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
              color: "#3b82f6",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginBottom: 12,
            }}
          >
            Standard Video
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
            Sahne verisi bekleniyor. Backend pipeline tamamlandiginda bu
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
            Altyazi: {subtitleStyle}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const sceneFrames: { scene: SceneData; from: number; durationFrames: number }[] = [];
  let frameOffset = 0;

  for (const scene of scenes) {
    const safeDuration = getSafeDuration(scene.durationInSeconds);
    const durationFrames = Math.ceil(safeDuration * fps);
    sceneFrames.push({ scene, from: frameOffset, durationFrames });
    frameOffset += durationFrames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {sceneFrames.map(({ scene, from, durationFrames }, arrayIndex) => {
        const subtitleChunk: SubtitleChunk | undefined =
          subtitles && subtitles[arrayIndex] ? subtitles[arrayIndex] : undefined;

        return (
          <Sequence
            key={scene.index}
            from={from}
            durationInFrames={durationFrames}
            name={`Sahne ${arrayIndex + 1}`}
          >
            <SceneContent
              scene={scene}
              sceneIndex={arrayIndex}
              totalScenes={scenes.length}
              sceneDurationFrames={durationFrames}
              subtitleChunk={subtitleChunk}
              sceneStartFrame={from}
              kenBurnsEnabled={kenBurnsEnabled}
              kenBurnsZoom={kenBurnsZoom}
              fps={fps}
              subtitleStyle={subtitleStyle}
            />
          </Sequence>
        );
      })}

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.45) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
