"use client";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Validator = {
  votePubkey: string;
  identityPubkey: string;
  name: string | null;
  iconUrl: string | null;
  commission: number;
  activeStake: number;
  activatingStake: number;
  deactivatingStake: number;
  stakePercent: number;
  cumulativeStakePercent: number;
  lastVote: number | null;
  version: string | null;
  skipRate: number | null;
  delinquent: boolean;
  rank: number;
  stakeAccountCount: number;
  jitoEnabled?: boolean;
  mevCommission?: number | null;
  uptimePercent?: number | null;
  uptimeDays?: number | null;
};

type NetworkStats = {
  totalValidators: number;
  activeValidators: number;
  delinquentValidators: number;
  totalStake: number;
  activeStake: number;
  delinquentStake: number;
};

type SortKey =
  | "rank"
  | "name"
  | "activeStake"
  | "cumulativeStakePercent"
  | "commission"
  | "mevCommission"
  | "uptimePercent";
type SortDirection = "asc" | "desc";

function ValidatorsPageContent() {
  const searchParams = useSearchParams();
  const [allValidators, setAllValidators] = useState<Validator[]>([]); // All validators loaded once
  const [displayedValidators, setDisplayedValidators] = useState<Validator[]>(
    []
  ); // Currently displayed
  const [loading, setLoading] = useState(true);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(200); // How many to show
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("activeStake");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const observerTarget = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 200;

  // Read filter params from URL
  // Supported URL parameters:
  //   ?commission=5            - Exact commission (e.g., 5%)
  //   ?commission_min=0        - Minimum commission (e.g., 0%)
  //   ?commission_max=5        - Maximum commission (e.g., 5%)
  //   ?mev_commission_min=0    - Minimum MEV commission
  //   ?mev_commission_max=5    - Maximum MEV commission
  //   ?uptime_min=99           - Minimum uptime percentage (e.g., 99%)
  // Example: /validators?commission=5 (shows all validators with exactly 5% commission)
  // Example: /validators?commission_max=5 (shows all validators with <= 5% commission)
  const commission = searchParams.get("commission");
  const commissionMin = searchParams.get("commission_min");
  const commissionMax = searchParams.get("commission_max");
  const mevCommissionMin = searchParams.get("mev_commission_min");
  const mevCommissionMax = searchParams.get("mev_commission_max");
  const uptimeMin = searchParams.get("uptime_min");

  // Initial load - fetch ALL validators at once
  const loadValidators = async () => {
    try {
      setLoading(true);
      // Fetch all validators in one go (no pagination on server side)
      const res = await fetch("/api/validators");
      const data = await res.json();

      if (res.ok) {
        setAllValidators(data.validators);
        setDisplayedValidators(data.validators.slice(0, PAGE_SIZE));
        setDisplayCount(PAGE_SIZE);
        setNetworkStats(data.networkStats || null);
      } else {
        setError(data.error || "Failed to load validators");
      }
    } catch (err) {
      console.error("Error loading validators:", err);
      setError("Failed to load validators");
    } finally {
      setLoading(false);
    }
  };

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new sort key with appropriate default direction
      setSortKey(key);
      // Most columns default to descending (highest first), except name
      setSortDirection(key === "name" ? "asc" : "desc");
    }
  };

  // Filter and sort validators - MEMOIZED to prevent infinite re-renders
  const filteredValidators = useMemo(() => {
    let filtered = allValidators;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.name?.toLowerCase().includes(query) ||
          v.votePubkey.toLowerCase().includes(query) ||
          v.identityPubkey?.toLowerCase().includes(query)
      );
    }

    // Apply URL parameter filters
    if (commission) {
      const commissionValue = parseFloat(commission);
      filtered = filtered.filter((v) => v.commission === commissionValue);
    }

    if (commissionMin) {
      const minValue = parseFloat(commissionMin);
      filtered = filtered.filter((v) => v.commission >= minValue);
    }

    if (commissionMax) {
      const maxValue = parseFloat(commissionMax);
      filtered = filtered.filter((v) => v.commission <= maxValue);
    }

    if (mevCommissionMin) {
      const minValue = parseFloat(mevCommissionMin);
      filtered = filtered.filter(
        (v) => (v.mevCommission ?? Infinity) >= minValue
      );
    }

    if (mevCommissionMax) {
      const maxValue = parseFloat(mevCommissionMax);
      filtered = filtered.filter(
        (v) => (v.mevCommission ?? Infinity) <= maxValue
      );
    }

    if (uptimeMin) {
      const minValue = parseFloat(uptimeMin);
      filtered = filtered.filter((v) => (v.uptimePercent ?? 0) >= minValue);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortKey) {
        case "rank":
          aVal = a.rank;
          bVal = b.rank;
          break;
        case "name":
          aVal = a.name?.toLowerCase() || a.votePubkey.toLowerCase();
          bVal = b.name?.toLowerCase() || b.votePubkey.toLowerCase();
          break;
        case "activeStake":
          aVal = a.activeStake;
          bVal = b.activeStake;
          break;
        case "cumulativeStakePercent":
          aVal = a.cumulativeStakePercent;
          bVal = b.cumulativeStakePercent;
          break;
        case "commission":
          aVal = a.commission;
          bVal = b.commission;
          break;
        case "mevCommission":
          // Handle null values - push to end
          aVal =
            a.mevCommission ?? (sortDirection === "asc" ? Infinity : -Infinity);
          bVal =
            b.mevCommission ?? (sortDirection === "asc" ? Infinity : -Infinity);
          break;
        case "uptimePercent":
          // Handle null values - push to end
          aVal =
            a.uptimePercent ?? (sortDirection === "asc" ? Infinity : -Infinity);
          bVal =
            b.uptimePercent ?? (sortDirection === "asc" ? Infinity : -Infinity);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [
    searchQuery,
    allValidators,
    sortKey,
    sortDirection,
    commission,
    commissionMin,
    commissionMax,
    mevCommissionMin,
    mevCommissionMax,
    uptimeMin,
  ]);

  // Update displayed validators when displayCount or filteredValidators changes
  useEffect(() => {
    setDisplayedValidators(filteredValidators.slice(0, displayCount));
  }, [displayCount, filteredValidators]);

  // Reset display count when search changes
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchQuery]);

  // Load more validators
  const loadMore = useCallback(() => {
    setDisplayCount((prev) => prev + PAGE_SIZE);
  }, []);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!observerTarget.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          displayCount < filteredValidators.length
        ) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(observerTarget.current);

    return () => {
      observer.disconnect();
    };
  }, [displayCount, filteredValidators.length, loadMore]);

  useEffect(() => {
    loadValidators();
  }, []);

  if (error) {
    return (
      <div className="space-y-8">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Network Stats Header */}
      {networkStats && (
        <div className="glass rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 shadow-2xl shadow-black/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Validators */}
            <div className="space-y-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                Network
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-white">
                    {networkStats.activeValidators.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-400">
                    / {networkStats.totalValidators.toLocaleString()} validators
                  </div>
                </div>
                {networkStats.delinquentValidators > 0 && (
                  <div className="text-xs text-gray-400">
                    {networkStats.delinquentValidators.toLocaleString()} delinquent
                  </div>
                )}
              </div>
            </div>

            {/* Stake */}
            <div className="space-y-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                Stake
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-green-400">
                    {(networkStats.activeStake / 1_000_000).toFixed(1)}M
                  </div>
                  <div className="text-sm text-gray-400">
                    / {(networkStats.totalStake / 1_000_000).toFixed(1)}M SOL
                  </div>
                </div>
                {networkStats.delinquentStake > 0 && (
                  <div className="text-xs text-gray-400">
                    {(networkStats.delinquentStake / 1_000_000).toFixed(2)}M delinquent ({((networkStats.delinquentStake / networkStats.totalStake) * 100).toFixed(1)}%)
                  </div>
                )}
              </div>
            </div>

            {/* Nakamoto Coefficient */}
            <div className="space-y-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                Nakamoto Coefficient
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold text-cyan-400">
                  {displayedValidators.find(v => v.cumulativeStakePercent > 33.33)?.rank || '—'}
                </div>
                <div className="text-xs text-gray-400">
                  Top validators to control 33% of stake
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Box */}
      <div>
        <div className="relative max-w-lg mx-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search validators by name or pubkey..."
            className="w-full px-4 py-3 pl-11 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 focus:bg-white/10 transition-all shadow-lg shadow-black/20 focus:shadow-orange-500/20"
          />
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
        </div>
        {searchQuery && (
          <div className="text-sm text-gray-400 mt-2 text-center">
            Found {filteredValidators.length} validator
            {filteredValidators.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* Active URL Filters Indicator */}
        {(commission ||
          commissionMin ||
          commissionMax ||
          mevCommissionMin ||
          mevCommissionMax ||
          uptimeMin) && (
          <div className="mt-4 max-w-2xl mx-auto">
            <div className="glass rounded-xl p-3 border border-orange-500/30 bg-orange-500/5">
              <div className="flex items-start gap-2">
                <div className="text-orange-400 text-lg mt-0.5">🔍</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-orange-400 mb-1">
                    Active Filters
                  </div>
                  <div className="text-xs text-gray-300 space-y-1">
                    {commission && <div>• Commission: {commission}%</div>}
                    {commissionMin && (
                      <div>• Commission min: {commissionMin}%</div>
                    )}
                    {commissionMax && (
                      <div>• Commission max: {commissionMax}%</div>
                    )}
                    {mevCommissionMin && (
                      <div>• MEV Commission min: {mevCommissionMin}%</div>
                    )}
                    {mevCommissionMax && (
                      <div>• MEV Commission max: {mevCommissionMax}%</div>
                    )}
                    {uptimeMin && <div>• Uptime min: {uptimeMin}%</div>}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Showing {filteredValidators.length} of{" "}
                    {allValidators.length} validators
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validators Table - Desktop */}
      <div className="hidden md:block glass rounded-2xl shadow-2xl shadow-black/30">
        <table className="w-full">
          <thead className="sticky top-20 z-40 shadow-lg backdrop-blur-xl">
            <tr className="bg-[#0a0a0a]/95 border-b-2 border-white/10">
              <th
                className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-16 bg-[#0a0a0a]/95 first:rounded-tl-2xl cursor-pointer hover:text-orange-400 transition-colors select-none"
                onClick={() => handleSort("rank")}
              >
                <div className="flex items-center gap-1">
                  Rank
                  {sortKey === "rank" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider bg-[#0a0a0a]/95 cursor-pointer hover:text-orange-400 transition-colors select-none"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Validator
                  {sortKey === "name" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-44 bg-[#0a0a0a]/95 cursor-pointer hover:text-orange-400 transition-colors select-none"
                onClick={() => handleSort("activeStake")}
              >
                <div className="flex items-center justify-end gap-1">
                  Active Stake
                  {sortKey === "activeStake" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-32 bg-[#0a0a0a]/95 cursor-pointer hover:text-orange-400 transition-colors select-none"
                onClick={() => handleSort("cumulativeStakePercent")}
              >
                <div className="flex items-center gap-1">
                  Cumulative
                  {sortKey === "cumulativeStakePercent" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3.5 text-center text-xs font-bold text-gray-400 uppercase tracking-wider w-28 bg-[#0a0a0a]/95 cursor-pointer hover:text-orange-400 transition-colors select-none"
                onClick={() => handleSort("commission")}
              >
                <div className="flex items-center justify-center gap-1">
                  Commission
                  {sortKey === "commission" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3.5 text-center text-xs font-bold text-gray-400 uppercase tracking-wider w-28 bg-[#0a0a0a]/95 cursor-pointer hover:text-orange-400 transition-colors select-none"
                title="MEV Commission on priority fees and bundles"
                onClick={() => handleSort("mevCommission")}
              >
                <div className="flex items-center justify-center gap-1">
                  MEV
                  {sortKey === "mevCommission" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3.5 text-center text-xs font-bold text-gray-400 uppercase tracking-wider w-28 bg-[#0a0a0a]/95 last:rounded-tr-2xl cursor-pointer hover:text-orange-400 transition-colors select-none"
                onClick={() => handleSort("uptimePercent")}
              >
                <div className="flex items-center justify-center gap-1">
                  Uptime
                  {sortKey === "uptimePercent" && (
                    <span className="text-orange-400">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-400">Loading validators...</span>
                  </div>
                </td>
              </tr>
            ) : displayedValidators.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-gray-400">No validators found</p>
                </td>
              </tr>
            ) : (
              <>
                {displayedValidators.map((validator, index) => {
                  // Check if we need to insert Nakamoto coefficient divider
                  // Show AFTER the validator that crosses 33.33% threshold
                  const showNakamotoDivider =
                    validator.cumulativeStakePercent > 33.33 &&
                    (index === 0 ||
                      displayedValidators[index - 1].cumulativeStakePercent <=
                        33.33);

                  return (
                    <>
                      <tr
                        key={validator.votePubkey}
                        onClick={() =>
                          (window.location.href = `/validator/${validator.votePubkey}`)
                        }
                        className={`transition-all duration-150 cursor-pointer group border-b border-white/5 border-l-2 ${
                          validator.delinquent
                            ? "bg-red-500/5 hover:bg-red-500/10 border-l-red-500"
                            : "border-l-transparent hover:bg-white/[0.03] hover:border-l-orange-500/50"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            <span className="font-mono text-sm font-semibold text-gray-500 group-hover:text-gray-300 transition-colors">
                              {validator.rank}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {validator.iconUrl ? (
                              <>
                                <img
                                  src={validator.iconUrl}
                                  alt={validator.name || "Validator"}
                                  loading="lazy"
                                  className="w-10 h-10 rounded-xl object-cover border-2 border-white/10 group-hover:border-orange-400/50 transition-all"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    e.currentTarget.nextElementSibling?.classList.remove(
                                      "hidden"
                                    );
                                  }}
                                />
                                <div className="hidden w-10 h-10 rounded-xl border-2 border-white/10 group-hover:border-orange-400/50 transition-colors bg-gradient-to-br from-white/5 to-white/0 flex items-center justify-center text-gray-500 text-lg">
                                  ?
                                </div>
                              </>
                            ) : (
                              <div className="w-10 h-10 rounded-xl border-2 border-white/10 group-hover:border-orange-400/50 transition-colors bg-gradient-to-br from-white/5 to-white/0 flex items-center justify-center text-gray-500 text-lg">
                                ?
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="font-semibold text-sm text-white group-hover:text-orange-400 transition-colors truncate">
                                  {validator.name || validator.votePubkey}
                                </div>
                                {validator.delinquent && (
                                  <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded-md text-[10px] font-bold text-red-300 whitespace-nowrap">
                                    DELINQUENT
                                  </span>
                                )}
                              </div>
                              {validator.version && (
                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                                  v{validator.version}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 w-44 text-right">
                          <div>
                            <div className="text-white font-semibold text-sm whitespace-nowrap group-hover:text-orange-400 transition-colors">
                              ◎{" "}
                              {validator.activeStake.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}
                            </div>
                            <div className="text-[10px] text-gray-500 flex items-center justify-end gap-1 mt-0.5">
                              <span className="font-mono">
                                {validator.stakePercent.toFixed(2)}%
                              </span>
                              {validator.stakeAccountCount > 0 && (
                                <>
                                  <span className="text-gray-600">•</span>
                                  <span>
                                    {validator.stakeAccountCount.toLocaleString()}{" "}
                                    {validator.stakeAccountCount === 1
                                      ? "acct"
                                      : "accts"}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden shadow-inner">
                              <div
                                className="h-full bg-gradient-to-r from-orange-500 via-orange-400 to-orange-300 transition-all duration-300"
                                style={{
                                  width: `${Math.min(
                                    validator.cumulativeStakePercent,
                                    100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-400 font-mono w-10 text-right font-semibold">
                              {validator.cumulativeStakePercent.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              validator.commission <= 5
                                ? "bg-green-500/15 text-green-300 border border-green-500/30"
                                : validator.commission <= 10
                                ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
                                : "bg-red-500/15 text-red-300 border border-red-500/30"
                            }`}
                          >
                            {validator.commission}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {validator.jitoEnabled &&
                          validator.mevCommission !== null &&
                          validator.mevCommission !== undefined ? (
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                validator.mevCommission <= 5
                                  ? "bg-green-500/15 text-green-300 border border-green-500/30"
                                  : validator.mevCommission <= 10
                                  ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
                                  : "bg-red-500/15 text-red-300 border border-red-500/30"
                              }`}
                              title="MEV Commission"
                            >
                              {validator.mevCommission}%
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {validator.uptimePercent !== null &&
                          validator.uptimePercent !== undefined ? (
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                validator.uptimePercent >= 99.9
                                  ? "bg-green-500/15 text-green-300 border border-green-500/30"
                                  : validator.uptimePercent >= 99.0
                                  ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
                                  : "bg-red-500/15 text-red-300 border border-red-500/30"
                              }`}
                              title={
                                validator.uptimeDays
                                  ? `${validator.uptimeDays} days tracked`
                                  : "Uptime percentage"
                              }
                            >
                              {validator.uptimePercent.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                      {showNakamotoDivider && (
                        <tr key={`nakamoto-${validator.votePubkey}`}>
                          <td colSpan={7} className="px-0 py-0">
                            <div className="relative bg-gradient-to-r from-cyan-500/20 via-cyan-400/30 to-cyan-500/20 border-y-2 border-cyan-400/50">
                              <div className="px-4 py-2 flex items-center justify-center gap-2">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"></div>
                                <div className="text-center">
                                  <div className="text-cyan-400 font-bold text-xs uppercase tracking-wider">
                                    ⚠️ Nakamoto Coefficient Threshold
                                  </div>
                                  <div className="text-[10px] text-cyan-300/80 mt-0.5">
                                    Cumulative stake above forms a superminority
                                    - Threat of halt or censorship
                                  </div>
                                  <div className="text-[10px] text-cyan-400/60 mt-0.5 font-semibold">
                                    Please consider staking below this line to
                                    help decentralize the network
                                  </div>
                                </div>
                                <div className="flex-1 h-px bg-gradient-to-r from-cyan-400 via-cyan-400 to-transparent"></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}

                {/* Scroll sentinel for infinite scroll */}
                {displayCount < filteredValidators.length && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-gray-400 text-sm">
                          Loading more validators...
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Validators Cards - Mobile */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-400">Loading validators...</span>
            </div>
          </div>
        ) : displayedValidators.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-gray-400">No validators found</p>
          </div>
        ) : (
          <>
            {displayedValidators.map((validator, index) => {
              // Show AFTER the validator that crosses 33.33% threshold
              const showNakamotoDivider =
                validator.cumulativeStakePercent > 33.33 &&
                (index === 0 ||
                  displayedValidators[index - 1].cumulativeStakePercent <=
                    33.33);

              return (
                <>
                  <div
                    key={validator.votePubkey}
                    onClick={() =>
                      (window.location.href = `/validator/${validator.votePubkey}`)
                    }
                    className={`glass rounded-xl p-4 border cursor-pointer transition-all ${
                      validator.delinquent
                        ? "border-red-500/50 bg-red-500/5"
                        : "border-white/10 hover:border-orange-500/50"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      {validator.iconUrl ? (
                        <img
                          src={validator.iconUrl}
                          alt={validator.name || "Validator"}
                          loading="lazy"
                          className="w-12 h-12 rounded-lg object-cover border-2 border-white/10 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg border-2 border-white/10 bg-gradient-to-br from-white/5 to-white/0 flex-shrink-0 flex items-center justify-center text-gray-500 text-xl">
                          ?
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-500">
                            #{validator.rank}
                          </span>
                          {validator.delinquent && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-[9px] font-bold text-red-300">
                              DELINQUENT
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-sm text-white truncate">
                          {validator.name || validator.votePubkey}
                        </div>
                        {validator.version && (
                          <div className="text-[10px] text-gray-500 font-mono">
                            v{validator.version}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-gray-500 mb-1">Stake</div>
                        <div className="text-white font-semibold">
                          ◎{" "}
                          {validator.activeStake.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          {validator.stakePercent.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Cumulative</div>
                        <div className="text-white font-semibold">
                          {validator.cumulativeStakePercent.toFixed(1)}%
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
                            style={{
                              width: `${Math.min(
                                validator.cumulativeStakePercent,
                                100
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Commission</div>
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                            validator.commission <= 5
                              ? "bg-green-500/15 text-green-300 border border-green-500/30"
                              : validator.commission <= 10
                              ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
                              : "bg-red-500/15 text-red-300 border border-red-500/30"
                          }`}
                        >
                          {validator.commission}%
                        </span>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">MEV</div>
                        {validator.jitoEnabled &&
                        validator.mevCommission !== null &&
                        validator.mevCommission !== undefined ? (
                          <span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                              validator.mevCommission <= 5
                                ? "bg-green-500/15 text-green-300 border border-green-500/30"
                                : validator.mevCommission <= 10
                                ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
                                : "bg-red-500/15 text-red-300 border border-red-500/30"
                            }`}
                          >
                            {validator.mevCommission}%
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-500 mb-1">Uptime</div>
                        {validator.uptimePercent !== null &&
                        validator.uptimePercent !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                                validator.uptimePercent >= 99.9
                                  ? "bg-green-500/15 text-green-300 border border-green-500/30"
                                  : validator.uptimePercent >= 99.0
                                  ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
                                  : "bg-red-500/15 text-red-300 border border-red-500/30"
                              }`}
                            >
                              {validator.uptimePercent.toFixed(2)}%
                            </span>
                            {validator.uptimeDays && (
                              <span className="text-[10px] text-gray-500">
                                ({validator.uptimeDays}d)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {showNakamotoDivider && (
                    <div
                      key={`nakamoto-mobile-${validator.votePubkey}`}
                      className="relative bg-gradient-to-r from-cyan-500/20 via-cyan-400/30 to-cyan-500/20 border-y-2 border-cyan-400/50 rounded-xl p-3"
                    >
                      <div className="text-center">
                        <div className="text-cyan-400 font-bold text-xs uppercase tracking-wider mb-1">
                          ⚠️ Nakamoto Coefficient
                        </div>
                        <div className="text-[10px] text-cyan-300/80">
                          Cumulative stake above forms a superminority
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })}
            {displayCount < filteredValidators.length && (
              <div className="flex items-center justify-center gap-3 py-6">
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-400 text-sm">
                  Loading more validators...
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Infinite scroll trigger - placed after both desktop and mobile sections */}
      <div ref={observerTarget} className="h-4"></div>

      {/* End message */}
      {!loading &&
        displayCount >= filteredValidators.length &&
        filteredValidators.length > 0 && (
          <div className="text-center py-8">
            <div className="text-gray-500 text-sm">
              Showing all {filteredValidators.length} validators
            </div>
          </div>
        )}
    </div>
  );
}

export default function ValidatorsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white flex items-center justify-center">
          <div className="text-gray-400">Loading validators...</div>
        </div>
      }
    >
      <ValidatorsPageContent />
    </Suspense>
  );
}

