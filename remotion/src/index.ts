/**
 * Remotion giriş noktası.
 *
 * `npx remotion render src/index.ts <CompositionId> out.mp4`
 * komutu bu dosyayı entry olarak kullanır.
 */
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
