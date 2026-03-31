"""
Publishing Hub — platform-agnostik yayın altyapısı.

Paket yapısı:
  adapters/base.py          — BasePublishAdapter ABC + PublishError
  adapters/youtube_adapter.py — YouTubeAdapter (mevcut youtube_upload_service'i sarar)
  orchestrator.py           — PublishOrchestrator + adapter registry

Kullanım:
  from backend.publishing.orchestrator import PublishOrchestrator
"""
