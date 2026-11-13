import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "@geas/ui/styles.css";
import "./globals.css";

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
  return <html lang="pt-BR"><body>{children}<Toaster /></body></html>;
}
