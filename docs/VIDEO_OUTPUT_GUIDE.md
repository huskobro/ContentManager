# Video Çıktı Dosyaları — Konum ve Erişim Rehberi

## 📁 Dosya Konumları

Tamamlanan her işin video çıktısı şu konumda saklanır:

```
sessions/{job_id}/step_composition/final.mp4
```

Tam yol örneği:
```
/Users/huseyincoskun/Downloads/Antigravity Proje/ContentManager/sessions/b9ee789d779749b093513d3e49035df2/step_composition/final.mp4
```

## 🎥 Çıktı Bilgileri

- **Formatı:** MP4 (H.264 video + AAC audio)
- **Çözünürlüğü:** 1920x1080 (HD)
- **Örnek dosya boyutu:** 120-150 MB (video uzunluğuna göre değişir)

## 🔍 Veritabanında Kontrol

Tamamlanan işleri SQLite veritabanında kontrol edebilirsiniz:

```bash
sqlite3 contentmanager.db "SELECT id, title, status, output_path FROM jobs WHERE status='completed';"
```

Çıktısı:
```
b9ee789d779749b093513d3e49035df2|ş|completed|/Users/huseyincoskun/Downloads/Antigravity Proje/ContentManager/sessions/b9ee789d779749b093513d3e49035df2/step_composition/final.mp4
```

## 💾 Video İndirme Yolları

### 1️⃣ **UI'dan İndirme (En Kolay)**
- JobDetail sayfasına gidin
- İş tamamlanmışsa, sağ üst köşede **"İndir"** butonu görüntülenir
- Butona tıklayın → video `video_{job_id}.mp4` adıyla indirilir

### 2️⃣ **API Endpoint'yle İndirme**
```bash
curl -O http://localhost:8000/api/jobs/{job_id}/output
```

Örnek:
```bash
curl -O http://localhost:8000/api/jobs/b9ee789d779749b093513d3e49035df2/output
```

### 3️⃣ **Dosya Sisteminden Direkt Kopya**
```bash
cp sessions/{job_id}/step_composition/final.mp4 ~/Desktop/my_video.mp4
```

## 🔗 Backend Endpoint Detayları

| Endpoint | Metod | Açıklama | Durum Kodu |
|----------|-------|----------|-----------|
| `/api/jobs/{job_id}/output` | GET | Video dosyasını indir | 200 OK |
| | | | 404 (iş bulunamadı) |
| | | | 409 (iş tamamlanmamış) |

## ✅ Tamamlanma Kontrolü

İş tamamlanmış mı kontrol etmek için:

```bash
curl http://localhost:8000/api/jobs/{job_id} | jq '.status'
```

Çıktı: `"completed"` ise hazır.

## 📊 Tüm Kaynakları Görmek

Session klasöründeki tüm ara dosyalar:

```
sessions/{job_id}/
├── step_script/
│   └── step_script.json           # Senaryo metni
├── step_metadata/
│   └── step_metadata.json         # Başlık, açıklama, etiketler
├── step_tts/
│   ├── scene_01.wav, scene_02.wav, ...  # Ses dosyaları
│   └── step_tts.json
├── step_visuals/
│   ├── scene_01.mp4, scene_02.mp4, ...  # Görsel dosyaları
│   └── step_visuals.json
├── step_subtitles/
│   ├── subtitles.srt             # Alt yazı dosyası
│   └── step_subtitles.json
└── step_composition/
    ├── final.mp4                  # ✅ FINAL VİDEO (İndir buradan!)
    └── step_composition.json
```

## 🚨 Hata Durumunda

Eğer indirme başarısız olursa:

- İşin durumunu kontrol et: `status='completed'` mi?
- Dosya diskten silinmemiş mi kontrol et: `ls -lh sessions/{job_id}/step_composition/final.mp4`
- API endpoint'i sağlıklı mı kontrol et: `curl -I http://localhost:8000/api/jobs/{job_id}/output`

## 📝 Not

- Dosyalar session klasöründe saklanır (`.gitignore`'da var)
- İşi silerseniz, çıktı dosyaları da silinir
- Backup için uzak sunucuya yüklemeyi planlamak önerilir (YouTube gibi)
