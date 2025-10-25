"use client";
import CommissionChart from "@/components/CommissionChart";
import StakeChart from "@/components/StakeChart";
import UptimeChart from "@/components/UptimeChart";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Event = {
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

type ValidatorInfo = {
  validator: {
    votePubkey: string;
    identityPubkey: string;
    name?: string;
    iconUrl?: string;
    website?: string;
    version?: string;
    delinquent?: boolean;
    jitoEnabled?: boolean;
    firstSeenEpoch?: number;
    stakeAccountCount?: number;
  };
  performance: {
    skipRate: number;
    leaderSlots: number;
    blocksProduced: number;
    voteCredits: number;
    voteCreditsPercentage: number;
    maxPossibleCredits: number;
    epoch: number;
  } | null;
  stake: {
    activeStake: number;
    activatingStake: number;
    deactivatingStake: number;
    activatingAccounts: Array<{
      staker: string;
      amount: number;
      label: string | null;
      epoch: number;
    }>;
    deactivatingAccounts: Array<{
      staker: string;
      amount: number;
      label: string | null;
      epoch: number;
    }>;
    stakeDistribution: Array<{
      staker: string;
      amount: number;
      label: string | null;
    }>;
    epoch: number;
  } | null;
  mev: {
    mevCommission: number;
    priorityFeeCommission: number;
    epoch: number;
  } | null;
  currentEpoch: number;
};

type StakeHistory = {
  epoch: number;
  activeStake: number;
  activatingStake?: number;
  deactivatingStake?: number;
};

type InfoHistory = {
  identityPubkey: string;
  name: string | null;
  description: string | null;
  website: string | null;
  iconUrl: string | null;
  changedAt: string;
  epoch: number;
};

// Circular Progress Gauge Component with dynamic coloring and animations
function CircularGauge({
  value,
  max = 100,
  label,
  sublabel,
  size = 120,
  thresholds,
}: {
  value: number;
  max?: number;
  label: string;
  sublabel?: React.ReactNode;
  size?: number;
  thresholds?: { good: number; warning: number }; // e.g., { good: 90, warning: 75 }
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  // Determine color based on value and thresholds
  let color: "green" | "yellow" | "orange" | "red" | "purple" = "purple";
  if (thresholds) {
    if (value >= thresholds.good) {
      color = "green";
    } else if (value >= thresholds.warning) {
      color = "yellow";
    } else {
      color = "red";
    }
  }

  const colorClasses = {
    green: {
      stroke: "stroke-green-500",
      text: "text-green-400",
      glow: "drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]",
      bg: "bg-green-500/5",
    },
    yellow: {
      stroke: "stroke-yellow-500",
      text: "text-yellow-400",
      glow: "drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]",
      bg: "bg-yellow-500/5",
    },
    orange: {
      stroke: "stroke-orange-500",
      text: "text-orange-400",
      glow: "drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]",
      bg: "bg-orange-500/5",
    },
    red: {
      stroke: "stroke-red-500",
      text: "text-red-400",
      glow: "drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]",
      bg: "bg-red-500/5",
    },
    purple: {
      stroke: "stroke-purple-500",
      text: "text-purple-400",
      glow: "drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]",
      bg: "bg-purple-500/5",
    },
  };

  const colors = colorClasses[color];

  return (
    <div className="flex flex-col items-center gap-2 group">
      {/* Title above the gauge */}
      <div className="text-xs text-gray-400 text-center font-medium transition-colors group-hover:text-gray-300">
        {label}
      </div>

      {/* Gauge circle with animations */}
      <div
        className="relative transition-transform group-hover:scale-105"
        style={{ width: size, height: size }}
      >
        {/* Background glow */}
        <div
          className={`absolute inset-0 rounded-full ${colors.bg} blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
        ></div>

        <svg
          className={`transform -rotate-90 ${colors.glow} transition-all duration-300`}
          width={size}
          height={size}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          {/* Animated progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className={`${colors.stroke} transition-all duration-700 ease-out`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              animation: "dash 1.5s ease-in-out",
            }}
          />
        </svg>

        {/* Center content with fade-in animation */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`text-2xl font-bold ${colors.text} transition-all duration-300`}
            style={{ animation: "fadeIn 0.5s ease-out 0.3s both" }}
          >
            {value.toFixed(1)}
            {max === 100 && "%"}
          </div>
        </div>
      </div>

      {/* Supporting data below with fade-in */}
      {sublabel && (
        <div
          className="text-xs text-gray-500 text-center transition-colors group-hover:text-gray-400"
          style={{ animation: "fadeIn 0.5s ease-out 0.5s both" }}
        >
          {sublabel}
        </div>
      )}

      <style jsx>{`
        @keyframes dash {
          from {
            stroke-dashoffset: ${circumference};
          }
          to {
            stroke-dashoffset: ${offset};
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// Stake Breakdown Component - shows individual stake accounts
function StakeBreakdown({
  accounts,
  type,
}: {
  accounts: Array<{
    staker: string;
    amount: number;
    label: string | null;
    epoch: number;
  }>;
  type: "activating" | "deactivating";
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!accounts || accounts.length === 0) return null;

  // Sort by amount descending
  const sortedAccounts = [...accounts].sort((a, b) => b.amount - a.amount);
  const LAMPORTS_PER_SOL = 1_000_000_000;

  return (
    <div className="text-xs">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-gray-400 hover:text-gray-300 transition-colors"
      >
        <span>{isExpanded ? "▼" : "▶"}</span>
        <span>
          {accounts.length} account{accounts.length !== 1 ? "s" : ""}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-1 pl-4 border-l-2 border-gray-700">
          {sortedAccounts.map((account, idx) => {
            const solAmount = account.amount / LAMPORTS_PER_SOL;
            const displayName =
              account.label ||
              `${account.staker.slice(0, 8)}...${account.staker.slice(-6)}`;

            return (
              <div
                key={idx}
                className="flex items-start justify-between gap-2 text-gray-400"
              >
                <a
                  href={`https://solscan.io/account/${account.staker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate hover:text-orange-400 transition-colors"
                  title={account.staker}
                >
                  {displayName}
                </a>
                <span className="text-gray-300 font-mono">
                  ◎{" "}
                  {solAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper to convert URLs in text to clickable links
function LinkifyText({ text }: { text: string }) {
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, index) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 hover:underline"
            >
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export default function Detail({ params }: { params: { votePubkey: string } }) {
  const [series, setSeries] = useState<{ epoch: number; commission: number }[]>(
    []
  );
  const [stakeHistory, setStakeHistory] = useState<StakeHistory[]>([]);
  const [infoHistory, setInfoHistory] = useState<InfoHistory[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [validatorInfo, setValidatorInfo] = useState<ValidatorInfo | null>(
    null
  );
  const [uptimePercentage, setUptimePercentage] = useState<number | null>(null);
  const [uptimeDaysTracked, setUptimeDaysTracked] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [copiedIdentity, setCopiedIdentity] = useState(false);
  const [copiedVote, setCopiedVote] = useState(false);
  const [showStakeDistribution, setShowStakeDistribution] = useState(false);
  const [stakeDistributionPosition, setStakeDistributionPosition] = useState({
    top: 0,
    left: 0,
  });
  const stakeDistributionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ValidatorSearchResult[]>(
    []
  );
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const s = await fetch(`/api/series/${params.votePubkey}`);
      const sj = await s.json();
      setSeries(sj.series || []);
      const m = await fetch(`/api/meta/${params.votePubkey}`);
      const mj = await m.json();
      setMeta(mj.meta || null);
      const e = await fetch(`/api/validator-events/${params.votePubkey}`);
      const ej = await e.json();
      setEvents(ej.items || []);
      const i = await fetch(`/api/validator-info/${params.votePubkey}`);
      const ij = await i.json();
      setValidatorInfo(ij.error ? null : ij);
      const sh = await fetch(`/api/stake-history/${params.votePubkey}`);
      const shj = await sh.json();
      setStakeHistory(shj.history || []);

      // Fetch validator info history
      const ih = await fetch(
        `/api/validator-info-history/${params.votePubkey}`
      );
      const ihj = await ih.json();
      setInfoHistory(ihj.history || []);

      // Fetch uptime data
      try {
        const u = await fetch(`/api/uptime/${params.votePubkey}`);
        const uj = await u.json();
        // Use overall uptime from API (works with any amount of data, even partial day)
        if (uj.overallUptime !== undefined) {
          setUptimePercentage(uj.overallUptime);
          setUptimeDaysTracked(uj.daysTracked || 0);
        } else if (uj.days && uj.days.length > 0) {
          // Fallback: calculate from days data if overallUptime not provided
          const totalChecks = uj.days.reduce(
            (sum: number, day: any) => sum + day.uptimeChecks,
            0
          );
          const totalDelinquent = uj.days.reduce(
            (sum: number, day: any) => sum + day.delinquentChecks,
            0
          );
          const avgUptime =
            totalChecks > 0
              ? ((totalChecks - totalDelinquent) / totalChecks) * 100
              : 100;
          setUptimePercentage(avgUptime);
          setUptimeDaysTracked(uj.days.length);
        }
      } catch (err) {
        console.error("Failed to fetch uptime:", err);
        setUptimePercentage(null);
        setUptimeDaysTracked(0);
      }

      setLoading(false);
    })();
  }, [params.votePubkey]);

  // Mount detection for portal
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Cleanup stake distribution timeout on unmount
  useEffect(() => {
    return () => {
      if (stakeDistributionTimeoutRef.current) {
        clearTimeout(stakeDistributionTimeoutRef.current);
      }
    };
  }, []);

  // Validator search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search-validators?q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        setSearchResults(data.results || []);
        if (data.results && data.results.length > 0) {
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
  }, [searchQuery]);

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

  const currentCommission =
    series.length > 0 ? series[series.length - 1].commission : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back Button and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = "/validators";
            }
          }}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-orange-400 transition-colors font-medium flex-shrink-0 text-sm sm:text-base"
        >
          <span>←</span>
          <span className="hidden sm:inline">Back to Validators</span>
          <span className="sm:hidden">Back</span>
        </button>

        {/* Validator Search */}
        <div className="flex-1 max-w-full sm:max-w-2xl sm:mx-auto">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
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

            {/* Search Results Dropdown - Rendered via Portal */}
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
                        🔍 Validators matching "{searchQuery}"
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
                          setSearchQuery("");
                        }}
                      >
                        {result.iconUrl ? (
                          <img
                            src={result.iconUrl}
                            alt={result.name}
                            className="w-10 h-10 rounded-lg border-2 border-white/20 group-hover:border-orange-500/70 transition-colors flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white/5 to-white/0 flex items-center justify-center border-2 border-white/20 group-hover:border-orange-500/70 transition-colors flex-shrink-0">
                            <span className="text-lg text-gray-500">?</span>
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-400">Loading validator data...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Validator Header */}
          <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-sm overflow-visible">
            <div className="flex items-start gap-3 sm:gap-4">
              {/* Icon */}
              <div className="flex-shrink-0">
                {meta?.avatarUrl ? (
                  <img
                    src={meta.avatarUrl}
                    className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl object-cover border-2 border-white/10 transition-all shadow-md hover:shadow-orange-500/30 hover:border-orange-400/50"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl border-2 border-white/10 bg-white/5 transition-all hover:border-orange-400/50 flex items-center justify-center text-gray-500 text-2xl sm:text-4xl">
                    ?
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap mb-2 sm:mb-3">
                  <h1 className="text-xl sm:text-3xl font-bold">
                    {meta?.name ? (
                      <span>
                        {meta.name
                          .split(
                            /([\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{231A}-\u{23FA}\u{24C2}\u{25AA}-\u{25FE}\u{2934}-\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE00}-\u{FE0F}\u{1F900}-\u{1FA9F}\u{E0020}-\u{E007F}]+)/gu
                          )
                          .map((part: string, i: number) => {
                            // Check if part is an emoji (comprehensive check)
                            if (
                              /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{231A}-\u{23FA}\u{24C2}\u{25AA}-\u{25FE}\u{2934}-\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE00}-\u{FE0F}\u{1F900}-\u{1FA9F}\u{E0020}-\u{E007F}]/u.test(
                                part
                              )
                            ) {
                              return (
                                <span key={i} className="emoji">
                                  {part}
                                </span>
                              );
                            }
                            return (
                              <span key={i} className="gradient-text">
                                {part}
                              </span>
                            );
                          })}
                      </span>
                    ) : (
                      <span className="gradient-text">Unknown Validator</span>
                    )}
                  </h1>
                  {validatorInfo?.validator?.delinquent && (
                    <span className="px-3 py-1 bg-red-500/20 border border-red-500 rounded-lg text-xs font-bold text-red-400 animate-pulse flex items-center gap-1.5">
                      <span className="text-base emoji">🚨</span>
                      DELINQUENT
                    </span>
                  )}
                </div>

                {/* Description */}
                {meta?.description && (
                  <p className="text-gray-300 text-sm mb-3 leading-relaxed">
                    <LinkifyText text={meta.description} />
                  </p>
                )}

                {/* Inline Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm overflow-visible">
                  {/* Row 1: Commission | MEV Commission | Version */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-500">Commission:</span>
                    <span
                      className={`font-semibold ${
                        currentCommission !== null
                          ? currentCommission <= 5
                            ? "text-green-400"
                            : currentCommission <= 10
                            ? "text-yellow-400"
                            : "text-red-400"
                          : "text-white"
                      }`}
                    >
                      {currentCommission !== null
                        ? `${currentCommission}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    {validatorInfo?.validator?.jitoEnabled &&
                    validatorInfo?.mev ? (
                      <>
                        <span className="text-gray-500">MEV Commission:</span>
                        <span
                          className={`font-semibold cursor-help ${
                            validatorInfo.mev.mevCommission <= 5
                              ? "text-green-400"
                              : validatorInfo.mev.mevCommission <= 10
                              ? "text-yellow-400"
                              : "text-red-400"
                          }`}
                          title="MEV Commission: The percentage this validator charges on Maximum Extractable Value (MEV) rewards from priority fees and bundles"
                        >
                          {validatorInfo.mev.mevCommission}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-500">MEV Commission:</span>
                        <span className="text-gray-600">—</span>
                      </>
                    )}
                  </div>
                  {validatorInfo?.validator?.version && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500">Version:</span>
                      <span className="text-white font-mono font-semibold text-xs">
                        {validatorInfo.validator.version}
                      </span>
                    </div>
                  )}

                  {/* Row 2: Website | Stake | Validator Age | Stake Accounts */}
                  {meta?.website && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500">Website:</span>
                      <a
                        href={meta.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-400 hover:text-orange-300 font-semibold hover:underline truncate"
                      >
                        {meta.website
                          .replace(/^https?:\/\//, "")
                          .replace(/\/$/, "")}
                      </a>
                    </div>
                  )}
                  {validatorInfo?.stake && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500">Stake:</span>
                      <span className="text-white font-semibold">
                        ◎{" "}
                        {validatorInfo.stake.activeStake.toLocaleString(
                          "en-US",
                          { maximumFractionDigits: 0 }
                        )}
                      </span>
                      {(() => {
                        const delta =
                          validatorInfo.stake.activatingStake -
                          validatorInfo.stake.deactivatingStake;
                        if (delta !== 0) {
                          return (
                            <span
                              className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${
                                delta > 0
                                  ? "bg-green-500/20 border border-green-500/50 text-green-300"
                                  : "bg-red-500/20 border border-red-500/50 text-red-300"
                              }`}
                              title={`Net stake change: ${
                                delta > 0 ? "+" : ""
                              }${delta.toLocaleString("en-US", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 6,
                              })} SOL`}
                            >
                              {delta > 0 ? "+" : "−"}◎{" "}
                              {Math.abs(delta).toLocaleString("en-US", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 6,
                              })}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                  {validatorInfo?.validator?.firstSeenEpoch &&
                    validatorInfo.validator.firstSeenEpoch > 0 && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-gray-500">Age:</span>
                        <span className="text-white font-semibold">
                          {validatorInfo.currentEpoch -
                            validatorInfo.validator.firstSeenEpoch}{" "}
                          epochs
                        </span>
                      </div>
                    )}
                  {validatorInfo?.validator?.stakeAccountCount !== undefined &&
                    validatorInfo.validator.stakeAccountCount > 0 && (
                      <div
                        className="flex items-baseline gap-2"
                        onMouseEnter={(e) => {
                          // Clear any pending hide timeout
                          if (stakeDistributionTimeoutRef.current) {
                            clearTimeout(stakeDistributionTimeoutRef.current);
                            stakeDistributionTimeoutRef.current = null;
                          }

                          if (
                            validatorInfo.stake?.stakeDistribution &&
                            validatorInfo.stake.stakeDistribution.length > 0
                          ) {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            setStakeDistributionPosition({
                              top: rect.bottom + 8,
                              left: rect.left,
                            });
                            setShowStakeDistribution(true);
                          }
                        }}
                        onMouseLeave={() => {
                          // Delay hiding to allow moving to popup
                          stakeDistributionTimeoutRef.current = setTimeout(
                            () => {
                              setShowStakeDistribution(false);
                            },
                            300
                          );
                        }}
                      >
                        <span className="text-gray-500">Stake Accounts:</span>
                        <span className="text-white font-semibold cursor-help">
                          {validatorInfo.validator.stakeAccountCount.toLocaleString()}
                        </span>
                      </div>
                    )}

                  {/* Stake Distribution Popup Portal */}
                  {showStakeDistribution &&
                    validatorInfo?.stake?.stakeDistribution &&
                    validatorInfo.stake.stakeDistribution.length > 0 &&
                    typeof window !== "undefined" &&
                    createPortal(
                      <div
                        className="fixed w-[420px]"
                        style={{
                          top: `${stakeDistributionPosition.top}px`,
                          left: `${stakeDistributionPosition.left}px`,
                          zIndex: 999999,
                        }}
                        onMouseEnter={() => {
                          // Clear any pending hide timeout when hovering over popup
                          if (stakeDistributionTimeoutRef.current) {
                            clearTimeout(stakeDistributionTimeoutRef.current);
                            stakeDistributionTimeoutRef.current = null;
                          }
                          setShowStakeDistribution(true);
                        }}
                        onMouseLeave={() => {
                          // Delay hiding when leaving popup
                          stakeDistributionTimeoutRef.current = setTimeout(
                            () => {
                              setShowStakeDistribution(false);
                            },
                            200
                          );
                        }}
                      >
                        <div className="glass rounded-xl p-4 border-2 border-orange-500/50 shadow-[0_20px_60px_rgba(0,0,0,0.9)] backdrop-blur-xl bg-[#0a0a0a]/95">
                          <div className="text-sm font-bold text-orange-400 mb-3 flex items-center gap-2">
                            <span>📊</span>
                            <span>Top 10 Stakers</span>
                          </div>
                          <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2.5 custom-scrollbar">
                            {validatorInfo.stake.stakeDistribution.map(
                              (entry, idx) => {
                                const percentage =
                                  (entry.amount /
                                    validatorInfo.stake!.activeStake /
                                    1_000_000_000) *
                                  100;
                                return (
                                  <div key={idx} className="space-y-1.5">
                                    <div className="flex justify-between items-baseline gap-2">
                                      <span className="text-white font-medium text-sm truncate">
                                        {idx + 1}.{" "}
                                        {entry.label ||
                                          `${entry.staker.slice(
                                            0,
                                            6
                                          )}...${entry.staker.slice(-4)}`}
                                      </span>
                                      <span className="text-orange-400 font-bold text-sm whitespace-nowrap">
                                        {percentage.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
                                        style={{
                                          width: `${Math.min(
                                            percentage,
                                            100
                                          )}%`,
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                </div>

                {/* Copy buttons - More compact */}
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  {validatorInfo?.validator?.identityPubkey && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          validatorInfo.validator.identityPubkey
                        );
                        setCopiedIdentity(true);
                        setTimeout(() => setCopiedIdentity(false), 2000);
                      }}
                      className={`flex items-center gap-2 text-xs font-mono rounded-lg px-3 py-1.5 border transition-all ${
                        copiedIdentity
                          ? "bg-green-500/20 border-green-500 text-green-400"
                          : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-400 text-gray-400"
                      }`}
                    >
                      <span className="text-gray-500 flex-shrink-0">
                        Identity:
                      </span>
                      <span className="truncate">
                        {validatorInfo.validator.identityPubkey}
                      </span>
                      <span className="flex-shrink-0">
                        {copiedIdentity ? "✓" : "📋"}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(params.votePubkey);
                      setCopiedVote(true);
                      setTimeout(() => setCopiedVote(false), 2000);
                    }}
                    className={`flex items-center gap-2 text-xs font-mono rounded-lg px-3 py-1.5 border transition-all ${
                      copiedVote
                        ? "bg-green-500/20 border-green-500 text-green-400"
                        : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-400 text-gray-400"
                    }`}
                  >
                    <span className="text-gray-500 flex-shrink-0">Vote:</span>
                    <span className="truncate">{params.votePubkey}</span>
                    <span className="flex-shrink-0">
                      {copiedVote ? "✓" : "📋"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Gauges */}
          {validatorInfo && (
            <div className="glass rounded-2xl p-4 sm:p-8 border border-white/10 shadow-2xl shadow-black/30">
              <div className="mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
                  Current Performance
                </h2>
                <p className="text-sm text-gray-400">
                  Epoch {validatorInfo.currentEpoch}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">
                {validatorInfo.performance && (
                  <>
                    <CircularGauge
                      value={100 - validatorInfo.performance.skipRate}
                      label="Block Production"
                      sublabel={
                        validatorInfo.performance.leaderSlots ? (
                          <>
                            {(() => {
                              const produced =
                                validatorInfo.performance.blocksProduced;
                              const skipped =
                                validatorInfo.performance.leaderSlots -
                                validatorInfo.performance.blocksProduced;

                              // Abbreviate large numbers
                              const formatCompact = (num: number) => {
                                if (num >= 1000000)
                                  return `${(num / 1000000).toFixed(1)}M`;
                                if (num >= 1000)
                                  return `${(num / 1000).toFixed(1)}K`;
                                return num.toLocaleString();
                              };

                              return (
                                <span>
                                  <span className="text-green-400 font-medium">
                                    {formatCompact(produced)}
                                  </span>
                                  {" produced · "}
                                  <span
                                    className={
                                      skipped === 0
                                        ? "text-green-400"
                                        : "text-red-400"
                                    }
                                  >
                                    {skipped} skipped
                                  </span>
                                </span>
                              );
                            })()}
                          </>
                        ) : (
                          "No data"
                        )
                      }
                      thresholds={{ good: 95, warning: 85 }}
                    />
                    <CircularGauge
                      value={validatorInfo.performance.voteCreditsPercentage}
                      label="Vote Performance"
                      sublabel={(() => {
                        const credits = validatorInfo.performance.voteCredits;
                        const formatted =
                          credits >= 1000000
                            ? `${(credits / 1000000).toFixed(1)}M`
                            : credits >= 1000
                            ? `${(credits / 1000).toFixed(1)}K`
                            : credits.toLocaleString();
                        return `${formatted} credits`;
                      })()}
                      thresholds={{ good: 90, warning: 75 }}
                    />
                  </>
                )}
                {/* Uptime gauge - uses real data from uptime tracking */}
                {uptimePercentage !== null ? (
                  <CircularGauge
                    value={uptimePercentage}
                    label="Uptime"
                    sublabel={
                      uptimeDaysTracked === 1
                        ? "1 day tracked"
                        : uptimeDaysTracked >= 365
                        ? "1 year tracked"
                        : `${uptimeDaysTracked} days tracked`
                    }
                    thresholds={{ good: 99, warning: 95 }}
                  />
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-[120px] h-[120px] rounded-full border-4 border-gray-700 border-dashed flex items-center justify-center">
                      <div className="text-center px-2">
                        <div className="text-gray-500 text-xs">Collecting</div>
                        <div className="text-gray-500 text-xs">Data...</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-400 mt-2 text-center font-medium">
                      Uptime
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stake Info - Compact Cards */}
          {validatorInfo?.stake && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl shadow-black/20">
                <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                  Stake Delta
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-bold mb-3 ${
                    validatorInfo.stake.activatingStake -
                      validatorInfo.stake.deactivatingStake >
                    0
                      ? "text-green-400"
                      : validatorInfo.stake.activatingStake -
                          validatorInfo.stake.deactivatingStake <
                        0
                      ? "text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {(() => {
                    const delta =
                      validatorInfo.stake.activatingStake -
                      validatorInfo.stake.deactivatingStake;
                    if (Math.abs(delta) < 0.000001) return "—";
                    return `${delta > 0 ? "+" : "−"}◎ ${Math.abs(
                      delta
                    ).toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 6,
                    })}`;
                  })()}
                </div>
              </div>
              <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl shadow-black/20">
                <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                  Activating
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-green-400 mb-3">
                  {validatorInfo.stake.activatingStake > 0
                    ? `◎ ${validatorInfo.stake.activatingStake.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 6,
                        }
                      )}`
                    : "—"}
                </div>
                {validatorInfo.stake.activatingAccounts.length > 0 && (
                  <StakeBreakdown
                    accounts={validatorInfo.stake.activatingAccounts}
                    type="activating"
                  />
                )}
              </div>
              <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl shadow-black/20">
                <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                  Deactivating
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-3">
                  {validatorInfo.stake.deactivatingStake > 0
                    ? `◎ ${validatorInfo.stake.deactivatingStake.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 6,
                        }
                      )}`
                    : "—"}
                </div>
                {validatorInfo.stake.deactivatingAccounts.length > 0 && (
                  <StakeBreakdown
                    accounts={validatorInfo.stake.deactivatingAccounts}
                    type="deactivating"
                  />
                )}
              </div>
            </div>
          )}

          {/* Uptime Chart */}
          <UptimeChart votePubkey={params.votePubkey} />

          {/* Stake History Chart */}
          <div className="glass rounded-2xl p-4 sm:p-8 border border-white/10 shadow-2xl shadow-black/30">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">
              Stake History
            </h2>
            {stakeHistory.length > 0 ? (
              <StakeChart data={stakeHistory} />
            ) : (
              <div className="text-center py-12 text-gray-400">
                No stake history available yet
              </div>
            )}
          </div>

          {/* Commission History - Compact */}
          {series.length > 0 && (
            <div className="glass rounded-2xl p-4 sm:p-5 border border-white/10 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-white mb-3">
                Commission History
              </h2>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="bg-white/5 rounded-lg p-2 sm:p-3 border border-white/10">
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                    Current
                  </div>
                  <div className="text-base sm:text-xl font-bold text-white">
                    {currentCommission}%
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-2 sm:p-3 border border-white/10">
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                    Min
                  </div>
                  <div className="text-base sm:text-xl font-bold text-green-400">
                    {Math.min(...series.map((s) => s.commission))}%
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-2 sm:p-3 border border-white/10">
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                    Max
                  </div>
                  <div className="text-base sm:text-xl font-bold text-red-400">
                    {Math.max(...series.map((s) => s.commission))}%
                  </div>
                </div>
              </div>
              <div className="h-[200px]">
                <CommissionChart data={series} />
              </div>
            </div>
          )}

          {/* Validator Info History - Only show if there are changes */}
          {infoHistory.length > 1 && (
            <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  📜 Validator Info History
                </h2>
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                  {infoHistory.length}{" "}
                  {infoHistory.length === 1 ? "change" : "changes"}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Historical changes to validator name, description, website, and
                icon. Useful for tracking rebrands or identifying validators
                after rugs.
              </p>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {infoHistory.map((record, index) => {
                  const isLatest = index === 0;
                  const prevRecord =
                    index < infoHistory.length - 1
                      ? infoHistory[index + 1]
                      : null;

                  // Determine what changed
                  const changes: string[] = [];
                  if (prevRecord) {
                    if (record.name !== prevRecord.name) changes.push("Name");
                    if (record.description !== prevRecord.description)
                      changes.push("Description");
                    if (record.website !== prevRecord.website)
                      changes.push("Website");
                    if (record.iconUrl !== prevRecord.iconUrl)
                      changes.push("Icon");
                    if (record.identityPubkey !== prevRecord.identityPubkey)
                      changes.push("Identity");
                  }

                  return (
                    <div
                      key={`${record.changedAt}-${index}`}
                      className={`border rounded-lg p-3 sm:p-4 transition-all ${
                        isLatest
                          ? "border-green-500/50 bg-green-500/5"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        {record.iconUrl ? (
                          <img
                            src={record.iconUrl}
                            alt={record.name || "Icon"}
                            className="w-10 h-10 rounded-lg border border-white/20 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg border border-white/20 bg-white/5 flex-shrink-0 flex items-center justify-center text-gray-500 text-lg">
                            ?
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <div className="font-semibold text-white text-sm truncate">
                                {record.name || "(No name)"}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {new Date(record.changedAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                                {" · "}Epoch {record.epoch}
                              </div>
                            </div>
                            {isLatest ? (
                              <span className="text-xs font-bold text-green-400 bg-green-500/20 px-2 py-1 rounded">
                                CURRENT
                              </span>
                            ) : changes.length > 0 ? (
                              <span className="text-xs text-orange-400 bg-orange-500/20 px-2 py-1 rounded">
                                Changed: {changes.join(", ")}
                              </span>
                            ) : null}
                          </div>

                          {record.website && (
                            <a
                              href={record.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-orange-400 hover:text-orange-300 mt-1 block truncate"
                            >
                              🔗{" "}
                              {record.website
                                .replace(/^https?:\/\//, "")
                                .replace(/\/$/, "")}
                            </a>
                          )}

                          {record.description && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                              {record.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commission Change Events Table - Only if events exist */}
          {events.length > 0 && (
            <div className="glass rounded-2xl p-4 sm:p-8 border border-white/10 shadow-2xl shadow-black/30">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">
                Commission Changes
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400">
                        Commission
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400">
                        Change
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400">
                        Detected
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr
                        key={event.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          {event.type === "RUG" && (
                            <span className="px-2 py-1 bg-red-500/20 border border-red-500 rounded text-xs font-bold text-red-400">
                              RUG
                            </span>
                          )}
                          {event.type === "CAUTION" && (
                            <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-500 rounded text-xs font-bold text-yellow-400">
                              CAUTION
                            </span>
                          )}
                          {event.type === "INFO" && (
                            <span className="px-2 py-1 bg-blue-500/20 border border-blue-500 rounded text-xs font-bold text-blue-400">
                              INFO
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">
                              {event.from_commission}%
                            </span>
                            <span className="text-gray-600">→</span>
                            <span className="text-white font-semibold">
                              {event.to_commission}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              event.delta > 0
                                ? "text-red-400"
                                : "text-green-400"
                            }`}
                          >
                            {event.delta > 0 ? "+" : ""}
                            {event.delta}pp
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-400">
                          {event.created_at
                            ? getRelativeTime(event.created_at)
                            : `Epoch ${event.epoch}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
