"use client";
import CommissionChart from "@/components/CommissionChart";
import StakeChart from "@/components/StakeChart";
import StakeDistributionPie from "@/components/StakeDistributionPie";
import UptimeChart from "@/components/UptimeChart";
import ValidatorSubscribe from "@/components/ValidatorSubscribe";
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
  commission_type: "INFLATION" | "MEV";
  from_disabled?: boolean; // For MEV events: true if MEV was disabled
  to_disabled?: boolean; // For MEV events: true if MEV is now disabled
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

// Utility function to format SOL amounts with smart precision
function formatSOL(amount: number): string {
  if (amount >= 1000) {
    // Large amounts: no decimals (10,107 SOL)
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } else if (amount >= 1) {
    // Medium amounts: 2 decimals (1.09 SOL)
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else {
    // Small amounts: up to 8 decimals (full SOL precision), but strip trailing zeros
    // This handles cases like 0.00002 SOL (shows as "0.00002") and 0.1234 SOL (shows as "0.1234")
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8, // SOL has 9 decimals (lamports), but 8 is reasonable display limit
    });
    return formatted;
  }
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
    commission?: number | null;
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
  changedAt: string | null;
  createdAt: string;
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
                  ◎ {formatSOL(solAmount)}
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
  const [series, setSeries] = useState<{ epoch: number; commission: number | null; mevCommission: number | null }[]>(
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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ValidatorSearchResult[]>(
    []
  );
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Pagination for commission events
  const [eventsToShow, setEventsToShow] = useState(10);
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
      const s = await fetch(`/api/series/${params.votePubkey}`, {
        cache: "no-store",
      });
      const sj = await s.json();
      setSeries(sj.series || []);
      const m = await fetch(`/api/meta/${params.votePubkey}`, {
        cache: "no-store",
      });
      const mj = await m.json();
      setMeta(mj.meta || null);
      const e = await fetch(`/api/validator-events/${params.votePubkey}`, {
        cache: "no-store",
      });
      const ej = await e.json();
      setEvents(ej.items || []);
      const i = await fetch(`/api/validator-info/${params.votePubkey}`, {
        cache: "no-store",
      });
      const ij = await i.json();
      setValidatorInfo(ij.error ? null : ij);
      const sh = await fetch(`/api/stake-history/${params.votePubkey}`, {
        cache: "no-store",
      });
      const shj = await sh.json();
      setStakeHistory(shj.history || []);

      // Fetch validator info history
      const ih = await fetch(
        `/api/validator-info-history/${params.votePubkey}`,
        { cache: "no-store" }
      );
      const ihj = await ih.json();
      setInfoHistory(ihj.history || []);

      // Fetch uptime data
      try {
        const u = await fetch(`/api/uptime/${params.votePubkey}`, {
          cache: "no-store",
        });
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

  // Use the real-time commission from validator info, not the series data
  const currentCommission = validatorInfo?.validator?.commission ?? null;

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
          <div className="glass rounded-2xl p-4 sm:p-6 md:p-8 border border-white/10 shadow-sm overflow-visible hover:border-white/20 transition-all duration-300">
            <div className="flex items-start gap-3 sm:gap-4 md:gap-6">
              {/* Icon */}
              <div className="flex-shrink-0">
                {meta?.avatarUrl ? (
                  <img
                    src={meta.avatarUrl}
                    className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl object-cover border-2 border-white/10 transition-all duration-[1200ms] ease-in-out shadow-md hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] hover:border-orange-400/60"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl border-2 border-white/10 bg-white/5 transition-all duration-[1200ms] ease-in-out hover:border-orange-400/60 hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] flex items-center justify-center text-gray-500 text-xl sm:text-3xl md:text-4xl">
                    ?
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 w-full md:w-auto">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap mb-2 sm:mb-3">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">
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
                      <span className="gradient-text">{params.votePubkey}</span>
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
                  <p className="text-gray-300 text-xs sm:text-sm mb-3 leading-relaxed line-clamp-3 sm:line-clamp-none">
                    <LinkifyText text={meta.description} />
                  </p>
                )}

                {/* Inline Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-3 sm:gap-x-4 md:gap-x-6 gap-y-2 sm:gap-y-2 text-[11px] sm:text-xs md:text-sm overflow-visible">
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
                        ◎ {formatSOL(validatorInfo.stake.activeStake)}
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
                            }${formatSOL(Math.abs(delta))} SOL`}
                          >
                            {delta > 0 ? "+" : "−"}◎ {formatSOL(Math.abs(delta))}
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
                      <div className="flex items-baseline gap-2">
                        <span className="text-gray-500">Stake Accounts:</span>
                        <span className="text-white font-semibold">
                          {validatorInfo.validator.stakeAccountCount.toLocaleString()}
                        </span>
                      </div>
                    )}
                </div>

                {/* Copy buttons - More compact */}
                <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:mt-4">
                  {validatorInfo?.validator?.identityPubkey && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          validatorInfo.validator.identityPubkey
                        );
                        setCopiedIdentity(true);
                        setTimeout(() => setCopiedIdentity(false), 2000);
                      }}
                      className={`flex items-center gap-2 text-[10px] sm:text-xs font-mono rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 border transition-all ${
                        copiedIdentity
                          ? "bg-green-500/20 border-green-500 text-green-400"
                          : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-400 text-gray-400"
                      }`}
                    >
                      <span className="text-gray-500 flex-shrink-0 text-[10px] sm:text-xs">
                        Identity:
                      </span>
                      <span className="truncate">
                        <span className="hidden sm:inline">
                          {validatorInfo.validator.identityPubkey}
                        </span>
                        <span className="sm:hidden">
                          {validatorInfo.validator.identityPubkey.slice(0, 6)}
                          ...
                          {validatorInfo.validator.identityPubkey.slice(-6)}
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-sm">
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
                    className={`flex items-center gap-2 text-[10px] sm:text-xs font-mono rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 border transition-all ${
                      copiedVote
                        ? "bg-green-500/20 border-green-500 text-green-400"
                        : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-400 text-gray-400"
                    }`}
                  >
                    <span className="text-gray-500 flex-shrink-0 text-[10px] sm:text-xs">
                      Vote:
                    </span>
                    <span className="truncate">
                      <span className="hidden sm:inline">
                        {params.votePubkey}
                      </span>
                      <span className="sm:hidden">
                        {params.votePubkey.slice(0, 6)}...
                        {params.votePubkey.slice(-6)}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-sm">
                      {copiedVote ? "✓" : "📋"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Gauges and Stake Distribution */}
          {validatorInfo && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Current Performance */}
              <div className="glass rounded-2xl p-4 sm:p-8 border border-white/10 shadow-2xl shadow-black/30 hover:border-white/20 transition-all duration-300">
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
                        value={
                          validatorInfo.performance.leaderSlots > 0
                            ? 100 - validatorInfo.performance.skipRate
                            : 0
                        }
                        label="Block Production"
                        sublabel={
                          validatorInfo.performance.leaderSlots ? (
                            <>
                              {(() => {
                                const totalLeaderSlots =
                                  validatorInfo.performance.leaderSlots;
                                const produced =
                                  validatorInfo.performance.blocksProduced;
                                const skipRate =
                                  validatorInfo.performance.skipRate;

                                // Calculate elapsed leader slots and skipped from skip rate
                                // skipRate = (skipped / elapsed) * 100
                                // We know: skipRate, produced
                                // elapsed = produced / (1 - skipRate / 100)
                                // skipped = elapsed - produced
                                const elapsedLeaderSlots =
                                  skipRate < 100
                                    ? Math.round(
                                        produced / (1 - skipRate / 100)
                                      )
                                    : produced;
                                const skipped = Math.max(
                                  0,
                                  elapsedLeaderSlots - produced
                                );

                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-gray-400 text-xs">
                                      {totalLeaderSlots.toLocaleString()} leader
                                      slots
                                    </span>
                                    <span>
                                      <span className="text-green-400 font-medium">
                                        {produced.toLocaleString()} produced
                                      </span>
                                      {" · "}
                                      <span
                                        className={
                                          skipped === 0
                                            ? "text-green-400"
                                            : "text-red-400"
                                        }
                                      >
                                        {skipped.toLocaleString()} skipped
                                      </span>
                                    </span>
                                  </div>
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
                          <div className="text-gray-500 text-xs">
                            Collecting
                          </div>
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

              {/* Stake Distribution */}
              {validatorInfo?.stake?.stakeDistribution &&
                validatorInfo.stake.stakeDistribution.length > 0 && (
                  <div className="glass rounded-2xl p-4 sm:p-8 border border-white/10 shadow-2xl shadow-black/30 hover:border-white/20 transition-all duration-300">
                    <div className="mb-3 sm:mb-4">
                      <h2 className="text-xl sm:text-2xl font-bold text-white">
                        Stake Distribution
                      </h2>
                    </div>
                    <div className="h-[450px] sm:h-[400px]">
                      <StakeDistributionPie
                        distribution={validatorInfo.stake.stakeDistribution}
                        totalStake={validatorInfo.stake.activeStake}
                      />
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Stake Info - Compact Cards */}
          {validatorInfo?.stake && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {(() => {
                const delta =
                  validatorInfo.stake.activatingStake -
                  validatorInfo.stake.deactivatingStake;
                const isPositive = delta > 0;
                const isNegative = delta < 0;
                const isNeutral = Math.abs(delta) < 0.000001;

                return (
                  <div
                    className={`glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl shadow-black/20 transition-all duration-300 ${
                      isPositive
                        ? "hover:border-green-500/30 hover:shadow-2xl hover:shadow-green-500/10"
                        : isNegative
                        ? "hover:border-red-500/30 hover:shadow-2xl hover:shadow-red-500/10"
                        : "hover:border-white/20"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                      Stake Delta
                    </div>
                    <div
                      className={`text-2xl sm:text-3xl font-bold mb-3 ${
                        isPositive
                          ? "text-green-400"
                          : isNegative
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      {isNeutral
                        ? "—"
                        : `${delta > 0 ? "+" : "−"}◎ ${formatSOL(Math.abs(delta))}`}
                    </div>
                  </div>
                );
              })()}
              <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl shadow-black/20 hover:border-green-500/30 hover:shadow-2xl hover:shadow-green-500/10 transition-all duration-300">
                <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                  Activating
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-green-400 mb-3">
                  {validatorInfo.stake.activatingStake > 0
                    ? `◎ ${formatSOL(validatorInfo.stake.activatingStake)}`
                    : "—"}
                </div>
                {validatorInfo.stake.activatingAccounts.length > 0 && (
                  <StakeBreakdown
                    accounts={validatorInfo.stake.activatingAccounts}
                    type="activating"
                  />
                )}
              </div>
              <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl shadow-black/20 hover:border-red-500/30 hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-300">
                <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                  Deactivating
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-3">
                  {validatorInfo.stake.deactivatingStake > 0
                    ? `◎ ${formatSOL(validatorInfo.stake.deactivatingStake)}`
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
          <div className="glass rounded-2xl p-4 sm:p-8 border border-white/10 shadow-2xl shadow-black/30 hover:border-white/20 transition-all duration-300">
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

          {/* Commission History */}
          {(() => {
            // Always show the section, even if no history data
            if (!validatorInfo) return null;

            // Check if there are enough data points to draw a meaningful chart
            // Need at least 2 data points for each series to draw a line
            const inflationDataPoints = series.filter((s) => s.commission !== null);
            const mevDataPoints = series.filter((s) => s.mevCommission !== null);
            
            const hasInflationData = inflationDataPoints.length >= 2;
            const hasMevData = mevDataPoints.length >= 2;
            const hasAnyData = hasInflationData || hasMevData;

            return (
              <div className="glass rounded-2xl p-4 sm:p-5 border border-white/10 shadow-sm hover:border-white/20 transition-all duration-300">
                <h2 className="text-base sm:text-lg font-bold text-white mb-3">
                  Commission History
                </h2>
                {hasAnyData ? (
                  <>
                    <div className="h-[200px] mb-6">
                      <CommissionChart data={series} />
                    </div>
                    
                    {/* Commission Changes Table */}
                    {events.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-white/10">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            Recent Commission Changes
                          </h3>
                          {events.length > eventsToShow && (
                            <span className="text-xs text-gray-500">
                              Showing {eventsToShow} of {events.length} changes
                            </span>
                          )}
                        </div>
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
                                  Epoch
                                </th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400">
                                  Detected
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {events.slice(0, eventsToShow).map((event) => (
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
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-400">
                                          {event.commission_type === 'MEV' && event.from_disabled
                                            ? 'MEV Disabled'
                                            : `${event.from_commission}%`}
                                        </span>
                                        <span className="text-gray-600">→</span>
                                        <span className="text-white font-semibold">
                                          {event.commission_type === 'MEV' && event.to_disabled
                                            ? 'MEV Disabled'
                                            : `${event.to_commission}%`}
                                        </span>
                                      </div>
                                      <span className={`text-[10px] font-semibold ${
                                        event.commission_type === 'MEV' 
                                          ? 'text-purple-400' 
                                          : 'text-orange-400'
                                      }`}>
                                        {event.commission_type === 'MEV' ? 'MEV Commission' : 'Inflation Commission'}
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
                                    {event.epoch}
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
                        
                        {/* Show More Button */}
                        {events.length > eventsToShow && (
                          <div className="mt-4 text-center">
                            <button
                              onClick={() => setEventsToShow(prev => Math.min(prev + 10, events.length))}
                              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-400 rounded-lg text-sm text-gray-300 hover:text-white transition-all"
                            >
                              Show More ({Math.min(10, events.length - eventsToShow)} more)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    No commission changes
                  </div>
                )}
              </div>
            );
          })()}

          {/* Validator Info History */}
          <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 shadow-sm hover:border-white/20 transition-all duration-300">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white">
                📜 Validator Info History
              </h2>
              {infoHistory.length > 1 && (
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                  {infoHistory.length}{" "}
                  {infoHistory.length === 1 ? "change" : "changes"}
                </span>
              )}
            </div>
            {infoHistory.length > 1 ? (
              <>
                <p className="text-sm text-gray-400 mb-4">
                  Historical changes to validator name, description, website,
                  and icon. Useful for tracking rebrands or identifying
                  validators after rugs.
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
                                  {new Date(
                                    record.changedAt || record.createdAt
                                  ).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
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
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">
                No validator info history
              </div>
            )}
          </div>

          {/* Validator-Specific Alerts Subscription */}
          <ValidatorSubscribe
            votePubkey={params.votePubkey}
            validatorName={meta?.name}
          />
        </>
      )}
    </div>
  );
}
