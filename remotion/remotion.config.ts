/**
 * Remotion yapılandırması.
 *
 * Bu ayarlar yalnızca `npx remotion render` ve `npx remotion studio`
 * komutları için geçerlidir. Backend'den programatik render
 * çağrıldığında bu değerler override edilebilir.
 */
import { Config } from "@remotion/cli/config";

// Video codec — H.264 en geniş uyumluluk ve YouTube uyumu sağlar
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");

// CRF (Constant Rate Factor) — düşük = yüksek kalite, 18 iyi denge noktası
Config.setCrf(18);

// Chromium bayrakları — headless rendering performansı için
Config.setChromiumOpenGlRenderer("angle");
