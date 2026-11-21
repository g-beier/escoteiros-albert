import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Outfit (OFL, assets/fonts/outfit/OFL.txt) nos PDFs: arquivos estáticos por peso, registrados uma vez por processo.

export const REPORT_FONT = "Outfit";
let registered = false;

export function registerReportFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "assets", "fonts", "outfit");
  Font.register({
    family: REPORT_FONT,
    fonts: [
      { src: path.join(dir, "Outfit-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Outfit-Medium.ttf"), fontWeight: 500 },
      { src: path.join(dir, "Outfit-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(dir, "Outfit-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // nomes e títulos não se partem com hífen
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
