/**
 * Remotion Composition kaydı.
 *
 * Her modül kendi composition'ını burada tanımlar.
 * Backend render çağrısı sırasında composition ID'si (örn. "StandardVideo")
 * ve inputProps JSON olarak verilir.
 *
 * Yeni modül eklemek:
 *   1. types.ts'e yeni props arayüzü ekle
 *   2. compositions/ altına yeni bileşen oluştur
 *   3. Bu dosyada <Composition> ile kaydet
 *
 * Not: Remotion 4.0.290 Composition bileşeni iki generic parametre alır
 * (ZodSchema, Props). Zod kullanmadığımız için AnyZodObject yerine
 * tip güvenliğini CompositionProps tipi üzerinden sağlıyoruz.
 */

import React from "react";
import { Composition, type CompositionProps } from "remotion";
import type { AnyZodObject } from "zod";
import { StandardVideo } from "./compositions/StandardVideo";
import { NewsBulletin } from "./compositions/NewsBulletin";
import { ProductReview } from "./compositions/ProductReview";
import type {
  StandardVideoProps,
  NewsBulletinProps,
  ProductReviewProps,
} from "./types";

/**
 * Varsayılan video ayarları — composition tanımlarında kullanılır.
 * Gerçek render sırasında inputProps üzerinden override edilir.
 */
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;

/** Varsayılan süre (frame) — gerçek veri gelene kadar placeholder */
const PLACEHOLDER_DURATION = DEFAULT_FPS * 30; // 30 saniye

/**
 * Remotion 4.0.290'ın Composition<Schema, Props> imzası Zod schema bekliyor.
 * Zod bağımlılığı eklemeden tip güvenliğini sağlamak için tiplenmiş wrapper.
 */
type UntypedCompositionProps = Omit<
  CompositionProps<AnyZodObject, Record<string, unknown>>,
  "component" | "defaultProps" | "calculateMetadata"
> & {
  component: React.ComponentType<any>;
  defaultProps: Record<string, unknown>;
  calculateMetadata?: (options: {
    defaultProps: any;
    props: any;
    abortSignal: AbortSignal;
    compositionId: string;
  }) => any;
};

const TypedComposition = Composition as React.FC<UntypedCompositionProps>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── Standart Video ── */}
      <TypedComposition
        id="StandardVideo"
        component={StandardVideo}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        fps={DEFAULT_FPS}
        durationInFrames={PLACEHOLDER_DURATION}
        defaultProps={{
          title: "Standart Video",
          scenes: [],
          subtitles: [],
          subtitleStyle: "standard",
          settings: {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            fps: DEFAULT_FPS,
          },
          kenBurnsEnabled: true,
          kenBurnsZoom: 0.15,
        } satisfies StandardVideoProps}
        calculateMetadata={({ props }: { props: StandardVideoProps; defaultProps: any; abortSignal: AbortSignal; compositionId: string }) => {
          const totalSeconds = props.scenes.reduce(
            (sum: number, s: { durationInSeconds: number }) => sum + s.durationInSeconds,
            0
          );
          const fps = props.settings.fps || DEFAULT_FPS;
          return {
            durationInFrames: Math.max(Math.ceil(totalSeconds * fps), 1),
            fps,
            width: props.settings.width || DEFAULT_WIDTH,
            height: props.settings.height || DEFAULT_HEIGHT,
          };
        }}
      />

      {/* ── Haber Bülteni ── */}
      <TypedComposition
        id="NewsBulletin"
        component={NewsBulletin}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        fps={DEFAULT_FPS}
        durationInFrames={PLACEHOLDER_DURATION}
        defaultProps={{
          title: "Haber Bülteni",
          items: [],
          subtitles: [],
          subtitleStyle: "standard",
          settings: {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            fps: DEFAULT_FPS,
          },
          dateStamp: new Date().toISOString(),
        } satisfies NewsBulletinProps}
        calculateMetadata={({ props }: { props: NewsBulletinProps; defaultProps: any; abortSignal: AbortSignal; compositionId: string }) => {
          const totalSeconds = props.items.reduce(
            (sum: number, item: { durationInSeconds: number }) => sum + item.durationInSeconds,
            0
          );
          const fps = props.settings.fps || DEFAULT_FPS;
          return {
            durationInFrames: Math.max(Math.ceil(totalSeconds * fps), 1),
            fps,
            width: props.settings.width || DEFAULT_WIDTH,
            height: props.settings.height || DEFAULT_HEIGHT,
          };
        }}
      />

      {/* ── Ürün İnceleme ── */}
      <TypedComposition
        id="ProductReview"
        component={ProductReview}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        fps={DEFAULT_FPS}
        durationInFrames={PLACEHOLDER_DURATION}
        defaultProps={{
          title: "Ürün İnceleme",
          productName: "Ürün Adı",
          overallScore: 8,
          sections: [],
          subtitles: [],
          subtitleStyle: "standard",
          settings: {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            fps: DEFAULT_FPS,
          },
        } satisfies ProductReviewProps}
        calculateMetadata={({ props }: { props: ProductReviewProps; defaultProps: any; abortSignal: AbortSignal; compositionId: string }) => {
          const totalSeconds = props.sections.reduce(
            (sum: number, s: { durationInSeconds: number }) => sum + s.durationInSeconds,
            0
          );
          const fps = props.settings.fps || DEFAULT_FPS;
          return {
            durationInFrames: Math.max(Math.ceil(totalSeconds * fps), 1),
            fps,
            width: props.settings.width || DEFAULT_WIDTH,
            height: props.settings.height || DEFAULT_HEIGHT,
          };
        }}
      />
    </>
  );
};
