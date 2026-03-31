/**
 * Remotion composition'ları için paylaşılan tip tanımları.
 *
 * Backend pipeline sonunda üretilen JSON verisi bu tiplere
 * dönüştürülerek Remotion'a inputProps olarak verilir.
 */

// ─── Ortak tipler ─────────────────────────────────────────────────────────────

/** Tek bir sahne — tüm modüllerde ortak temel yapı */
export interface SceneData {
  /** 0-tabanlı sahne indeksi */
  index: number;
  /** Seslendirme metni */
  narration: string;
  /** TTS çıktı ses dosyası yolu (statik servis veya mutlak dosya yolu) */
  audioSrc: string;
  /** Sahne süre bilgisi (saniye) — TTS ses dosyasının uzunluğu baz alınır */
  durationInSeconds: number;
  /** Görsel kaynak: video (.mp4) veya resim (.jpg/.png) dosya yolu */
  visualSrc: string;
  /** Görsel türü — video klip mi yoksa durağan görsel mi */
  visualType: "video" | "image";
}

/** Altyazı kelime zamanlama verisi (Whisper çıktısından) */
export interface WordTiming {
  text: string;
  /** Başlangıç zamanı (saniye) — sahne-göreceli */
  start: number;
  /** Bitiş zamanı (saniye) — sahne-göreceli */
  end: number;
}

/** Sahne başına altyazı chunk'ı */
export interface SubtitleChunk {
  words: WordTiming[];
}

/** Altyazı stili */
export type SubtitleStyle =
  | "standard"
  | "neon_blue"
  | "gold"
  | "minimal"
  | "hormozi";

/**
 * Altyazı animasyon preset'i (YTRobot-v3'ten port).
 *
 * Stil (SubtitleStyle) renk/konum/vurgulama kontrol ederken,
 * animasyon preset'i giriş efekti ve kelime-seviye ölçek efekti kontrol eder.
 */
export type SubtitleAnimation =
  | "hype"       // slide-up + zoom-in + glow
  | "explosive"  // slide-left + fire glow
  | "vibrant"    // pop-in bounce
  | "minimal_anim" // sadece renk geçişi
  | "none";      // animasyon yok

/**
 * Altyazı font seçimi (YTRobot-v3'ten port).
 */
export type SubtitleFont =
  | "inter"
  | "roboto"
  | "montserrat"
  | "oswald"
  | "bebas"
  | "serif"
  | "sans";

/**
 * Ken Burns pan yönü.
 * center: merkez zoom, pan-left/right: yönlü kaydırma, random: sahne başına döngüsel köşe.
 */
export type KenBurnsDirection = "center" | "pan-left" | "pan-right" | "random";

/**
 * Video renk/stil efekti.
 * vignette: kenar karartma, warm/cool: renk tonu, cinematic: letterbox.
 */
export type VideoEffect = "none" | "vignette" | "warm" | "cool" | "cinematic";

/**
 * Altyazı arka plan stili.
 * box: dikdörtgen kutucuk, pill: yuvarlatılmış kapsül, none: arka plan yok.
 */
export type SubtitleBg = "none" | "box" | "pill";

// ─── Video ayarları ───────────────────────────────────────────────────────────

export interface VideoSettings {
  /** Genişlik (piksel) — default 1920 */
  width: number;
  /** Yükseklik (piksel) — default 1080 */
  height: number;
  /** Kare hızı — default 30 */
  fps: number;
}

// ─── StandardVideo Composition Props ──────────────────────────────────────────

export interface StandardVideoProps {
  /** Video başlığı (metadata'dan; UI overlay için kullanılabilir) */
  title: string;
  /** Sahne listesi — sıralı */
  scenes: SceneData[];
  /** Sahne başına altyazı chunk'ları (scenes ile aynı uzunlukta) */
  subtitles: SubtitleChunk[];
  /** Altyazı görsel stili */
  subtitleStyle: SubtitleStyle;
  /** Video ayarları */
  settings: VideoSettings;
  /** Ken Burns efekti etkin mi */
  kenBurnsEnabled: boolean;
  /** Ken Burns zoom miktarı (0.0 – 0.3) */
  kenBurnsZoom: number;
  /** Altyazı animasyon preset'i — varsayılan "none" (opsiyonel, backward-compat) */
  subtitleAnimation?: SubtitleAnimation;
  /** Altyazı font ailesi — varsayılan "inter" (opsiyonel) */
  subtitleFont?: SubtitleFont;
  /** Ken Burns pan yönü — varsayılan "center" (opsiyonel) */
  kenBurnsDirection?: KenBurnsDirection;
  /** Video renk/stil efekti — varsayılan "none" (opsiyonel) */
  videoEffect?: VideoEffect;
  /** Altyazı arka plan stili — varsayılan "none" (opsiyonel) */
  subtitleBg?: SubtitleBg;
}

