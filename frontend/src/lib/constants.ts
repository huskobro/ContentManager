/**
 * Paylaşılan sabitler — birden fazla sayfada tekrar eden yapılandırmalar.
 *
 * STATUS_CONFIG:          İş durumu renk/etiket eşleştirmesi
 * MODULE_INFO:            Modül adı/renk eşleştirmesi
 * getModuleIcon:          Modül anahtarına göre Lucide ikon döndürür
 * SYSTEM_SETTINGS_SCHEMA: Tüm bilinen admin ayarlarının schema tanımı
 *                         (GlobalSettings.tsx tarafından kullanılır)
 * PROMPT_SETTINGS_SCHEMA: Modül bazlı ana prompt şablonları
 *                         (GlobalSettings.tsx → "Master Promptlar" bölümü)
 */

import React from "react";
import { Video, Newspaper, ShoppingBag, type LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { JobStatus } from "@/stores/jobStore";

// ─── İş Durumu Yapılandırması ───────────────────────────────────────────────

export interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

export const STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  queued: { label: "Kuyrukta", color: "text-slate-400", bg: "bg-slate-400/15" },
  running: { label: "Çalışıyor", color: "text-blue-400", bg: "bg-blue-400/15" },
  completed: { label: "Tamamlandı", color: "text-emerald-400", bg: "bg-emerald-400/15" },
  failed: { label: "Başarısız", color: "text-red-400", bg: "bg-red-400/15" },
  cancelled: { label: "İptal", color: "text-slate-500", bg: "bg-slate-500/15" },
};

// ─── Modül Bilgileri ────────────────────────────────────────────────────────

export interface ModuleInfoConfig {
  label: string;
  color: string;
}

export const MODULE_INFO: Record<string, ModuleInfoConfig> = {
  standard_video: { label: "Standart Video", color: "text-blue-400" },
  news_bulletin: { label: "Haber Bülteni", color: "text-amber-400" },
  product_review: { label: "Ürün İnceleme", color: "text-emerald-400" },
};

// ─── Durum Filtre Seçenekleri ───────────────────────────────────────────────

export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "queued", label: "Kuyrukta" },
  { value: "running", label: "Çalışıyor" },
  { value: "completed", label: "Tamamlandı" },
  { value: "failed", label: "Başarısız" },
  { value: "cancelled", label: "İptal" },
];

// ─── Modül Filtre Seçenekleri ───────────────────────────────────────────────

export const MODULE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tüm Modüller" },
  { value: "standard_video", label: "Standart Video" },
  { value: "news_bulletin", label: "Haber Bülteni" },
  { value: "product_review", label: "Ürün İnceleme" },
];

// ─── Modül İkon Yardımcısı ──────────────────────────────────────────────────

const MODULE_ICONS: Record<string, ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>> = {
  standard_video: Video,
  news_bulletin: Newspaper,
  product_review: ShoppingBag,
};

/**
 * Modül anahtarına göre Lucide ikon elementi döndürür.
 * Bilinmeyen modüller için varsayılan Video ikonu kullanılır.
 */
export function getModuleIcon(moduleKey: string, size: number = 14): React.ReactNode {
  const IconComponent = MODULE_ICONS[moduleKey] ?? Video;
  return React.createElement(IconComponent, { size });
}

// ─── System Settings Schema ─────────────────────────────────────────────────
// Tüm bilinen admin ayarlarının tanımı.
// GlobalSettings.tsx bu şemayı kullanarak:
//   - Her ayar için doğru input türünü render eder (number / string / array / password / select)
//   - DB'de kayıt yoksa default değeri placeholder olarak gösterir
//   - Ham JSON görünümünü kullanıcıdan gizler
//
// type:
//   "number"   → <input type="number">
//   "string"   → <input type="text">
//   "password" → <input type="password"> (göster/gizle butonu ile)
//   "array"    → virgülle ayrılmış tag input; DB'ye JSON.stringify([...]) olarak kaydedilir
//   "select"   → dropdown; options alanından seçenekler gelir
//   "path"     → dizin yolu input (string gibi ama küçük ikon ile)
//
// category:
//   "system"    → Genel sistem ayarları
//   "providers" → API anahtarları ve sağlayıcı yapılandırmaları
//   "pipeline"  → Pipeline varsayılanları

