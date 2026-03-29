"""
Standard Video Modülü — Genel amaçlı YouTube video üretim pipeline'ı.

6 adımlı pipeline: Script → Metadata → TTS → Visuals → Subtitles → Composition

Bu modül ContentManager'ın varsayılan ve en temel içerik tipidir.
Kullanıcı bir konu girer, sistem 10 sahneli senaryo üretir, her sahne için
ses ve görsel oluşturur, altyazı ekler ve Remotion ile final videoyu birleştirir.
"""

from backend.modules.standard_video.pipeline import StandardVideoModule

# Registry tarafından import edilen tekil modül instance'ı
standard_video_module = StandardVideoModule()

__all__ = ["standard_video_module"]
