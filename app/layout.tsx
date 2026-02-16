"use client";
import EpochProgress from "@/components/EpochProgress";
import SnowAnimation from "@/components/SnowAnimation";
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
      <body
        className="antialiased min-h-screen relative"
        style={{ isolation: "isolate" }}
      >
        <Analytics />
        <SpeedInsights />
        {/* Dark background */}
        <div className="fixed inset-0 -z-20 overflow-hidden bg-[#1F1A1B]"></div>

        {/* Subtle snow animation - separate container behind everything */}
        <div
          className="fixed inset-0 pointer-events-none overflow-hidden"
          style={{ zIndex: -19 }}
        >
          <SnowAnimation />
        </div>

        {/* Dark header with Orb-style minimal design */}
        <header className="sticky top-0 z-50 w-full bg-[#1F1A1B]/95 backdrop-blur-xl border-b border-[#403A3B]">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2">
            <a
              href="/"
              className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
            >
              <div className="relative">
                <img
                  src="/rugalert-logo.png"
                  alt="RugAlert Logo"
                  width={80}
                  height={80}
                  className="relative w-12 h-12 sm:w-20 sm:h-20 object-contain"
                  style={{
                    filter: "hue-rotate(150deg) saturate(1.3) brightness(1.15)",
                  }}
                />
              </div>
              <div>
                <span className="text-lg sm:text-2xl font-bold text-[#EAEAEA] block uppercase tracking-tight">
                  RugAlert
                </span>
                <span className="text-xs text-[#B0B0B0] hidden sm:block uppercase tracking-wider">
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
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 uppercase tracking-wider ${
                  isActive("/") && pathname === "/"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "text-[#B0B0B0] hover:bg-[#2A2526] hover:text-cyan-400"
                }`}
              >
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">Home</span>
              </a>
              <a
                href="/validators"
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 uppercase tracking-wider ${
                  isActive("/validators")
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "text-[#B0B0B0] hover:bg-[#2A2526] hover:text-cyan-400"
                }`}
              >
                <span className="hidden sm:inline">Validators</span>
                <span className="sm:hidden">List</span>
              </a>
              <a
                href="/stake-concentration"
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 uppercase tracking-wider ${
                  isActive("/stake-concentration")
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "text-[#B0B0B0] hover:bg-[#2A2526] hover:text-cyan-400"
                }`}
              >
                <span className="hidden sm:inline">Stake Map</span>
                <span className="sm:hidden">Map</span>
              </a>
            </nav>
          </div>
        </header>

        {/* Page container with padding */}
        <main
          className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-12 relative"
          style={{ zIndex: 10, isolation: "isolate" }}
        >
          {children}
        </main>

        {/* Orb-style minimal footer */}
        <footer className="mx-auto max-w-7xl px-6 py-12 mt-20">
          <div className="border-t border-[#403A3B] pt-8 text-center">
            <div className="text-[#EAEAEA] font-semibold text-lg mb-2 uppercase tracking-tight">
              RugAlert
            </div>
            <p className="text-[#B0B0B0] text-sm">
              © {new Date().getFullYear()} — Protecting the Solana ecosystem
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-[#B0B0B0]">
              <span>Built with ❤️ by Pumpkin's Pool</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
