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
}

// ─── NewsBulletin Composition Props ───────────────────────────────────────────

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
}
