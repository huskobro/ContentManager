/**
 * useLayout — Aspect-ratio-aware responsive layout hook.
 *
 * Tum composition ve component'lar bu hook uzerinden boyut/konum
 * degerlerini alir. 16:9 (landscape) ve 9:16 (vertical/shorts) icin
 * farkli layout parametreleri dondurur.
 *
 * Tasarim karari: Ayri composition dosyasi yerine responsive shared
 * layout secildi cunku:
 *   1. Icerik yapisi (scene, audio, subtitle) her iki formatta ayni
 *   2. Sadece CSS pozisyonlama ve font boyutlari degisiyor
 *   3. 6 dosya yerine 3 dosya + 1 layout hook = daha az kod tekrari
 *
 * Kullanim:
 *   const layout = useLayout();
 *   // layout.isVertical, layout.subtitle.fontSize, layout.safeArea.top ...
 */

import { useVideoConfig } from "remotion";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface SafeArea {
  /** Ust kenara guvenli mesafe (px) */
  top: number;
  /** Alt kenara guvenli mesafe (px) */
  bottom: number;
  /** Sol kenara guvenli mesafe (px) */
  left: number;
  /** Sag kenara guvenli mesafe (px) */
  right: number;
}

export interface SubtitleLayout {
  /** Altyazi temel font boyutu (px) */
  fontSize: number;
  /** Altyazi container genisligi (%) */
  containerWidth: string;
  /** Altyazi alt pozisyonu — standard stil (px) */
  bottomOffset: number;
  /** Cinematic efektli alt pozisyon (px) */
  bottomOffsetCinematic: number;
  /** Kelime arasi bosluk (px) */
  wordGap: number;
}

export interface OverlayLayout {
  /** Sahne sayaci font boyutu (px) */
  counterFontSize: number;
  /** Sahne sayaci ust mesafe (px) */
  counterTop: number;
  /** Sahne sayaci sag mesafe (px) */
  counterRight: number;
  /** Badge font boyutu (px) */
  badgeFontSize: number;
  /** Badge padding */
  badgePadding: string;
}

export interface LowerThirdLayout {
  /** Panel padding */
  padding: string;
  /** Baslik font boyutu (px) */
  headlineFontSize: number;
  /** Kategori badge font boyutu (px) */
  categoryFontSize: number;
  /** Kaynak font boyutu (px) */
  sourceFontSize: number;
  /** Accent bar genisligi (px) */
  accentBarWidth: number;
  /** Accent bar yuksekligi (px) */
  accentBarHeight: number;
}

export interface TickerLayout {
  /** Ticker yuksekligi (px) */
  height: number;
  /** Ticker kaydirma metni font boyutu (px) */
  fontSize: number;
  /** Sol badge font boyutu (px) */
  badgeFontSize: number;
  /** Fade genisligi sol (px) */
  fadeLeft: number;
  /** Fade genisligi sag (px) */
  fadeRight: number;
  /** Tahmini karakter genisligi scroll hesabi icin (px) */
  charWidth: number;
  /** Kaydirma hizi (px/frame) */
  speed: number;
}

export interface ScoreRingLayout {
  /** Ring dis boyut (px) */
  size: number;
  /** SVG daire yaricapi (px) */
  radius: number;
  /** SVG stroke kalinligi (px) */
  strokeWidth: number;
  /** Puan font boyutu (px) */
  scoreFontSize: number;
  /** Bolen metin font boyutu (px) */
  divisionFontSize: number;
  /** Ust pozisyon (%) */
  topPosition: string;
}

export interface FloatingCommentsLayout {
  /** Kart maks genislik (px) */
  maxWidth: number;
  /** Kart padding */
  padding: string;
  /** Avatar boyutu (px) */
  avatarSize: number;
  /** Yorum metni font boyutu (px) */
  fontSize: number;
  /** Maks yorum sayisi */
  maxComments: number;
}

export interface ProConLayout {
  /** Baslik font boyutu (px) */
  headingFontSize: number;
  /** Ikon font boyutu (px) */
  iconFontSize: number;
  /** Ust pozisyon (%) */
  topPosition: string;
  /** Sol/sag kenar mesafesi (%) */
  horizontalPadding: string;
}

export interface BreakingOverlayLayout {
  /** Ust pozisyon (%) */
  topPosition: string;
  /** Badge yuksekligi (px) */
  badgeHeight: number;
  /** Badge font boyutu (px) */
  badgeFontSize: number;
  /** Network adi font boyutu (px) */
  networkFontSize: number;
  /** Badge padding */
  badgePadding: string;
}

export interface PriceBadgeLayout {
  /** Orijinal fiyat font boyutu (px) */
  originalPriceFontSize: number;
  /** Guncel fiyat font boyutu (px) */
  currentPriceFontSize: number;
  /** Indirim badge font boyutu (px) */
  discountFontSize: number;
}

