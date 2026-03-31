# TTS Sağlayıcı Yetenekleri

**Son Guncelleme:** 2026-03-31
**Kaynak:** `backend/providers/tts/capabilities.py`

---

## Model Durumu

**Entegrasyon seviyesi:** AKTIF — Pipeline karar zincirine bagli

Capability modeli:
- Dogru ve test edilmis (7 unit test)
- Frozen dataclass (immutable, runtime hatasi onlenir)
- 3 provider + bilinmeyen icin guvenli fallback tanimli
- Pipeline'da 2 noktada aktif olarak kullaniliyor

---

## Ne Calisiyor

| Bilesin | Durum |
|---|---|
| TTSCapability dataclass | CALISIYOR — dogru alanlar, frozen |
| get_tts_capabilities() | CALISIYOR — provider adi ile sorgulama |
| get_all_capabilities() | CALISIYOR — tum provider listesi |
| Unit testler (7 test) | CALISIYOR — 7/7 gecti |
| Subtitle timing otomasyonu | CALISIYOR — subtitles.py'de provider capability'sine gore Whisper otomatik etkinlestirme |
| Post-synthesis hiz otomasyonu | CALISIYOR — step_tts'de requires_post_synthesis_speed kontrolu |

## Entegrasyon Noktalari

### 1. Subtitle Zamanlama (subtitles.py)

```python
tts_caps = get_tts_capabilities(tts_provider_name)
if tts_caps.requires_alignment_fallback and bool(openai_api_key) and not use_whisper:
    use_whisper = True  # Otomatik etkinlestir
```

Provider word timing desteklemiyorsa VE OpenAI API key mevcutsa,
config flag (subtitle_use_whisper) kapali olsa bile Whisper otomatik
etkinlestirilir. Config flag aciksa zaten calisir.

### 2. Post-Synthesis Hiz (standard_video/pipeline.py)

```python
provider_caps = get_tts_capabilities(provider_used)
should_apply_speed = tts_apply_speed_post or (
    provider_caps.requires_post_synthesis_speed
    and not provider_caps.supports_pre_synthesis_speed
)
```

Config flag (tts_apply_speed_post) aciksa her zaman uygulanir.
Kapali olsa bile, provider pre-synthesis hiz desteklemiyorsa
otomatik olarak post-synthesis uygulanir.

---

## Provider Yetenek Tablosu

| Provider | Word Timing | Format | Cumle Timing | Pre-Synthesis Hiz | Post-Synthesis Hiz | Alignment Fallback | Onerilen Strateji | Kalite |
|---|---|---|---|---|---|---|---|---|
| `edge_tts` | EVET | word_boundary_ms | EVET | EVET | HAYIR | HAYIR | tts_word_timing | excellent |
| `elevenlabs` | HAYIR | none | HAYIR | EVET | HAYIR | EVET | whisper_api | none |
| `openai_tts` | HAYIR | none | HAYIR | EVET | HAYIR | EVET | whisper_api | none |
| *(bilinmeyen)* | HAYIR | none | HAYIR | HAYIR | EVET | EVET | equal_distribution | none |

---

## Guncel Pipeline Davranisi (Capability + Config Hibrit)

### Subtitle Zamanlama

```
provider = tts_data["provider"]
caps = get_tts_capabilities(provider)

IF tts_word_timings var (cache'te):
  → TTS word timing kullan (Edge TTS burada yakalanir)
ELIF caps.requires_alignment_fallback VE API key var:
  → Whisper otomatik etkinlestirilir (config flag'e bakmaksizin)
ELIF subtitle_use_whisper=true VE API key var:
  → Whisper manual olarak etkin
ELSE:
  → equal_distribution fallback
```

**Edge TTS akisi bozulmaz:** Edge TTS word_timings dondurur →
Strateji 1 tetiklenir → capability kontrolune bile ulasilmaz.

**ElevenLabs/OpenAI TTS akisi:** word_timings bos →
capability `requires_alignment_fallback=True` → Whisper otomatik acar
(API key varsa).

### Post-Synthesis Hiz

```
caps = get_tts_capabilities(provider_used)
should_apply = config_flag OR (
    caps.requires_post_synthesis_speed
    AND NOT caps.supports_pre_synthesis_speed
)
IF should_apply AND speed != 1.0:
  → apply_speed() cagir
```

**Edge TTS:** `supports_pre_synthesis_speed=True` →
`requires_post_synthesis_speed=False` → otomatik tetiklenmez.
Config flag acilsa bile Edge TTS'in kendi rate parametresi zaten uygulanir.

**Bilinmeyen provider:** `requires_post_synthesis_speed=True`,
`supports_pre_synthesis_speed=False` → otomatik tetiklenir.

---

## Sonuc

Capability modeli artik **aktif pipeline kararlarinda kullaniliyor**:
1. Subtitle timing: Provider'a gore otomatik Whisper etkinlestirme
2. Post-synthesis hiz: Provider'a gore otomatik apply_speed
3. Config flag'ler hala gecerli — capability modeli sadece akilli fallback sagliyor
4. Edge TTS mevcut davranisi **hic degismedi** (word timing birincil, pre-synthesis hiz)
5. Yeni provider eklendiginde capability tanimlandi mi diye bakiliyor
