import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import React from "react";
import "./globals.css";

export const metadata = {
  title: "RugAlert - Solana Validator Commission Monitor",
  description:
    "Real-time monitoring of Solana validator commission changes to protect your stake",
  icons: {
    icon: [
      { url: "/rugalert-logo.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/rugalert-logo.png",
    apple: "/rugalert-logo.png",
  },
  openGraph: {
    title: "RugAlert - Solana Validator Commission Monitor",
    description: "Real-time monitoring of Solana validator commission changes",
    images: ["/rugalert-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <Analytics />
        <SpeedInsights />
        {/* Subtle dark background with orange glow */}
        <div className="fixed inset-0 -z-10 overflow-hidden bg-[#1a1a1a]">
          <div className="absolute top-20 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-40 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl"></div>
        </div>

        {/* Dark header with orange accent */}
        <header className="sticky top-0 z-50 w-full glass border-b border-white/10 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <img
                  src="/rugalert-logo.png"
                  alt="RugAlert Logo"
                  className="w-20 h-20 object-contain transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              <div>
                <span className="text-2xl font-bold gradient-text block">
                  RugAlert
                </span>
                <span className="text-xs text-gray-400">
                  Commission Guardian
                </span>
              </div>
            </a>
            <nav className="flex items-center gap-2">
              <a
                href="/"
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-orange-500/20 hover:text-orange-400 transition-all duration-300"
              >
                Dashboard
              </a>
              <a
                href="/history"
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-orange-500/20 hover:text-orange-400 transition-all duration-300"
              >
                History
              </a>
            </nav>
          </div>
        </header>

        {/* Page container with padding */}
        <main className="mx-auto max-w-7xl px-6 py-12">{children}</main>

        {/* Dark footer */}
        <footer className="mx-auto max-w-7xl px-6 py-12 mt-20">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="gradient-text font-semibold text-lg mb-2">
              RugAlert
            </div>
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} — Protecting the Solana ecosystem
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span>Built with ❤️ by Pumpkin's Pool</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
