// Font configuration for NeoBot Demo Video
// Typography: Geist (Vercel's font family)
// Uses @remotion/fonts for reliable render-time font loading

import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Font family names
export const geist = '"Geist", sans-serif';
export const geistMono = '"Geist Mono", monospace';

// Legacy exports for backwards compatibility
export const playfair = geist;
export const figtree = geist;
export const jetbrains = geistMono;

// Load fonts using @remotion/fonts - ensures fonts are ready before rendering
// This is called once at module load time
const fontsLoaded = Promise.all([
  loadFont({
    family: "Geist",
    url: staticFile("fonts/Geist-Variable.woff2"),
    weight: "100 900",
    style: "normal",
  }),
  loadFont({
    family: "Geist Mono",
    url: staticFile("fonts/GeistMono-Variable.woff2"),
    weight: "100 900",
    style: "normal",
  }),
]);

// Export the promise for components that need to wait
export { fontsLoaded };
