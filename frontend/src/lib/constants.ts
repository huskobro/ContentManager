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
export type SettingCategory = "system" | "pipeline" | "script" | "video_audio" | "tts_processing" | "subtitle_render" | "module_news" | "module_review";

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
  /** Bu ayar pipeline'ın hangi aşamasında devreye girer */
  pipelineStage?: string;
  /** Admin-only mı? (true ise user panelde görünmez) */
  adminOnly?: boolean;
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
    pipelineStage: "Sistem — İş kuyruğu yönetimi",
    adminOnly: true,
  },
  {
    key: "output_dir",
    label: "Video Çıktı Klasörü",
    description: "Tamamlanan videoların kopyalanacağı dizin (tam yol).",
    type: "path",
    category: "system",
    default: "",
    pipelineStage: "Sistem — Composition sonrası dosya kopyalama",
    adminOnly: true,
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
    pipelineStage: "Composition — Video çözünürlüğü ve oran belirleme",
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
    pipelineStage: "Script — LLM prompt dili ve TTS ses seçimi",
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
    pipelineStage: "TTS — Her sahne için ses sentezi sağlayıcısı",
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
    pipelineStage: "Script + Metadata — LLM senaryo ve metadata üretimi",
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
    pipelineStage: "Visuals — Sahne başına stok video/fotoğraf indirme",
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
    pipelineStage: "Subtitles + Composition — Altyazı renk/pozisyon stili",
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
    pipelineStage: "Script + Metadata — LLM birincil başarısız olursa sıralı deneme",
    adminOnly: true,
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
    pipelineStage: "TTS — Ses sentezi birincil başarısız olursa sıralı deneme",
    adminOnly: true,
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
    pipelineStage: "Visuals — Görsel birincil başarısız olursa sıralı deneme",
    adminOnly: true,
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
    pipelineStage: "Script — LLM senaryo üretiminde sahne sayısı parametresi",
  },
  {
    key: "category",
    label: "İçerik Kategorisi",
    description: "Senaryo üretim tonunu ve odağını belirler. Pipeline'da LLM system prompt'una eklenir.",
    type: "select",
    category: "script",
    default: "general",
    pipelineStage: "Script — LLM system prompt'a kategori-spesifik talimat ekleme",
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
    pipelineStage: "Script — LLM prompt'a hook tip seçimi ve tekrar önleme",
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
    pipelineStage: "Script — LLM API çağrısında temperature parametresi",
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
    pipelineStage: "Script — LLM API çağrısında max_output_tokens parametresi",
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
    pipelineStage: "Sistem — Pipeline runner iş zaman aşımı kontrolü",
    adminOnly: true,
  },

  // ── Video & Ses ─────────────────────────────────────────────────────────
  {
    key: "tts_voice",
    label: "TTS Sesi",
    description: "Edge TTS için varsayılan ses kimliği. tr-TR-EmelNeural (kadın) veya tr-TR-AhmetNeural (erkek).",
    type: "select",
    category: "video_audio",
    default: "tr-TR-EmelNeural",
    pipelineStage: "TTS — Her sahne ses sentezinde kullanılan ses kimliği",
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
    pipelineStage: "TTS — Pre-synthesis hız (Edge TTS rate) veya post-synthesis (ffmpeg atempo)",
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
    pipelineStage: "Composition — Remotion altyazı render font boyutu",
  },
  {
    key: "subtitle_use_whisper",
    label: "Whisper Altyazı Zamanlaması",
    description: "Etkin olduğunda Edge TTS word-timing yoksa OpenAI Whisper API kullanılır (~$0.006/dk). TTS provider word timing desteklemiyorsa otomatik etkinleşir.",
    type: "toggle",
    category: "video_audio",
    default: false,
    pipelineStage: "Subtitles — TTS sonrası kelime zamanlama stratejisi seçimi",
    adminOnly: true,
  },
  {
    key: "ken_burns_enabled",
    label: "Ken Burns Efekti",
    description: "Görsellere yavaş zoom/pan hareketi ekler. Haber bülteni için genellikle kapalı tutulur.",
    type: "toggle",
    category: "video_audio",
    default: true,
    pipelineStage: "Composition — Sahne görseli üzerinde zoom animasyonu toggle",
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
    pipelineStage: "Composition — Sahne görseli üzerinde zoom miktarı",
  },
  {
    key: "ken_burns_direction",
    label: "Ken Burns Yönü",
    description: "Zoom hareket yönü. center: merkez, pan-left/right: yönlü kaydırma, random: sahne başına döngüsel köşe.",
    type: "select",
    category: "video_audio",
    default: "center",
    options: [
      { value: "center", label: "Merkez (Varsayılan)" },
      { value: "pan-left", label: "Sola Pan" },
      { value: "pan-right", label: "Sağa Pan" },
      { value: "random", label: "Rastgele (Sahne başına köşe)" },
    ],
    pipelineStage: "Composition — Sahne görseli transform-origin yönü",
  },
  {
    key: "video_effect",
    label: "Video Renk Efekti",
    description: "Sahne üzerine uygulanan görsel filtre. warm/cool renk tonu, cinematic letterbox barları ekler.",
    type: "select",
    category: "video_audio",
    default: "none",
    options: [
      { value: "none", label: "Efekt Yok" },
      { value: "vignette", label: "Vignette (Kenar Karartma)" },
      { value: "warm", label: "Sıcak Ton" },
      { value: "cool", label: "Soğuk Ton" },
      { value: "cinematic", label: "Sinematik (Letterbox)" },
    ],
    pipelineStage: "Composition — Sahne render overlay efekti",
  },
  {
    key: "subtitle_bg",
    label: "Altyazı Arka Planı",
    description: "Altyazı metninin arkasına eklenen arka plan stili. Okunabilirliği artırır.",
    type: "select",
    category: "video_audio",
    default: "none",
    options: [
      { value: "none", label: "Arka Plan Yok (Alt Gradient)" },
      { value: "box", label: "Kutu (Dikdörtgen)" },
      { value: "pill", label: "Kapsül (Yuvarlatılmış)" },
    ],
    pipelineStage: "Composition — Altyazı konteyner stili",
  },
  {
    key: "subtitle_animation",
    label: "Altyazı Animasyonu",
    description: "Karaoke tarzı kelime animasyon preset'i. Stil (renk) ile bağımsız çalışır.",
    type: "select",
    category: "video_audio",
    default: "none",
    options: [
      { value: "none", label: "Animasyon Yok" },
      { value: "hype", label: "Hype (Slide-up + Zoom)" },
      { value: "explosive", label: "Explosive (Slide-left + Fire)" },
      { value: "vibrant", label: "Vibrant (Pop-in Bounce)" },
      { value: "minimal_anim", label: "Minimal (Renk Geçişi)" },
    ],
    pipelineStage: "Composition — Altyazı kelime-seviye giriş animasyonu",
  },
  {
    key: "subtitle_font",
    label: "Altyazı Fontu",
    description: "Altyazı metin fontu. Google Fonts ile yüklenir, yoksa sistem fontu kullanılır.",
    type: "select",
    category: "video_audio",
    default: "inter",
    options: [
      { value: "inter", label: "Inter (Modern, Okunabilir)" },
      { value: "roboto", label: "Roboto (Temiz, Nötr)" },
      { value: "montserrat", label: "Montserrat (Geometric)" },
      { value: "oswald", label: "Oswald (Condensed, Kalın)" },
      { value: "bebas", label: "Bebas Neue (Display, Impact)" },
      { value: "serif", label: "Serif (Georgia, Klasik)" },
      { value: "sans", label: "Sans-Serif (Arial, Basit)" },
    ],
    pipelineStage: "Composition — Altyazı font ailesi",
  },

  // ── TTS İşleme ─────────────────────────────────────────────────────────
  {
    key: "tts_clean_apostrophes",
    label: "Apostrof Temizleme",
    description: "TTS öncesi Türkçe apostrof kaldırma. ElevenLabs/Edge TTS'de mikro-duraklama sorununu çözer. Altyazı metni etkilenmez.",
    type: "toggle",
    category: "tts_processing",
    default: true,
    pipelineStage: "TTS — Ses sentezinden hemen önce metin üzerinde uygulanır",
    adminOnly: true,
  },
  {
    key: "tts_trim_silence",
    label: "Baş Sessizlik Kırpma",
    description: "TTS çıktısının başındaki sessizliği ffmpeg ile kırpar. Sahne geçişlerinde timing kaymasını önler.",
    type: "toggle",
    category: "tts_processing",
    default: true,
    pipelineStage: "TTS — Ses dosyası kaydedildikten sonra, süre ölçümünden önce",
    adminOnly: true,
  },
  {
    key: "tts_apply_speed_post",
    label: "Post-Synthesis Hız Ayarı",
    description: "TTS'in kendi hız parametresi olmayan sağlayıcılarda ffmpeg atempo ile hız ayarı. Edge TTS pre-synthesis desteklediği için normalde kapalıdır.",
    type: "toggle",
    category: "tts_processing",
    default: false,
    pipelineStage: "TTS — Ses dosyası üzerinde, trim silence sonrası uygulanır",
    adminOnly: true,
  },
  {
    key: "narration_humanize_enabled",
    label: "Narasyon Doğallaştırma",
    description: "Script çıktısını LLM ile doğal konuşma diline çevirir. AI klişelerini temizler, kısa cümleler üretir.",
    type: "toggle",
    category: "tts_processing",
    default: false,
    pipelineStage: "TTS — Script üretimi sonrası, ses sentezinden önce LLM post-processing",
    adminOnly: true,
  },
  {
    key: "narration_enhance_enabled",
    label: "TTS Vurgu Ekleme",
    description: "Narasyon metnine BÜYÜK HARF, ... duraklama, ! vurgu gibi TTS işaretleri ekler.",
    type: "toggle",
    category: "tts_processing",
    default: false,
    pipelineStage: "TTS — Script üretimi sonrası, ses sentezinden önce LLM post-processing",
    adminOnly: true,
  },

  // ── Haber Bülteni Modül Ayarları ────────────────────────────────────────
  {
    key: "bulletin_style",
    label: "Bülten Görsel Stili",
    description: "Haber bülteni renk teması ve görsel stili. breaking: kırmızı SON DAKİKA stili.",
    type: "select",
    category: "module_news",
    default: "corporate",
    options: [
      { value: "corporate", label: "Kurumsal (Mavi)" },
      { value: "breaking", label: "Son Dakika (Kırmızı)" },
      { value: "tech", label: "Teknoloji (Mor)" },
      { value: "sport", label: "Spor (Yeşil)" },
      { value: "finance", label: "Finans (Amber)" },
      { value: "science", label: "Bilim (Mor)" },
      { value: "entertainment", label: "Eğlence (Pembe)" },
      { value: "dark", label: "Koyu (Nötr)" },
    ],
    pipelineStage: "Composition — Bülten lower-third, ticker ve badge renk teması",
  },
  {
    key: "bulletin_network_name",
    label: "Yayın Ağı Adı",
    description: "Breaking news overlay ve badge'de gösterilen yayın ağı adı. Boş bırakılabilir.",
    type: "string",
    category: "module_news",
    default: "",
    pipelineStage: "Composition — Breaking news overlay badge metni",
  },
  {
    key: "bulletin_ticker_enabled",
    label: "Kayan Haber Şeridi",
    description: "Alt kısımda kayan haber başlıkları şeridi. Haber başlıklarından otomatik oluşturulur.",
    type: "toggle",
    category: "module_news",
    default: true,
    pipelineStage: "Composition — Frame 30'dan itibaren alt ticker bar render",
  },
  {
    key: "bulletin_breaking_enabled",
    label: "Son Dakika Overlay",
    description: "Videonun başında kırmızı SON DAKİKA flash overlay gösterir. bulletin_breaking_text dolu olmalıdır.",
    type: "toggle",
    category: "module_news",
    default: false,
    pipelineStage: "Composition — İlk 5 saniyede BreakingNewsOverlay bileşeni",
  },
  {
    key: "bulletin_breaking_text",
    label: "Son Dakika Metni",
    description: "Overlay'de görünecek kısa breaking news başlığı. Örn: 'DEPREM UYARISI'. Boş bırakılırsa overlay gösterilmez.",
    type: "string",
    category: "module_news",
    default: "",
    pipelineStage: "Composition — BreakingNewsOverlay ana metin alanı",
  },
  {
    key: "category_style_mapping_enabled",
    label: "Kategori→Stil Eşleşmesi",
    description: "Sahne kategorisine göre bülten görsel stilini otomatik seçer. Kapalıysa global 'Bülten Görsel Stili' ayarı kullanılır. Admin paneli → Kategori Stil Eşleşmeleri'nden özelleştirilebilir.",
    type: "toggle",
    category: "module_news",
    default: true,
    pipelineStage: "Composition — Dominant sahne kategorisine göre bulletinStyle override",
  },

  // ── Ürün İnceleme Modül Ayarları ───────────────────────────────────────
  {
    key: "review_style",
    label: "İnceleme Görsel Stili",
    description: "Ürün inceleme videonun renk paleti ve kart stili.",
    type: "select",
    category: "module_review",
    default: "modern",
    options: [
      { value: "modern", label: "Modern (Mavi)" },
      { value: "dark", label: "Koyu (Mor)" },
      { value: "energetic", label: "Enerjik (Kırmızı)" },
      { value: "minimal", label: "Minimal (Nötr)" },
      { value: "premium", label: "Premium (Altın)" },
    ],
    pipelineStage: "Composition — İnceleme floating comment ve badge renk teması",
  },
  {
    key: "review_price_enabled",
    label: "Fiyat Badge'i",
    description: "Verdict sahnesinde ürün fiyatı gösterir. İş oluştururken fiyat bilgisi girilmesi gerekir.",
    type: "toggle",
    category: "module_review",
    default: false,
    pipelineStage: "Composition — Verdict sahnesi, ScoreRing altında animated counter",
    // adminOnly kaldırıldı — kullanıcı CreateVideo formunda toggle edebilir
  },
  {
    key: "review_star_rating_enabled",
    label: "Yıldız Puanı",
    description: "Verdict sahnesinde 5 yıldızlı puan gösterir. İş oluştururken yıldız puanı girilmesi gerekir.",
    type: "toggle",
    category: "module_review",
    default: false,
    pipelineStage: "Composition — Verdict sahnesi, ScoreRing altında animated stars",
    // adminOnly kaldırıldı — kullanıcı CreateVideo formunda toggle edebilir
  },
  {
    key: "review_comments_enabled",
    label: "Floating Comments",
    description: "Overview/Pros sahnelerinde süzülen yorum kartları. İş oluştururken yorumlar girilirse LLM de üretebilir.",
    type: "toggle",
    category: "module_review",
    default: false,
    pipelineStage: "Composition — Overview ve Pros sahnelerinde floating speech bubble kartları",
    // adminOnly kaldırıldı — kullanıcı CreateVideo formunda toggle edebilir
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

// ─── Admin-Only Yardımcıları ────────────────────────────────────────────────
// Schema'daki adminOnly alanını runtime'da sorgulayan yardımcılar.
// UserSettings bu fonksiyonları kullanarak admin-only ayarları filtreleyebilir.

/** Belirtilen key admin-only mı? Schema'da adminOnly: true ise true döner. */
export function isSettingAdminOnly(key: string): boolean {
  const def = SYSTEM_SETTINGS_SCHEMA.find((d) => d.key === key);
  return def?.adminOnly === true;
}

/** Admin-only OLMAYAN, kullanıcının override edebileceği ayarları döndürür. */
export function getUserVisibleSettings(): SystemSettingDef[] {
  return SYSTEM_SETTINGS_SCHEMA.filter((d) => d.adminOnly !== true);
}

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
    label: "Video & Görsel",
    description: "Video çözünürlüğü, FPS, Ken Burns, renk efektleri, altyazı stili ve animasyon ayarları.",
  },
  tts_processing: {
    label: "TTS & Ses İşleme",
    description: "Ses sentezi ön/son işleme: apostrof temizleme, sessizlik kırpma, hız ayarı, narasyon iyileştirme.",
  },
  module_news: {
    label: "Haber Bülteni",
    description: "Haber bülteni modülüne özgü görsel ayarlar: stil, ticker bar, breaking news overlay, kategori→stil eşleşmesi.",
  },
  module_review: {
    label: "Ürün İnceleme",
    description: "Ürün inceleme modülüne özgü ayarlar: görsel stil, fiyat badge, yıldız puanı, floating comments. Fiyat/puan/yorum alanları iş oluştururken girilir.",
  },
};
