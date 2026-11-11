import type { Metadata } from "next";
import { Outfit, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-poppins" });
// Algarismos tabulares (tnum) para valores e datas; a Poppins do Google Fonts não tem esse recurso.
const outfit = Outfit({ subsets: ["latin"], display: "swap", variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "GEAS Financeiro",
  description: "Gestão financeira do grupo escoteiro",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/png", sizes: "128x128" },
      { url: "/favicon.png", type: "image/png", sizes: "128x128" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/favicon.png", type: "image/png", sizes: "128x128" }],
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={`${poppins.variable} ${outfit.variable}`}><body>{children}</body></html>;
}