// ─── NewsBulletin Composition Props ───────────────────────────────────────────

/** Ticker kayan haber öğesi */
export interface TickerItem {
  text: string;
}

/** Haber bülteni tek haber öğesi */
export interface NewsItem {
  /** Haber başlığı — lower-third grafik olarak gösterilir */
  headline: string;
  /** Seslendirme metni */
  narration: string;
  /** TTS ses dosyası */
  audioSrc: string;
  /** Görsel arka plan */
  visualSrc: string;
  visualType: "video" | "image";
  durationInSeconds: number;
  /** Haber kategorisi (ekonomi, spor, teknoloji, vb.) */
  category?: string;
  /** Kaynak adı */
  source?: string;
}

/** Haber bülteni görsel stili */
export type BulletinStyle =
  | "breaking"
  | "tech"
  | "corporate"
  | "sport"
  | "finance"
  | "weather"
  | "science"
  | "entertainment"
  | "dark";

export interface NewsBulletinProps {
  /** Bülten başlığı */
  title: string;
  /** Haber öğeleri — sıralı */
  items: NewsItem[];
  /** Bülten genelindeki altyazı chunk'ları */
  subtitles: SubtitleChunk[];
  subtitleStyle: SubtitleStyle;
  settings: VideoSettings;
  /** Bülten tarih damgası (ISO-8601) — overlay olarak gösterilir */
  dateStamp: string;
  /** Altyazı animasyon preset'i (opsiyonel) */
  subtitleAnimation?: SubtitleAnimation;
  /** Altyazı font ailesi (opsiyonel) */
  subtitleFont?: SubtitleFont;
  /** Ticker kayan haber başlıkları (opsiyonel) */
  ticker?: TickerItem[];
  /** Bülten görsel stili (opsiyonel, default: "corporate") */
  bulletinStyle?: BulletinStyle;
  /** Yayın ağı adı — breaking overlay ve badge'de gösterilir (opsiyonel) */
  networkName?: string;
  /** Dil kodu — UI etiketleri için (opsiyonel, default: "tr") */
  lang?: string;
}

// ─── ProductReview Composition Props ──────────────────────────────────────────

/** Ürün inceleme bölüm yapısı */
export interface ReviewSection {
  /** Bölüm türü */
  type: "hook" | "overview" | "pros" | "cons" | "verdict";
  /** Bölüm başlığı */
  heading: string;
  /** Seslendirme metni */
  narration: string;
  audioSrc: string;
  visualSrc: string;
  visualType: "video" | "image";
  durationInSeconds: number;
}

/** Ürün inceleme görsel stili */
export type ProductReviewStyle =
  | "modern"
  | "dark"
  | "energetic"
  | "minimal"
  | "premium";

export interface ProductReviewProps {
  /** İnceleme başlığı */
  title: string;
  /** Ürün adı */
  productName: string;
  /** Genel puan (1–10) */
  overallScore: number;
  /** İnceleme bölümleri — sıralı */
  sections: ReviewSection[];
  subtitles: SubtitleChunk[];
  subtitleStyle: SubtitleStyle;
  settings: VideoSettings;
  /** Altyazı animasyon preset'i (opsiyonel) */
  subtitleAnimation?: SubtitleAnimation;
  /** Altyazı font ailesi (opsiyonel) */
  subtitleFont?: SubtitleFont;
  /** Ürün fiyatı (opsiyonel — verdidct sahnesinde gösterilir) */
  price?: number;
  /** Orijinal fiyat (opsiyonel — indirim varsa) */
  originalPrice?: number;
  /** Para birimi (opsiyonel, default: "TL") */
  currency?: string;
  /** Yıldız puanı, 0-5 (opsiyonel) */
  starRating?: number;
  /** Yorum sayısı (opsiyonel) */
  reviewCount?: number;
  /** Üst yorumlar (opsiyonel — floating comments) */
  topComments?: string[];
  /** İnceleme görsel stili (opsiyonel, default: "modern") */
  reviewStyle?: ProductReviewStyle;
}
