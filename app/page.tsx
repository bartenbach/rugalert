"use client";
import RugsPerEpochChart from "@/components/RugsPerEpochChart";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Row = {
  id: string;
  vote_pubkey: string;
  name?: string | null;
  icon_url?: string | null;
  type: "RUG" | "CAUTION" | "INFO";
  from_commission: number;
  to_commission: number;
  delta: number;
  epoch: number;
  created_at?: string;
  delinquent?: boolean;
};

// Utility function to format relative time
function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older dates, show the date
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type ValidatorSearchResult = {
  votePubkey: string;
  name: string;
  iconUrl?: string;
  identityPubkey: string;
};

export default function Page() {
  const [epochs, setEpochs] = useState<number>(10);
  const [items, setItems] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [emailPreference, setEmailPreference] = useState<
    "rugs_only" | "rugs_and_cautions" | "all"
  >("rugs_only");

  // Event type filters (default: show RUGs + Cautions only)
  const [showRugs, setShowRugs] = useState(true);
  const [showCautions, setShowCautions] = useState(true);
  const [showInfo, setShowInfo] = useState(false); // Hidden by default

  // Real-time monitoring state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sirenActive, setSirenActive] = useState(false);
  const [newRugDetected, setNewRugDetected] = useState<Row | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Validator search state (integrated with main search)
  const [searchResults, setSearchResults] = useState<ValidatorSearchResult[]>(
    []
  );
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [eventsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const previousRugsRef = useRef<Set<string>>(new Set());
  const sirenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  async function load(isAutoRefresh = false) {
    if (!isAutoRefresh) setLoading(true);
    try {
      // If INFO filter is enabled, request all events (not just most severe per validator)
      const showAllEvents = showInfo ? "&showAll=true" : "";
      const res = await fetch(`/api/events?epochs=${epochs}${showAllEvents}`);
      const json = await res.json();
      const newItems = json.items || [];

      // Detect new RUG events for visual alert
      if (isAutoRefresh && previousRugsRef.current.size > 0) {
        const currentRugs = newItems.filter((it: Row) => it.type === "RUG");
        const newRug = currentRugs.find(
          (rug: Row) => !previousRugsRef.current.has(rug.id)
        );

        if (newRug) {
          triggerSirenAlert(newRug);
        }
      }

      // Update previous rugs set
      previousRugsRef.current = new Set(
        newItems.filter((it: Row) => it.type === "RUG").map((it: Row) => it.id)
      );

      setItems(newItems);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to load events:", error);
    } finally {
      setLoading(false);
    }
  }

  function triggerSirenAlert(rug: Row) {
    console.log("🚨 Triggering visual alert for:", rug.name || rug.vote_pubkey);
    setNewRugDetected(rug);
    setSirenActive(true);

    // Auto-dismiss after 30 seconds
    if (sirenTimeoutRef.current) {
      clearTimeout(sirenTimeoutRef.current);
    }
    sirenTimeoutRef.current = setTimeout(() => {
      dismissSiren();
    }, 30000);
  }

  function dismissSiren() {
    console.log("❌ Dismissing alert");
    setSirenActive(false);
    setNewRugDetected(null);

    // Clear auto-dismiss timer
    if (sirenTimeoutRef.current) {
      clearTimeout(sirenTimeoutRef.current);
    }
  }

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email || subscribing) return;
    setSubscribing(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, preferences: emailPreference }),
      });
      if (res.ok) {
        setSubscribed(true);
        setEmail("");
        setTimeout(() => setSubscribed(false), 5000);
      }
    } catch (error) {
      console.error("Subscription failed:", error);
    } finally {
      setSubscribing(false);
    }
  }

  // Validator search with debounce (using existing "q" search)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (q.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search-validators?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setSearchResults(data.results || []);
        // Only show dropdown if we have results
        if (data.results && data.results.length > 0) {
          // Small delay to ensure input is positioned
          setTimeout(() => {
            updateDropdownPosition();
            setShowSearchResults(true);
          }, 0);
        }
      } catch (error) {
        console.error("Search failed:", error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [q]);

  // Initial load and reload when filters change
  useEffect(() => {
    load();
  }, [epochs, showInfo]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      load(true);
    }, 30000); // Poll every 30 seconds (reasonable for backend cron every 15 min)

    return () => clearInterval(interval);
  }, [autoRefresh, epochs, showInfo]);

  // Mount detection for portal
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate dropdown position
  const updateDropdownPosition = () => {
    if (searchInputRef.current) {
      const rect = searchInputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  // Update position when showing results or on scroll/resize
  useEffect(() => {
    if (showSearchResults && searchResults.length > 0) {
      updateDropdownPosition();
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [showSearchResults, searchResults.length]);

  const filtered = items.filter((it) => {
    // Filter by event type only (removed search query filtering)
    if (it.type === "RUG" && !showRugs) return false;
    if (it.type === "CAUTION" && !showCautions) return false;
    if (it.type === "INFO" && !showInfo) return false;

    return true;
  });

  const rugCount = filtered.filter((it) => it.type === "RUG").length;
  const cautionCount = filtered.filter((it) => it.type === "CAUTION").length;

  // Pagination
  const totalPages = Math.ceil(filtered.length / eventsPerPage);
  const startIndex = (currentPage - 1) * eventsPerPage;
  const endIndex = startIndex + eventsPerPage;
  const paginatedItems = filtered.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [epochs, showInfo, showRugs, showCautions]);

  return (
    <div className="space-y-8">
      {/* Siren Alert Overlay */}
      {sirenActive && newRugDetected && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-pulse-slow"
          style={{ margin: 0, padding: 0 }}
        >
          {/* Flashing red siren lights */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-red-600/30 animate-flash"></div>
            <div className="absolute top-10 left-10 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-left"></div>
            <div className="absolute top-10 right-10 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-right"></div>
            <div
              className="absolute bottom-10 left-1/4 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-left"
              style={{ animationDelay: "0.5s" }}
            ></div>
            <div
              className="absolute bottom-10 right-1/4 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-right"
              style={{ animationDelay: "0.5s" }}
            ></div>
          </div>

          {/* Alert Content */}
          <div className="relative z-10 max-w-2xl mx-4 bg-gradient-to-br from-red-950 to-red-900 border-4 border-red-500 rounded-3xl p-8 shadow-2xl shadow-red-500/50 animate-scale-in">
            <div className="text-center space-y-6">
              {/* Siren Icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative text-8xl animate-bounce">🚨</div>
                </div>
              </div>

              {/* Alert Text */}
              <div>
                <h2 className="text-5xl font-black text-white mb-3 animate-pulse tracking-wider">
                  RUG DETECTED!
                </h2>
                <p className="text-2xl text-red-200 font-bold mb-6">
                  Validator Commission → 100%
                </p>
              </div>

              {/* Validator Info */}
              <div className="bg-black/50 rounded-2xl p-6 border-2 border-red-500/50">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {newRugDetected.icon_url ? (
                    <img
                      src={newRugDetected.icon_url}
                      alt="Validator"
                      className="w-16 h-16 rounded-xl border-2 border-red-400"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-red-500/20 flex items-center justify-center border-2 border-red-400">
                      <span className="text-3xl">🔷</span>
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-xl font-bold text-white">
                      {newRugDetected.name || "Unknown Validator"}
                    </p>
                    <p className="text-sm text-gray-400 font-mono break-all">
                      {newRugDetected.vote_pubkey.slice(0, 20)}...
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-red-950/50 rounded-lg p-3 border border-red-500/30">
                    <p className="text-gray-400 mb-1">Previous</p>
                    <p className="text-2xl font-bold text-white">
                      {newRugDetected.from_commission}%
                    </p>
                  </div>
                  <div className="bg-red-950/50 rounded-lg p-3 border border-red-500/30">
                    <p className="text-gray-400 mb-1">Current</p>
                    <p className="text-2xl font-bold text-red-400">
                      {newRugDetected.to_commission}%
                    </p>
                  </div>
                </div>

                <div className="mt-4 text-sm text-gray-400">
                  Epoch: {newRugDetected.epoch}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center pt-4">
                <a
                  href={`/validator/${newRugDetected.vote_pubkey}`}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
                >
                  View Details
                </a>
                <button
                  onClick={dismissSiren}
                  className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="text-center space-y-4 mb-8">
        <div className="inline-block">
          <h1 className="text-5xl md:text-6xl font-bold gradient-text mb-4">
            Validator Commission Tracker
          </h1>
          <div className="h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 rounded-full"></div>
        </div>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Real-time tracking of ALL Solana validator commission changes. Get
          instant alerts for rugs and suspicious increases.
        </p>
      </div>

      {/* Global Validator Search */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) {
                updateDropdownPosition();
                setShowSearchResults(true);
              }
            }}
            placeholder="Search validators by name or pubkey..."
            className="w-full px-4 py-3 pl-11 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 focus:bg-white/10 transition-all shadow-lg shadow-black/20 focus:shadow-orange-500/20"
          />
          {searching ? (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}

          {/* Validator Search Results Dropdown - Rendered via Portal */}
          {isMounted &&
            showSearchResults &&
            searchResults.length > 0 &&
            dropdownPosition &&
            createPortal(
              <>
                <div
                  className="fixed inset-0"
                  style={{ zIndex: 999998 }}
                  onClick={() => setShowSearchResults(false)}
                />
                <div
                  className="fixed rounded-xl border-2 border-orange-500 overflow-hidden max-h-96 overflow-y-auto shadow-2xl"
                  style={{
                    zIndex: 999999,
                    backgroundColor: "#0a0a0a",
                    top: `${dropdownPosition.top}px`,
                    left: `${dropdownPosition.left}px`,
                    width: `${dropdownPosition.width}px`,
                  }}
                >
                  <div className="p-3 border-b border-orange-500/50 bg-gradient-to-r from-orange-500/30 to-orange-600/30">
                    <span className="text-sm text-orange-300 font-bold px-2">
                      🔍 Validators matching "{q}"
                    </span>
                  </div>
                  {searchResults.map((result) => (
                    <a
                      key={result.votePubkey}
                      href={`/validator/${result.votePubkey}`}
                      className="flex items-center gap-3 p-4 hover:bg-orange-500/30 transition-all border-b border-white/10 last:border-0 group"
                      style={{ backgroundColor: "#1a1a1a" }}
                      onClick={() => {
                        setShowSearchResults(false);
                        setQ("");
                      }}
                    >
                      {result.iconUrl ? (
                        <img
                          src={result.iconUrl}
                          alt={result.name}
                          className="w-10 h-10 rounded-lg border-2 border-white/20 group-hover:border-orange-500/70 transition-colors flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-orange-500/30 flex items-center justify-center border-2 border-white/20 group-hover:border-orange-500/70 transition-colors flex-shrink-0">
                          <span className="text-lg">🔷</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-base font-bold truncate group-hover:text-orange-300 transition-colors">
                          {result.name}
                        </div>
                        <div className="text-xs text-gray-300 font-mono truncate bg-black/30 px-2 py-0.5 rounded mt-1 inline-block">
                          {result.votePubkey}
                        </div>
                      </div>
                      <span className="text-gray-400 group-hover:text-orange-400 transition-colors text-xl flex-shrink-0">
                        →
                      </span>
                    </a>
                  ))}
                </div>
              </>,
              document.body
            )}
        </div>
      </div>

      {/* Commission Events Table Section */}
      <div className="glass rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Table Header with Stats and Controls */}
        <div className="space-y-4">
          {/* Title and Stats Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>📊</span>
              Commission Events
            </h2>
            <div className="flex gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
              <div className="text-center px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-white/5 border border-white/10 flex-1 sm:flex-none">
                <div className="text-[10px] sm:text-xs text-gray-400">
                  Total
                </div>
                <div className="text-base sm:text-lg font-bold text-white">
                  {filtered.length}
                </div>
              </div>
              <div className="text-center px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex-1 sm:flex-none">
                <div className="text-[10px] sm:text-xs text-gray-400">Rugs</div>
                <div className="text-base sm:text-lg font-bold text-red-400">
                  {rugCount}
                </div>
              </div>
              <div className="text-center px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex-1 sm:flex-none">
                <div className="text-[10px] sm:text-xs text-gray-400">
                  Cautions
                </div>
                <div className="text-base sm:text-lg font-bold text-yellow-400">
                  {cautionCount}
                </div>
              </div>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400 whitespace-nowrap">
                  Lookback:
                </label>
                <input
                  type="number"
                  value={epochs}
                  onChange={(e) =>
                    setEpochs(Math.max(1, Number(e.target.value || 1)))
                  }
                  className="input-modern w-20 bg-white/5 text-white text-center"
                />
                <span className="text-sm text-gray-500">epochs</span>
              </div>
            </div>

            {/* Right Side: Auto-refresh and Export */}
            <div className="flex items-center gap-2">
              {/* Real-time Status (clickable to toggle) */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all hover:scale-105 ${
                  autoRefresh
                    ? "text-gray-400 bg-white/5 border-white/10 hover:bg-white/10"
                    : "text-gray-500 bg-white/5 border-white/10 hover:bg-white/10"
                }`}
                title={
                  autoRefresh
                    ? "Click to pause auto-refresh"
                    : "Click to enable auto-refresh"
                }
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    autoRefresh ? "bg-green-500 animate-pulse" : "bg-gray-500"
                  }`}
                ></div>
                <span className="whitespace-nowrap">
                  {autoRefresh ? "Auto-refresh" : "Paused"}
                </span>
                {lastUpdate && (
                  <span className="text-gray-500 border-l border-white/10 pl-2 ml-1">
                    {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </button>
              <a href="/api/export" className="btn-secondary whitespace-nowrap">
                📥 Export CSV
              </a>
            </div>
          </div>

          {/* Event Type Filters */}
          <div className="flex flex-wrap items-center gap-3 pt-4 mt-4 border-t border-white/10">
            <span className="text-sm text-gray-400 font-medium">Show:</span>
            <button
              onClick={() => setShowRugs(!showRugs)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showRugs
                  ? "bg-red-500/30 text-red-300 border-2 border-red-500"
                  : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
              }`}
            >
              🚨 RUG
            </button>
            <button
              onClick={() => setShowCautions(!showCautions)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showCautions
                  ? "bg-yellow-500/30 text-yellow-300 border-2 border-yellow-500"
                  : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
              }`}
            >
              ⚠️ Caution
            </button>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showInfo
                  ? "bg-blue-500/30 text-blue-300 border-2 border-blue-500"
                  : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
              }`}
            >
              📊 Info
            </button>

            {/* Quick Presets */}
            <div className="hidden sm:block w-px h-6 bg-white/10"></div>
            <button
              onClick={() => {
                setShowRugs(true);
                setShowCautions(false);
                setShowInfo(false);
              }}
              className="hidden sm:inline-flex px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all"
            >
              Only RUG
            </button>
            <button
              onClick={() => {
                setShowRugs(true);
                setShowCautions(true);
                setShowInfo(false);
              }}
              className="hidden sm:inline-flex px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all"
            >
              RUG + Caution
            </button>
            <button
              onClick={() => {
                setShowRugs(true);
                setShowCautions(true);
                setShowInfo(true);
              }}
              className="hidden sm:inline-flex px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all"
            >
              Show All
            </button>

            {/* Compact Legend */}
            <div className="hidden sm:block w-px h-6 bg-white/10"></div>
            <div className="hidden lg:flex items-center gap-4 text-xs text-gray-500">
              <span>Legend:</span>
              <span className="flex items-center gap-1">
                <span className="rug-badge text-[10px] px-2 py-0.5">🚨</span>{" "}
                ≥90%
              </span>
              <span className="flex items-center gap-1">
                <span className="caution-badge text-[10px] px-2 py-0.5">
                  ⚠️
                </span>{" "}
                ≥10%
              </span>
              <span className="flex items-center gap-1">
                <span className="text-xs">📊</span> Minor changes
              </span>
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                  Validator
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-32">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-40">
                  Commission
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-24">
                  Change
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-32">
                  <div className="flex items-center gap-1.5">
                    Detected
                    <span className="text-xs text-gray-500">↓</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400">Loading events...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="space-y-2">
                      <div className="text-4xl">
                        {items.length === 0 ? "🎉" : "🔍"}
                      </div>
                      <p className="text-gray-400">
                        {items.length === 0
                          ? "No suspicious events detected"
                          : "No events match your filters"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {items.length === 0
                          ? "All validators are currently behaving ethically!"
                          : "Try adjusting your search or filter settings"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((it) => (
                  <tr
                    key={it.id}
                    className={`transition-colors duration-200 group ${
                      it.delinquent
                        ? "bg-red-500/10 hover:bg-red-500/20 border-l-4 border-red-500"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <a
                          href={`/validator/${it.vote_pubkey}`}
                          className="flex-shrink-0"
                        >
                          {it.icon_url ? (
                            <img
                              src={it.icon_url}
                              alt=""
                              className="w-10 h-10 rounded-xl object-cover border border-white/10 hover:border-orange-400 transition-colors"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/30 border border-white/10 hover:border-orange-400 flex items-center justify-center transition-colors ${
                              it.icon_url ? "hidden" : ""
                            }`}
                          >
                            <span className="text-lg">🔷</span>
                          </div>
                        </a>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <a
                              href={`/validator/${it.vote_pubkey}`}
                              className="font-semibold text-white hover:text-orange-400 transition-colors"
                            >
                              {it.name || it.vote_pubkey}
                            </a>
                            {it.delinquent && (
                              <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs font-bold text-red-400 whitespace-nowrap">
                                DELINQUENT
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(it.vote_pubkey);
                              e.currentTarget
                                .querySelector(".copy-icon")
                                ?.classList.add("text-green-400");
                              setTimeout(() => {
                                e.currentTarget
                                  .querySelector(".copy-icon")
                                  ?.classList.remove("text-green-400");
                              }, 1000);
                            }}
                            className="text-xs text-gray-500 font-mono hover:text-orange-400 transition-colors cursor-pointer text-left flex items-center gap-1.5 group/copy"
                            title="Click to copy"
                          >
                            <span className="break-all">{it.vote_pubkey}</span>
                            <span className="copy-icon text-gray-600 group-hover/copy:text-orange-400 transition-colors flex-shrink-0">
                              📋
                            </span>
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          it.type === "RUG"
                            ? "rug-badge"
                            : it.type === "CAUTION"
                            ? "caution-badge"
                            : "inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 border border-white/10"
                        }
                      >
                        {it.type === "RUG"
                          ? "🚨 RUG"
                          : it.type === "CAUTION"
                          ? "⚠️ CAUTION"
                          : "📊 INFO"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">
                          {it.from_commission}%
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-white font-semibold">
                          {it.to_commission}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`font-semibold ${
                          it.type === "RUG"
                            ? "text-red-400"
                            : it.type === "CAUTION"
                            ? "text-yellow-400"
                            : it.delta > 0
                            ? "text-orange-400"
                            : it.delta < 0
                            ? "text-green-400"
                            : "text-gray-400"
                        }`}
                      >
                        {it.delta > 0 ? "+" : ""}
                        {it.delta}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {it.created_at ? (
                        <div
                          className="cursor-help"
                          title={`${new Date(it.created_at).toLocaleString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            }
                          )} • Epoch ${it.epoch}`}
                        >
                          <div className="text-white font-medium">
                            {getRelativeTime(it.created_at)}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            Epoch {it.epoch}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-mono">
                          Epoch {it.epoch}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first page, last page, current page, and pages around current
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  );
                })
                .map((page, idx, arr) => {
                  // Add ellipsis if there's a gap
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  return (
                    <div key={page} className="flex items-center gap-2">
                      {showEllipsis && (
                        <span className="text-gray-500 px-2">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-lg border transition-all ${
                          currentPage === page
                            ? "bg-orange-500 text-white border-orange-500 font-bold"
                            : "bg-white/5 text-white border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next →
            </button>
          </div>
        )}

        {/* Showing X of Y events */}
        <div className="text-center text-sm text-gray-400 mt-4 pb-2">
          Showing {startIndex + 1}-{Math.min(endIndex, filtered.length)} of{" "}
          {filtered.length} events
        </div>
      </div>

      {/* Rugs per Epoch Chart */}
      <div className="mt-8">
        <RugsPerEpochChart />
      </div>

      {/* Email Subscription */}
      <div className="glass rounded-2xl p-4 sm:p-8 max-w-2xl mx-auto border-2 border-orange-500/20 mt-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-3xl">🔔</span>
            <h2 className="text-2xl font-bold text-white">
              Get Commission Alerts
            </h2>
          </div>
          <p className="text-gray-400 text-sm">
            Subscribe to receive instant email notifications when validators
            change their commission
          </p>
          <form
            onSubmit={handleSubscribe}
            className="flex flex-col gap-4 max-w-lg mx-auto mt-6"
          >
            {/* Email Preference Selector */}
            <div className="flex flex-col gap-2 items-center">
              <label className="text-sm text-gray-400 text-center">
                Email me for:
              </label>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setEmailPreference("rugs_only")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    emailPreference === "rugs_only"
                      ? "bg-red-500/30 text-red-300 border-2 border-red-500"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  🚨 Rugs
                </button>
                <button
                  type="button"
                  onClick={() => setEmailPreference("rugs_and_cautions")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    emailPreference === "rugs_and_cautions"
                      ? "bg-yellow-500/30 text-yellow-300 border-2 border-yellow-500"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  ⚠️ Increase ≥ 10%
                </button>
                <button
                  type="button"
                  onClick={() => setEmailPreference("all")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    emailPreference === "all"
                      ? "bg-blue-500/30 text-blue-300 border-2 border-blue-500"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  📊 All Changes
                </button>
              </div>
            </div>

            {/* Email Input and Submit */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="input-modern flex-1 bg-white/5 text-white text-center sm:text-left"
                disabled={subscribing || subscribed}
              />
              <button
                type="submit"
                disabled={subscribing || subscribed}
                className="btn-primary px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {subscribing
                  ? "Subscribing..."
                  : subscribed
                  ? "✓ Subscribed!"
                  : "Subscribe"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