export interface StarRatingLayout {
  /** Yildiz boyutu (px) */
  starSize: number;
  /** Yildizlar arasi bosluk (px) */
  gap: number;
}

export interface Layout {
  /** Dikey format mi? (height > width) */
  isVertical: boolean;
  /** Yatay format mi? (width >= height) */
  isHorizontal: boolean;
  /** En-boy orani (width / height) */
  aspectRatio: number;
  /** Video genisligi (px) */
  width: number;
  /** Video yuksekligi (px) */
  height: number;
  /** Referans genislige gore olcekleme carpani (1920 = 1.0) */
  scale: number;
  /** Guvenli alan mesafeleri */
  safeArea: SafeArea;
  /** Altyazi yerlesimi */
  subtitle: SubtitleLayout;
  /** Overlay elemanlari */
  overlay: OverlayLayout;
  /** Lower-third paneli (NewsBulletin) */
  lowerThird: LowerThirdLayout;
  /** Ticker bandi (NewsBulletin) */
  ticker: TickerLayout;
  /** Puan halkasi (ProductReview) */
  scoreRing: ScoreRingLayout;
  /** Yuzen yorumlar (ProductReview) */
  floatingComments: FloatingCommentsLayout;
  /** Pro/Con basliklari (ProductReview) */
  proCon: ProConLayout;
  /** Son dakika overlay (NewsBulletin) */
  breakingOverlay: BreakingOverlayLayout;
  /** Fiyat etiketi (ProductReview) */
  priceBadge: PriceBadgeLayout;
  /** Yildiz derecelendirme (ProductReview) */
  starRating: StarRatingLayout;
}

// ─── Layout hesaplama ────────────────────────────────────────────────────────

