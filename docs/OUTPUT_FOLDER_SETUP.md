# Output Klasörü Yönetimi

## 🎯 Özet

Tamamlanan videoları belirli bir klasöre otomatik olarak kaydetmek için output klasörünü ayarlayabilirsiniz. Varsayılan olarak videolar `./output` klasöründe saklanır, ancak istediğiniz herhangi bir yola değiştirebilirsiniz.

## 📁 Varsayılan Ayar

```
ContentManager/
├── output/                    # ← Tamamlanan videolar buraya kaydedilir
│   ├── abc12345.mp4          # Job ID'nin ilk 8 karakteri
│   ├── def67890.mp4
│   └── ...
```

## 🔧 Output Klasörünü Değiştirme

### 1️⃣ `.env` Dosyasından

Başlatmadan önce `.env` dosyasına ekleyin:

```bash
# .env
OUTPUT_DIR=/Users/huseyincoskun/Desktop/my_videos
# veya
OUTPUT_DIR=/Volumes/external_drive/videos
# veya
OUTPUT_DIR=./my_output
```

Ardından backend'i başlatın.

### 2️⃣ Admin Panel Endpoint'yle (Çalışma Sırasında)

İstek yapın:

```bash
curl -X POST http://localhost:8000/api/settings/admin/output-folder \
  -H "X-Admin-Pin: 0000" \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/huseyincoskun/Desktop/video_output"}'
```

**Yanıt:**

```json
{
  "path": "/Users/huseyincoskun/Desktop/video_output",
  "absolute_path": "/Users/huseyincoskun/Desktop/video_output",
  "exists": true,
  "message": "Output klasörü ayarlandı: /Users/huseyincoskun/Desktop/video_output"
}
```

Klasör otomatik olarak oluşturulur; varsa hiçbir hata vermez.

## ✅ Mevcut Output Klasörünü Kontrol Etme

```bash
curl http://localhost:8000/api/settings/admin/output-folder \
  -H "X-Admin-Pin: 0000" | jq .
```

**Yanıt:**

```json
{
  "path": "/Users/huseyincoskun/Desktop/video_output",
  "absolute_path": "/Users/huseyincoskun/Desktop/video_output",
  "exists": true,
  "message": "Mevcut output klasörü: /Users/huseyincoskun/Desktop/video_output"
}
```

## 🔄 Ayar Kalıcılığı

Admin panel'den ayarlanan output_dir:

