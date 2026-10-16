import {
  Inter,
  JetBrains_Mono,
  Lato,
  Literata,
  Lora,
  Merriweather,
  Montserrat,
  Nunito_Sans,
  Open_Sans,
  Playfair_Display,
  Source_Serif_4,
} from "next/font/google";

/**
 * The 10 document fonts plus JetBrains Mono (§4.4, PG2). Self-hosted by
 * next/font, latin + latin-ext (French/Kreol accents). The CSS variables match
 * FONTS[].cssVar in src/lib/marks/presets.ts.
 */

const lora = Lora({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-lora", style: ["normal", "italic"] });
const merriweather = Merriweather({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-merriweather", weight: ["400", "700", "900"], style: ["normal", "italic"] });
const playfair = Playfair_Display({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-playfair", style: ["normal", "italic"] });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-source-serif", style: ["normal", "italic"] });
const literata = Literata({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-literata", style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter", style: ["normal", "italic"] });
const openSans = Open_Sans({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-open-sans", style: ["normal", "italic"] });
const lato = Lato({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-lato", weight: ["400", "700", "900"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-montserrat", style: ["normal", "italic"] });
const nunitoSans = Nunito_Sans({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-nunito-sans", style: ["normal", "italic"] });
/** Variable 100–800: real bold weights so Bionic bold shows on mono (R4). */
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-jetbrains-mono", style: ["normal", "italic"] });

export const fontVariables = [
  lora, merriweather, playfair, sourceSerif, literata,
  inter, openSans, lato, montserrat, nunitoSans, jetbrainsMono,
].map((f) => f.variable).join(" ");
