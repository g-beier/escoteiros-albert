import type { Metadata } from "next";
import { Toaster } from "@geas/ui/components/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "GEAS Inventário",
  description: "Gestão de patrimônio e materiais do grupo escoteiro",
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
  return <html lang="pt-BR" data-app="inventario"><body>{children}<Toaster /></body></html>;
}