1. **SQLite'a kaydedilir** (settings tablosu, scope='admin')
2. **Runtime sırasında geçerli hale gelir**
3. **Sistem yeniden başlatılıp da ayar okunur** (main.py startup'ında)

Eğer backend'i yeniden başlatırsanız:
- `.env` dosyasında OUTPUT_DIR varsa → ondan okur
- Yoksa SQLite'daki admin ayarını kontrol eder
- İkisi de yoksa → `./output` varsayılan'ını kullanır

**Öncelik sırası:**
```
.env → SQLite (admin) → SQLite (global) → Kodda hardcoded default (./output)
```

## 📊 Video Dosya Adlandırması

Tamamlanan videolar şu şekilde adlandırılır:

```
{job_id_first_8_chars}.mp4

Örnek:
abc12345.mp4    (job_id = abc123456789abcdef...)
```

Aynı job'ı yeniden çalıştırırsanız önceki dosya üzerine yazılır.

## 🚀 Workflow

### Video Oluşturma Adımları

```
1. Kullanıcı video oluştur → job başlatılır
2. Pipeline çalışır → compose step başarısız/başarılı
3. Render tamamlanırsa:
   ✓ Video compositions/final.mp4'te oluşturulur (session klasörü)
   ✓ Output klasörüne kopyalanır (OUTPUT_DIR/{job_id}.mp4)
   ✓ DB'deki output_path = OUTPUT_DIR klasörüne işaret eder
```

### İndirme Akışı

```
Frontend:
  ✓ "İndir" butonu → GET /api/jobs/{job_id}/output
  
Backend:
  ✓ DB'deki output_path'i oku
  ✓ File stream olarak döndür
  ✓ Browser tarafından indir
```

## 🔐 Güvenlik

- **Output klasörü ayarı:** Admin PIN (`X-Admin-Pin` header) gereklidir
- **GET endpoint:** PIN gerektirmez (tamamlanan işin output'u herkese açık)
- **Mutlak vs. Göreceli Path:**
  - Mutlak path: `/Users/huseyincoskun/Desktop/output` ✓
  - Göreceli path: `./output` ✓ (ContentManager kök dizinine göre)

## 🛠️ Sorun Giderme

### Problem: Klasör oluştulamıyor

```bash
# Hatası: "Klasör ayarlanamadı: [Permission denied]"
```

**Çözüm:** Klasör yolu yazılabilir mi kontrol edin:

```bash
mkdir -p /path/to/output
chmod 755 /path/to/output
```

### Problem: Video output klasörüne kaydedilmiyor, session'da kalıyor

**Sebepleri:**
- Output klasörü ayarlanmamış → varsayılan `./output` kullan
- Klasör izinleri yetersiz → `shutil.copy2()` başarısız
- Disk dolu → copy başarısız

**Çözüm:** Backend log'unu kontrol edin:

```bash
tail -f logs/contentmanager.log | grep -i "output"
```

### Problem: Eski path'teki videolar artık erişilebilir değil

**Sebep:** Output_dir değiştirildi, eski videolar eski yolda kalıyor.

**Çözüm:** Eski videoları yeni klasöre taşıyın:

```bash
# Eski OUTPUT_DIR'in yerini öğren
sqlite3 contentmanager.db "SELECT value FROM settings WHERE key='output_dir' AND scope='admin';"

# Dosyaları taşı
mv /old/path/* /new/path/
```

## 📝 Teknik Detaylar

### Composition Step'de Kopyalama Mantığı

Dosya: `backend/pipeline/steps/composition.py`

```python
# Adım 10: Videoyu output klasörüne kopyala
output_folder = app_settings.output_dir
output_filename = f"{job_id[:8]}.mp4"
output_file_path = output_folder / output_filename

shutil.copy2(str(output_path), str(output_file_path))
final_output_path = output_file_path
```

- `output_path`: session klasöründeki video (session/{job_id}/step_composition/final.mp4)
- `final_output_path`: output klasöründeki video (output/{job_id[:8]}.mp4)
- **Her ikisi de DB'de kaydedilir:**
  - Başarı: `output_path` = output klasörü yolu
  - Hata: `output_path` = session klasörü yolu (fallback)

### Startup'da Output_Dir Yükleme

Dosya: `backend/main.py` (lifespan > startup)

```python
# Admin panel'de ayarlanan output_dir'i yükle
resolver = SettingsResolver(db)
saved_output_dir = resolver.get(scope="admin", scope_id="", key="output_dir")
if saved_output_dir:
    settings.output_dir = Path(saved_output_dir)
    settings.output_dir.mkdir(parents=True, exist_ok=True)
```

## 🎯 Kullanım Senaryoları

### Senaryo 1: Masaüstüne Otomatik Kaydet

```bash
curl -X POST http://localhost:8000/api/settings/admin/output-folder \
  -H "X-Admin-Pin: 0000" \
  -d '{"path": "~/Desktop/ContentManager_Videos"}'
```

### Senaryo 2: Harici Sürüye Kaydet

```bash
curl -X POST http://localhost:8000/api/settings/admin/output-folder \
  -H "X-Admin-Pin: 0000" \
  -d '{"path": "/Volumes/USB_DRIVE/videos"}'
```

### Senaryo 3: Server'a Kaydet

```bash
curl -X POST http://localhost:8000/api/settings/admin/output-folder \
  -H "X-Admin-Pin: 0000" \
  -d '{"path": "/mnt/nas/content_videos"}'
```

## 📊 Veri Modeli

### Settings Tablosu

```sql
SELECT * FROM settings 
WHERE scope='admin' AND key='output_dir';

Çıktı:
id  | scope | scope_id | key        | value                          | locked | created_at | updated_at
----|-------|----------|------------|--------------------------------|--------|------------|----------
42  | admin |          | output_dir | "/Users/.../Desktop/my_videos" | 0      | ...        | ...
```

## 🔗 İlgili Endpoint'ler

| Endpoint | Metod | Açıklama | PIN |
|----------|-------|----------|-----|
| `/api/settings/admin/output-folder` | GET | Mevcut output_dir'i getir | ✓ |
| `/api/settings/admin/output-folder` | POST | Yeni output_dir ayarla | ✓ |
| `/api/jobs/{job_id}/output` | GET | Video dosyasını indir | ✗ |

