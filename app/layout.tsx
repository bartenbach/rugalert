"use client";
import EpochProgress from "@/components/EpochProgress";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import React from "react";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname?.startsWith(path);
  };

  return (
    <html lang="en">
      <head>
        <title>RugAlert - Solana Validator Commission Monitor</title>
        <meta
          name="description"
          content="Real-time monitoring of Solana validator commission changes to protect your stake"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/rugalert-logo.png" />
      </head>
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
          <div className="mx-auto max-w-7xl px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2">
            <a
              href="/"
              className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
            >
              <div className="relative">
                <img
                  src="/rugalert-logo.png"
                  alt="RugAlert Logo"
                  className="w-12 h-12 sm:w-20 sm:h-20 object-contain"
                />
              </div>
              <div>
                <span className="text-lg sm:text-2xl font-bold gradient-text block">
                  RugAlert
                </span>
                <span className="text-xs text-gray-400 hidden sm:block">
                  Commission Guardian
                </span>
              </div>
            </a>

            {/* Epoch Progress - Inline in header */}
            <div className="hidden lg:block flex-1 max-w-md mx-8">
              <EpochProgress />
            </div>

            <nav className="flex items-center gap-1 sm:gap-2">
              <a
                href="/"
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
                  isActive("/") && pathname === "/"
                    ? "bg-orange-500/30 text-orange-400 border border-orange-500/50"
                    : "text-gray-300 hover:bg-orange-500/20 hover:text-orange-400"
                }`}
              >
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">🏠</span>
              </a>
              <a
                href="/validators"
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
                  isActive("/validators")
                    ? "bg-orange-500/30 text-orange-400 border border-orange-500/50"
                    : "text-gray-300 hover:bg-orange-500/20 hover:text-orange-400"
                }`}
              >
                <span className="hidden sm:inline">Validators</span>
                <span className="sm:hidden">📋</span>
              </a>
            </nav>
          </div>
        </header>

        {/* Page container with padding */}
        <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-12">
          {children}
        </main>

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
