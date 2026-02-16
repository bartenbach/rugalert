"use client";
import RugsPerEpochChart from "@/components/RugsPerEpochChart";
import { useEffect, useRef, useState } from "react";

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
  event_source?: "COMMISSION" | "MEV";
  from_disabled?: boolean;
  to_disabled?: boolean;
};

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

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Page() {
  const [epochs, setEpochs] = useState<number>(10);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [showRugs, setShowRugs] = useState(true);
  const [showCautions, setShowCautions] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sirenActive, setSirenActive] = useState(false);
  const [newRugDetected, setNewRugDetected] = useState<Row | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [eventsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const previousRugsRef = useRef<Set<string>>(new Set());
  const sirenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  async function load(isAutoRefresh = false) {
    if (!isAutoRefresh) setLoading(true);
    try {
      const showAllEvents = showInfo ? "&showAll=true" : "";
      const res = await fetch(
        `/api/events?epochs=${epochs}${showAllEvents}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      const newItems = json.items || [];

      if (isAutoRefresh && previousRugsRef.current.size > 0) {
        const currentRugs = newItems.filter((it: Row) => it.type === "RUG");
        const newRug = currentRugs.find((rug: Row) => {
          if (previousRugsRef.current.has(rug.id)) return false;
          if (!rug.created_at) return false;
          const rugTime = new Date(rug.created_at).getTime();
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          return rugTime >= fiveMinutesAgo;
        });
        if (newRug) triggerSirenAlert(newRug);
      }

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
    setNewRugDetected(rug);
    setSirenActive(true);
    if (sirenTimeoutRef.current) clearTimeout(sirenTimeoutRef.current);
    sirenTimeoutRef.current = setTimeout(() => dismissSiren(), 30000);
  }

  function dismissSiren() {
    setSirenActive(false);
    setNewRugDetected(null);
    if (sirenTimeoutRef.current) clearTimeout(sirenTimeoutRef.current);
  }

  useEffect(() => {
    load();
  }, [epochs, showInfo]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, epochs, showInfo]);

  const filtered = items.filter((it) => {
    if (it.type === "RUG" && !showRugs) return false;
    if (it.type === "CAUTION" && !showCautions) return false;
    if (it.type === "INFO" && !showInfo) return false;
    return true;
  });

  const rugCount = filtered.filter((it) => it.type === "RUG").length;
  const cautionCount = filtered.filter((it) => it.type === "CAUTION").length;
  const infoCount = filtered.filter((it) => it.type === "INFO").length;

  const totalPages = Math.ceil(filtered.length / eventsPerPage);
  const startIndex = (currentPage - 1) * eventsPerPage;
  const endIndex = startIndex + eventsPerPage;
  const paginatedItems = filtered.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [epochs, showInfo, showRugs, showCautions]);

  return (
    <div className="space-y-6">
      {/* Siren Alert Overlay */}
      {sirenActive && newRugDetected && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-pulse-slow"
          style={{ margin: 0, padding: 0 }}
        >
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
          <div className="relative z-10 max-w-2xl mx-4 bg-gradient-to-br from-red-950 to-red-900 border-4 border-red-500 rounded-3xl p-8 shadow-2xl shadow-red-500/50 animate-scale-in">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative text-8xl animate-bounce">
                    &#128680;
                  </div>
                </div>
              </div>
              <div>
                <h2 className="text-5xl font-black text-white mb-3 animate-pulse tracking-wider">
                  RUG DETECTED!
                </h2>
                <p className="text-2xl text-red-200 font-bold mb-6">
                  Validator Commission &rarr; 100%
                </p>
              </div>
              <div className="bg-black/50 rounded-2xl p-6 border-2 border-red-500/50">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {newRugDetected.icon_url ? (
                    <img
                      src={newRugDetected.icon_url}
                      alt="Validator"
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-xl border-2 border-red-400"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-red-500/20 flex items-center justify-center border-2 border-red-400">
                      <span className="text-3xl">&#128311;</span>
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

      {/* Rugs per Epoch Chart */}
      <RugsPerEpochChart />

      {/* Commission Events Section */}
      <div className="glass rounded-2xl border border-white/10 overflow-hidden">
        {/* Section Header */}
        <div className="p-4 sm:p-6 border-b border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Commission Events
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Real-time monitoring of validator commission changes
              </p>
            </div>

            {/* Live indicator + Export */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  autoRefresh
                    ? "text-green-400 bg-green-500/10 border-green-500/30"
                    : "text-gray-500 bg-white/5 border-white/10"
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    autoRefresh ? "bg-green-400 animate-pulse" : "bg-gray-500"
                  }`}
                ></div>
                {autoRefresh ? "Live" : "Paused"}
                {lastUpdate && (
                  <span className="text-gray-500 ml-1">
                    {lastUpdate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </button>
              <a
                href="/api/export"
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
              >
                Export CSV
              </a>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">Showing</span>
              <span className="text-white font-bold">{filtered.length}</span>
              <span className="text-gray-500">events from last</span>
              <input
                type="number"
                value={epochs}
                onChange={(e) =>
                  setEpochs(Math.max(1, Number(e.target.value || 1)))
                }
                className="w-14 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white text-center text-xs font-mono focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all"
              />
              <span className="text-gray-500">epochs</span>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={() => setShowRugs(!showRugs)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                showRugs
                  ? "bg-red-500/20 text-red-300 border border-red-500/40"
                  : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  showRugs ? "bg-red-400" : "bg-gray-600"
                }`}
              ></span>
              Rug
              {showRugs && (
                <span className="ml-1 text-red-400/80">{rugCount}</span>
              )}
            </button>
            <button
              onClick={() => setShowCautions(!showCautions)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                showCautions
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  showCautions ? "bg-amber-400" : "bg-gray-600"
                }`}
              ></span>
              Caution
              {showCautions && (
                <span className="ml-1 text-amber-400/80">{cautionCount}</span>
              )}
            </button>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                showInfo
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  showInfo ? "bg-blue-400" : "bg-gray-600"
                }`}
              ></span>
              Info
              {showInfo && (
                <span className="ml-1 text-blue-400/80">{infoCount}</span>
              )}
            </button>

            <div className="hidden sm:block w-px h-5 bg-white/10 mx-1"></div>
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="text-red-400">Rug</span> = &ge;90%
              <span className="mx-1 text-gray-700">|</span>
              <span className="text-amber-400">Caution</span> = &ge;10pp
              increase
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="px-4 sm:px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Validator
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-24">
                  Severity
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-36">
                  Commission
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-20">
                  Delta
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">
                  Detected
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400 text-sm">
                        Loading events...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <p className="text-gray-400">
                      {items.length === 0
                        ? "No suspicious events detected. All validators are behaving."
                        : "No events match your current filters."}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((it) => (
                  <tr
                    key={it.id}
                    className={`border-b border-white/[0.04] transition-colors duration-150 group ${
                      it.delinquent
                        ? "bg-red-500/[0.06] hover:bg-red-500/[0.1] border-l-2 border-l-red-500"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* Validator */}
                    <td className="px-4 sm:px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <a
                          href={`/validator/${it.vote_pubkey}`}
                          className="flex-shrink-0"
                        >
                          {it.icon_url ? (
                            <img
                              src={it.icon_url}
                              alt=""
                              width={36}
                              height={36}
                              className="w-9 h-9 rounded-lg object-cover border border-white/10 group-hover:border-cyan-500/40 transition-colors"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/30 border border-white/10 flex items-center justify-center ${
                              it.icon_url ? "hidden" : ""
                            }`}
                          >
                            <span className="text-sm">&#128311;</span>
                          </div>
                        </a>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <a
                              href={`/validator/${it.vote_pubkey}`}
                              className="font-semibold text-sm text-white hover:text-cyan-400 transition-colors truncate"
                            >
                              {it.name || it.vote_pubkey}
                            </a>
                            {it.delinquent && (
                              <span className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 rounded text-[10px] font-bold text-red-400 shrink-0">
                                DELINQUENT
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-600 font-mono truncate mt-0.5">
                            {it.vote_pubkey}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Severity */}
                    <td className="px-4 sm:px-6 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${
                          it.type === "RUG"
                            ? "bg-red-500/15 text-red-300 border border-red-500/30"
                            : it.type === "CAUTION"
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            : "bg-white/5 text-gray-400 border border-white/10"
                        }`}
                      >
                        {it.type}
                      </span>
                    </td>

                    {/* Commission */}
                    <td className="px-4 sm:px-6 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-400">
                          {it.event_source === "MEV" && it.from_disabled
                            ? "Off"
                            : `${it.from_commission}%`}
                        </span>
                        <span className="text-gray-600">&rarr;</span>
                        <span className="text-white font-semibold">
                          {it.event_source === "MEV" && it.to_disabled
                            ? "Off"
                            : `${it.to_commission}%`}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold ${
                          it.event_source === "MEV"
                            ? "text-purple-400"
                            : "text-gray-500"
                        }`}
                      >
                        {it.event_source === "MEV" ? "MEV" : "Inflation"}
                      </span>
                    </td>

                    {/* Delta */}
                    <td className="px-4 sm:px-6 py-3.5">
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          it.type === "RUG"
                            ? "text-red-400"
                            : it.type === "CAUTION"
                            ? "text-amber-400"
                            : it.delta > 0
                            ? "text-cyan-400"
                            : it.delta < 0
                            ? "text-green-400"
                            : "text-gray-400"
                        }`}
                      >
                        {it.delta > 0 ? "+" : ""}
                        {it.delta}%
                      </span>
                    </td>

                    {/* Detected */}
                    <td className="px-4 sm:px-6 py-3.5">
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
                          )} \u2022 Epoch ${it.epoch}`}
                        >
                          <div className="text-sm text-white">
                            {getRelativeTime(it.created_at)}
                          </div>
                          <div className="text-[10px] text-gray-600 font-mono">
                            Epoch {it.epoch}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 font-mono">
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-white/[0.06]">
            <span className="text-xs text-gray-500">
              {startIndex + 1}&ndash;{Math.min(endIndex, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                )
                .map((page, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;
                  return (
                    <div key={page} className="flex items-center gap-1.5">
                      {showEllipsis && (
                        <span className="text-gray-600 px-1 text-xs">
                          ...
                        </span>
                      )}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-md text-xs font-medium border transition-all ${
                          currentPage === page
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                            : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