export type SettingFieldType = "number" | "string" | "password" | "array" | "multiselect" | "select" | "path" | "textarea" | "toggle";
export type SettingCategory = "system" | "pipeline" | "script" | "video_audio";

export interface SystemSettingDef {
  key: string;
  label: string;
  description: string;
  type: SettingFieldType;
  category: SettingCategory;
  default: unknown;
  options?: { value: string; label: string }[];  // sadece type="select" için
  min?: number;   // sadece type="number" için
  max?: number;
}

export const SYSTEM_SETTINGS_SCHEMA: SystemSettingDef[] = [
  // ── Sistem ──────────────────────────────────────────────────────────────
  {
    key: "max_concurrent_jobs",
    label: "Maksimum Eşzamanlı İş",
    description: "Arka plan worker'ının aynı anda çalıştırabileceği iş sayısı (1–10).",
    type: "number",
    category: "system",
    default: 2,
    min: 1,
    max: 10,
  },
  {
    key: "output_dir",
    label: "Video Çıktı Klasörü",
    description: "Tamamlanan videoların kopyalanacağı dizin (tam yol).",
    type: "path",
    category: "system",
    default: "",
  },
  {
    key: "video_format",
    label: "Varsayılan Video Formatı",
    description: "Yeni iş oluştururken önerilen format. Kullanıcı değiştirebilir.",
    type: "select",
    category: "system",
    default: "long",
    options: [
      { value: "long", label: "Uzun Video (16:9 · 1920×1080)" },
      { value: "shorts", label: "Shorts / Dikey (9:16 · 1080×1920)" },
    ],
  },
  {
    key: "language",
    label: "Varsayılan İçerik Dili",
    description: "Yeni işlerde önerilen dil kodu (ISO 639-1).",
    type: "select",
    category: "system",
    default: "tr",
    options: [
      { value: "tr", label: "Türkçe" },
      { value: "en", label: "English" },
      { value: "de", label: "Deutsch" },
      { value: "fr", label: "Français" },
      { value: "es", label: "Español" },
    ],
  },

  // ── Pipeline Varsayılanları ──────────────────────────────────────────────
  {
    key: "tts_provider",
    label: "Varsayılan TTS Sağlayıcısı",
    description: "Ses sentezi için birincil provider.",
    type: "select",
    category: "pipeline",
    default: "edge_tts",
    options: [
      { value: "edge_tts", label: "Edge TTS (Ücretsiz)" },
      { value: "elevenlabs", label: "ElevenLabs (Premium)" },
      { value: "openai_tts", label: "OpenAI TTS" },
    ],
  },
  {
    key: "llm_provider",
    label: "Varsayılan LLM Sağlayıcısı",
    description: "Senaryo ve metadata üretimi için birincil provider.",
    type: "select",
    category: "pipeline",
    default: "kieai",
    options: [
      { value: "kieai", label: "kie.ai (Gemini Proxy)" },
      { value: "gemini", label: "Google Gemini (Native)" },
      { value: "openai", label: "OpenAI GPT" },
    ],
  },
  {
    key: "visuals_provider",
    label: "Varsayılan Görsel Sağlayıcısı",
    description: "Sahne görselleri için birincil provider.",
    type: "select",
    category: "pipeline",
    default: "pexels",
    options: [
      { value: "pexels", label: "Pexels (Stok Video)" },
      { value: "pixabay", label: "Pixabay" },
    ],
  },
  {
    key: "subtitle_style",
    label: "Varsayılan Altyazı Stili",
    description: "Video kompozisyonunda kullanılacak altyazı stili.",
    type: "select",
    category: "pipeline",
    default: "standard",
    options: [
      { value: "standard", label: "Standard" },
      { value: "neon_blue", label: "Neon Mavi" },
      { value: "gold", label: "Altın" },
      { value: "minimal", label: "Minimal" },
      { value: "hormozi", label: "Hormozi Shorts" },
    ],
  },
  {
    key: "llm_fallback_order",
    label: "LLM Yedekleme Sırası",
    description: "Birincil LLM başarısız olursa sırayla denenecek sağlayıcılar.",
    type: "multiselect",
    category: "pipeline",
    default: ["kieai", "gemini"],
    options: [
      { value: "kieai", label: "kie.ai (Gemini Proxy)" },
      { value: "gemini", label: "Google Gemini (Native)" },
      { value: "openai", label: "OpenAI GPT" },
    ],
  },
  {
    key: "tts_fallback_order",
    label: "TTS Yedekleme Sırası",
    description: "Birincil TTS başarısız olursa sırayla denenecek sağlayıcılar.",
    type: "multiselect",
    category: "pipeline",
    default: ["edge_tts", "openai_tts"],
    options: [
      { value: "edge_tts", label: "Edge TTS (Ücretsiz)" },
      { value: "elevenlabs", label: "ElevenLabs (Premium)" },
      { value: "openai_tts", label: "OpenAI TTS" },
    ],
  },
  {
    key: "visuals_fallback_order",
    label: "Görsel Yedekleme Sırası",
    description: "Birincil görsel sağlayıcısı başarısız olursa denenecekler.",
    type: "multiselect",
    category: "pipeline",
    default: ["pexels", "pixabay"],
    options: [
      { value: "pexels", label: "Pexels (Stok Video)" },
      { value: "pixabay", label: "Pixabay" },
    ],
  },

  // ── Senaryo Üretimi ──────────────────────────────────────────────────────
  {
    key: "scene_count",
    label: "Sahne Sayısı",
    description: "Senaryo kaç sahneden oluşsun. Her sahne ~15-25 sn TTS süresi üretir.",
    type: "number",
    category: "script",
    default: 10,
    min: 3,
    max: 20,
  },
  {
    key: "category",
    label: "İçerik Kategorisi",
    description: "Senaryo üretim tonunu ve odağını belirler. Pipeline'da LLM system prompt'una eklenir.",
    type: "select",
    category: "script",
    default: "general",
    options: [
      { value: "general", label: "Genel" },
      { value: "true_crime", label: "Suç & Gizem" },
      { value: "science", label: "Bilim & Teknoloji" },
      { value: "history", label: "Tarih" },
      { value: "motivation", label: "Motivasyon & Kişisel Gelişim" },
      { value: "religion", label: "Din & Maneviyat" },
    ],
  },
  {
    key: "use_hook_variety",
    label: "Açılış Hook Çeşitliliği",
    description: "Etkin olduğunda her senaryoda farklı açılış hook tipi seçilir (şok edici gerçek, soru, hikaye vb.). Tekrar önleme sistemi son 6 hook'u takip eder.",
    type: "toggle",
    category: "script",
    default: true,
  },
  {
    key: "script_temperature",
    label: "Senaryo Yaratıcılık (Temperature)",
    description: "LLM temperature (0.0–2.0). Düşük = tutarlı/tekrarcı, Yüksek = yaratıcı/beklenmedik. Standart: 0.8, Haber: 0.6, Ürün: 0.7. Ondalık girin: 0.8",
    type: "number",
    category: "script",
    default: 0.8,
    min: 0,
    max: 2,
  },
  {
    key: "script_max_tokens",
    label: "Senaryo Max Token",
    description: "LLM çıktısı için token sınırı. Çok sahne veya uzun narasyon gerekiyorsa artır.",
    type: "number",
    category: "script",
    default: 4096,
    min: 1024,
    max: 16384,
  },
  {
    key: "job_timeout_seconds",
    label: "İş Zaman Aşımı (saniye)",
    description: "Bir iş bu süreden uzun sürerse iptal edilir. Varsayılan: 1800 (30 dakika).",
    type: "number",
    category: "script",
    default: 1800,
    min: 300,
    max: 7200,
  },

  // ── Video & Ses ─────────────────────────────────────────────────────────
  {
    key: "tts_voice",
    label: "TTS Sesi",
    description: "Edge TTS için varsayılan ses kimliği. tr-TR-AhmetNeural (erkek) veya tr-TR-EmelNeural (kadın).",
    type: "select",
    category: "video_audio",
    default: "tr-TR-AhmetNeural",
    options: [
      { value: "tr-TR-AhmetNeural", label: "Ahmet (Türkçe Erkek)" },
      { value: "tr-TR-EmelNeural", label: "Emel (Türkçe Kadın)" },
      { value: "en-US-AriaNeural", label: "Aria (İngilizce Kadın)" },
      { value: "en-US-GuyNeural", label: "Guy (İngilizce Erkek)" },
      { value: "de-DE-ConradNeural", label: "Conrad (Almanca Erkek)" },
    ],
  },
  {
    key: "tts_speed",
    label: "TTS Hızı",
    description: "Ses sentezi hız çarpanı. 1.0 = normal, 1.1 = %10 hızlı, 0.9 = %10 yavaş. Ondalık girin: 1.0",
    type: "number",
    category: "video_audio",
    default: 1.0,
    min: 0,
    max: 3,
  },
  {
    key: "video_resolution",
    label: "Video Çözünürlüğü",
    description: "Remotion render çözünürlüğü. Shorts için 1080×1920 kullanın.",
    type: "select",
    category: "video_audio",
    default: "1920x1080",
    options: [
      { value: "1920x1080", label: "1920×1080 (Full HD · 16:9)" },
      { value: "1080x1920", label: "1080×1920 (Dikey · 9:16 Shorts)" },
      { value: "1280x720", label: "1280×720 (HD)" },
    ],
  },
  {
    key: "video_fps",
    label: "Video FPS",
    description: "Remotion render kare hızı.",
    type: "select",
    category: "video_audio",
    default: 30,
    options: [
      { value: "24", label: "24 FPS (Sinematik)" },
      { value: "30", label: "30 FPS (Standart)" },
      { value: "60", label: "60 FPS (Akıcı)" },
    ],
  },
  {
    key: "subtitle_font_size",
    label: "Altyazı Font Boyutu",
    description: "Pixel cinsinden altyazı boyutu. Varsayılan: 48. Shorts için 56-64 önerilir.",
    type: "number",
    category: "video_audio",
    default: 48,
    min: 24,
    max: 96,
  },
  {
    key: "subtitle_use_whisper",
    label: "Whisper Altyazı Zamanlaması",
    description: "Etkin olduğunda Edge TTS word-timing yoksa OpenAI Whisper API kullanılır (~$0.006/dk). Çoğu durumda Edge TTS word-timing yeterlidir.",
    type: "toggle",
    category: "video_audio",
    default: false,
  },
  {
    key: "ken_burns_enabled",
    label: "Ken Burns Efekti",
    description: "Görsellere yavaş zoom/pan hareketi ekler. Haber bülteni için genellikle kapalı tutulur.",
    type: "toggle",
    category: "video_audio",
    default: true,
  },
  {
    key: "ken_burns_intensity",
    label: "Ken Burns Yoğunluğu",
    description: "Ken Burns efektinin zoom miktarı (0.01–0.3). 0.05 = hafif, 0.15 = belirgin. Ondalık girin: 0.05",
    type: "number",
    category: "video_audio",
    default: 0.05,
    min: 0,
    max: 1,
  },

];

