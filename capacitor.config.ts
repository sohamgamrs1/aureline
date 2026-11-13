import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Aureline ships as a fully client-side app, so the Android shell is just a
 * WebView over `dist/`. No server, no plugin permissions beyond the camera,
 * which the WebView requests itself via getUserMedia.
 */
const config: CapacitorConfig = {
  appId: "app.aureline.scan",
  appName: "Aureline",
  webDir: "dist",
  android: {
    // Photos are picked with <input type="file">; allow the WebView to open the
    // photo picker without a native bridge.
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
