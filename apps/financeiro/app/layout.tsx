import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Fonte do financeiro (variável, com algarismos tabulares). O site institucional segue em Poppins.
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
  return <html lang="pt-BR" className={outfit.variable}><body>{children}<Toaster /></body></html>;
}