// ─── Prompt Settings Schema ─────────────────────────────────────────────────
// Her modülün ana içerik üretim promptları admin tarafından düzenlenebilir.
// GlobalSettings.tsx → "Master Promptlar" bölümünde gösterilir.

export interface PromptSettingDef {
  key: string;
  label: string;
  description: string;
  module: "standard_video" | "news_bulletin" | "product_review";
  placeholder: string;
}

export const PROMPT_SETTINGS_SCHEMA: PromptSettingDef[] = [
  // ── Standart Video ──────────────────────────────────────────────────────
  {
    key: "standard_video_script_prompt",
    label: "Standart Video — Script Promptu",
    description: "LLM'e gönderilecek ana senaryo üretim talimatı. {topic} değişkeni konu adıyla değiştirilir.",
    module: "standard_video",
    placeholder: "Aşağıdaki konu hakkında 10 sahneli bir video senaryosu yaz:\nKonu: {topic}\n\nHer sahne şunları içermeli:\n- scene_number (1-10)\n- narration (seslendirilecek metin, 30-60 kelime)\n- visual_keywords (görsel araması için 3-5 anahtar kelime)\n- duration_seconds (4-8 saniye)\n\nJSON formatında dön.",
  },
  {
    key: "standard_video_metadata_prompt",
    label: "Standart Video — Metadata Promptu",
    description: "YouTube başlık, açıklama ve etiket üretim talimatı. {topic} ve {script_summary} değişkenleri kullanılabilir.",
    module: "standard_video",
    placeholder: "Aşağıdaki video için YouTube metadata üret:\nKonu: {topic}\n\nJSON döndür: title, description (300 kelime), tags (15 etiket), category",
  },
  // ── Haber Bülteni ───────────────────────────────────────────────────────
  {
    key: "news_bulletin_script_prompt",
    label: "Haber Bülteni — Script Promptu",
    description: "Haber bülteni video senaryosu üretim talimatı. {news_items} değişkeni haber başlıklarıyla değiştirilir.",
    module: "news_bulletin",
    placeholder: "Aşağıdaki haber başlıklarından profesyonel bir video bülten senaryosu oluştur:\n{news_items}\n\nHer haber için kısa, akıcı bir anlatım yaz. JSON formatında dön.",
  },
  {
    key: "news_bulletin_metadata_prompt",
    label: "Haber Bülteni — Metadata Promptu",
    description: "Haber bülteni YouTube metadata üretim talimatı.",
    module: "news_bulletin",
    placeholder: "Haber bülteni videosu için YouTube metadata üret:\nHaberler: {news_summary}\n\nJSON döndür: title, description, tags",
  },
  // ── Ürün İnceleme ───────────────────────────────────────────────────────
  {
    key: "product_review_script_prompt",
    label: "Ürün İnceleme — Script Promptu",
    description: "Ürün inceleme video senaryosu üretim talimatı. {product_name} ve {product_info} değişkenleri kullanılabilir.",
    module: "product_review",
    placeholder: "Aşağıdaki ürün için kapsamlı bir inceleme videosu senaryosu yaz:\nÜrün: {product_name}\nBilgi: {product_info}\n\nJSON formatında 8 sahnelik senaryo döndür.",
  },
  {
    key: "product_review_metadata_prompt",
    label: "Ürün İnceleme — Metadata Promptu",
    description: "Ürün inceleme YouTube metadata üretim talimatı.",
    module: "product_review",
    placeholder: "Ürün inceleme videosu için YouTube metadata üret:\nÜrün: {product_name}\n\nJSON döndür: title, description, tags",
  },
];

// Kategorilerin görüntü başlıkları
export const SETTING_CATEGORY_META: Record<
  SettingCategory,
  { label: string; description: string }
> = {
  system: {
    label: "Sistem Ayarları",
    description: "İş kuyruğu, çıktı dizini ve genel davranış ayarları.",
  },
  pipeline: {
    label: "Pipeline Varsayılanları",
    description: "Yeni işlerde kullanılacak varsayılan provider ve stil seçimleri.",
  },
  script: {
    label: "Senaryo Üretimi",
    description: "LLM senaryo üretim parametreleri: kategori, hook sistemi, temperature, sahne sayısı.",
  },
  video_audio: {
    label: "Video & Ses",
    description: "TTS sesi, hızı, video çözünürlüğü, FPS, altyazı boyutu ve Ken Burns efekti.",
  },
};