function computeLayout(width: number, height: number): Layout {
  const isVertical = height > width;
  const aspectRatio = width / height;

  // Olcekleme: 1920px genislige normalize edilmis (landscape)
  // veya 1080px genislige normalize edilmis (vertical)
  const refWidth = isVertical ? 1080 : 1920;
  const scale = width / refWidth;

  // ── Safe area ──
  const safeArea: SafeArea = isVertical
    ? { top: 80 * scale, bottom: 80 * scale, left: 24 * scale, right: 24 * scale }
    : { top: 20 * scale, bottom: 20 * scale, left: 24 * scale, right: 24 * scale };

  // ── Subtitle ──
  const subtitle: SubtitleLayout = isVertical
    ? {
        fontSize: Math.round(40 * scale),
        containerWidth: "88%",
        bottomOffset: Math.round(160 * scale),
        bottomOffsetCinematic: Math.round(220 * scale),
        wordGap: Math.round(6 * scale),
      }
    : {
        fontSize: Math.round(48 * scale),
        containerWidth: "92%",
        bottomOffset: Math.round(60 * scale),
        bottomOffsetCinematic: Math.round(140 * scale),
        wordGap: Math.round(8 * scale),
      };

  // ── Overlay (scene counter, badges) ──
  const overlay: OverlayLayout = isVertical
    ? {
        counterFontSize: Math.round(11 * scale),
        counterTop: Math.round(safeArea.top),
        counterRight: Math.round(20 * scale),
        badgeFontSize: Math.round(11 * scale),
        badgePadding: `${Math.round(3 * scale)}px ${Math.round(8 * scale)}px`,
      }
    : {
        counterFontSize: Math.round(13 * scale),
        counterTop: Math.round(20 * scale),
        counterRight: Math.round(24 * scale),
        badgeFontSize: Math.round(13 * scale),
        badgePadding: `${Math.round(4 * scale)}px ${Math.round(10 * scale)}px`,
      };

  // ── Lower-third (NewsBulletin) ──
  const lowerThird: LowerThirdLayout = isVertical
    ? {
        padding: `${Math.round(40 * scale)}px ${Math.round(24 * scale)}px ${Math.round(24 * scale)}px`,
        headlineFontSize: Math.round(22 * scale),
        categoryFontSize: Math.round(10 * scale),
        sourceFontSize: Math.round(11 * scale),
        accentBarWidth: Math.round(40 * scale),
        accentBarHeight: Math.round(3 * scale),
      }
    : {
        padding: `${Math.round(60 * scale)}px ${Math.round(40 * scale)}px ${Math.round(32 * scale)}px`,
        headlineFontSize: Math.round(26 * scale),
        categoryFontSize: Math.round(11 * scale),
        sourceFontSize: Math.round(13 * scale),
        accentBarWidth: Math.round(60 * scale),
        accentBarHeight: Math.round(3 * scale),
      };

  // ── Ticker (NewsBulletin) ──
  const ticker: TickerLayout = isVertical
    ? {
        height: Math.round(52 * scale),
        fontSize: Math.round(22 * scale),
        badgeFontSize: Math.round(18 * scale),
        fadeLeft: Math.round(60 * scale),
        fadeRight: Math.round(80 * scale),
        charWidth: Math.round(14 * scale),
        speed: Math.round(3 * scale),
      }
    : {
        height: Math.round(64 * scale),
        fontSize: Math.round(28 * scale),
        badgeFontSize: Math.round(22 * scale),
        fadeLeft: Math.round(80 * scale),
        fadeRight: Math.round(120 * scale),
        charWidth: Math.round(18 * scale),
        speed: Math.round(4 * scale),
      };

  // ── Score ring (ProductReview) ──
  const scoreRing: ScoreRingLayout = isVertical
    ? {
        size: Math.round(140 * scale),
        radius: Math.round(54 * scale),
        strokeWidth: Math.round(6 * scale),
        scoreFontSize: Math.round(38 * scale),
        divisionFontSize: Math.round(13 * scale),
        topPosition: "22%",
      }
    : {
        size: Math.round(180 * scale),
        radius: Math.round(70 * scale),
        strokeWidth: Math.round(8 * scale),
        scoreFontSize: Math.round(48 * scale),
        divisionFontSize: Math.round(16 * scale),
        topPosition: "18%",
      };

  // ── Floating comments (ProductReview) ──
  const floatingComments: FloatingCommentsLayout = isVertical
    ? {
        maxWidth: Math.round(220 * scale),
        padding: `${Math.round(10 * scale)}px ${Math.round(12 * scale)}px`,
        avatarSize: Math.round(22 * scale),
        fontSize: Math.round(12 * scale),
        maxComments: 3,
      }
    : {
        maxWidth: Math.round(280 * scale),
        padding: `${Math.round(12 * scale)}px ${Math.round(16 * scale)}px`,
        avatarSize: Math.round(28 * scale),
        fontSize: Math.round(14 * scale),
        maxComments: 5,
      };

  // ── Pro/Con headings (ProductReview) ──
  const proCon: ProConLayout = isVertical
    ? {
        headingFontSize: Math.round(22 * scale),
        iconFontSize: Math.round(26 * scale),
        topPosition: "30%",
        horizontalPadding: "6%",
      }
    : {
        headingFontSize: Math.round(28 * scale),
        iconFontSize: Math.round(32 * scale),
        topPosition: "35%",
        horizontalPadding: "8%",
      };

  // ── Breaking overlay (NewsBulletin) ──
  const breakingOverlay: BreakingOverlayLayout = isVertical
    ? {
        topPosition: "30%",
        badgeHeight: Math.round(44 * scale),
        badgeFontSize: Math.round(26 * scale),
        networkFontSize: Math.round(18 * scale),
        badgePadding: `0 ${Math.round(18 * scale)}px 0 ${Math.round(32 * scale)}px`,
      }
    : {
        topPosition: "38%",
        badgeHeight: Math.round(56 * scale),
        badgeFontSize: Math.round(32 * scale),
        networkFontSize: Math.round(22 * scale),
        badgePadding: `0 ${Math.round(24 * scale)}px 0 ${Math.round(40 * scale)}px`,
      };

  // ── Price badge (ProductReview) ──
  const priceBadge: PriceBadgeLayout = isVertical
    ? {
        originalPriceFontSize: Math.round(28 * scale),
        currentPriceFontSize: Math.round(56 * scale),
        discountFontSize: Math.round(18 * scale),
      }
    : {
        originalPriceFontSize: Math.round(36 * scale),
        currentPriceFontSize: Math.round(72 * scale),
        discountFontSize: Math.round(22 * scale),
      };

  // ── Star rating (ProductReview) ──
  const starRating: StarRatingLayout = isVertical
    ? { starSize: Math.round(28 * scale), gap: Math.round(4 * scale) }
    : { starSize: Math.round(40 * scale), gap: Math.round(6 * scale) };

  return {
    isVertical,
    isHorizontal: !isVertical,
    aspectRatio,
    width,
    height,
    scale,
    safeArea,
    subtitle,
    overlay,
    lowerThird,
    ticker,
    scoreRing,
    floatingComments,
    proCon,
    breakingOverlay,
    priceBadge,
    starRating,
  };
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * Remotion useVideoConfig() uzerinden aspect-ratio-aware layout dondurur.
 *
 * Ornek:
 *   const layout = useLayout();
 *   if (layout.isVertical) { ... }
 */
export function useLayout(): Layout {
  const { width, height } = useVideoConfig();
  return computeLayout(width, height);
}

/**
 * Hook kullanmadan (class/util icin) layout hesaplar.
 * Component disinda veya test icin kullanilabilir.
 */
export { computeLayout };
