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
import { Video, Newspaper, ShoppingBag } from "lucide-react";
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

const MODULE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
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

export type SettingFieldType = "number" | "string" | "password" | "array" | "multiselect" | "select" | "path" | "textarea";
export type SettingCategory = "system" | "pipeline";

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
    key: "default_language",
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
    key: "default_tts_provider",
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
    key: "default_llm_provider",
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
    key: "default_visuals_provider",
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
    key: "default_subtitle_style",
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
};
