"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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
};

type NetworkStats = {
  totalValidators: number;
  activeValidators: number;
  delinquentValidators: number;
  totalStake: number;
  activeStake: number;
  delinquentStake: number;
};

export default function ValidatorsPage() {
  const [allValidators, setAllValidators] = useState<Validator[]>([]); // All validators loaded once
  const [displayedValidators, setDisplayedValidators] = useState<Validator[]>(
    []
  ); // Currently displayed
  const [loading, setLoading] = useState(true);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(200); // How many to show

  const observerTarget = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 200;

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

  // Load more validators from the already-fetched list
  const loadMore = useCallback(() => {
    const nextCount = displayCount + PAGE_SIZE;
    setDisplayedValidators(allValidators.slice(0, nextCount));
    setDisplayCount(nextCount);
  }, [allValidators, displayCount, PAGE_SIZE]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const hasMore = displayCount < allValidators.length;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [displayCount, allValidators.length, loadMore]);

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
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-block">
          <h1 className="text-5xl md:text-6xl font-bold gradient-text mb-4">
            All Validators
          </h1>
          <div className="h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 rounded-full"></div>
        </div>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Complete list of all Solana validators sorted by stake
        </p>
      </div>

      {/* Stats */}
      {!loading && networkStats && (
        <div className="glass rounded-2xl p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Total Validators</div>
              <div className="text-3xl font-bold text-white">
                {networkStats.totalValidators.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {networkStats.activeValidators.toLocaleString()} active •{" "}
                {networkStats.delinquentValidators.toLocaleString()} delinquent
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Total Stake</div>
              <div className="text-3xl font-bold text-orange-400">
                {networkStats.totalStake.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{" "}
                <span className="text-xl">SOL</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Network-wide (real-time)
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Active Stake</div>
              <div className="text-3xl font-bold text-green-400">
                {networkStats.activeStake.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{" "}
                <span className="text-xl">SOL</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {(
                  (networkStats.activeStake / networkStats.totalStake) *
                  100
                ).toFixed(2)}
                %
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Delinquent Stake</div>
              <div className="text-3xl font-bold text-red-400">
                {networkStats.delinquentStake.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{" "}
                <span className="text-xl">SOL</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {(
                  (networkStats.delinquentStake / networkStats.totalStake) *
                  100
                ).toFixed(2)}
                %
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validators Table */}
      <div className="glass rounded-2xl">
        <table className="w-full">
          <thead className="sticky top-20 z-40 shadow-lg">
            <tr className="bg-[#0a0a0a] border-b-2 border-white/10">
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 w-16 bg-[#0a0a0a] rounded-tl-2xl">
                #
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 bg-[#0a0a0a]">
                Validator
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 w-48 bg-[#0a0a0a]">
                Stake
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 w-32 bg-[#0a0a0a]">
                Cumulative
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 w-32 bg-[#0a0a0a] rounded-tr-2xl">
                Commission
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-400">Loading validators...</span>
                  </div>
                </td>
              </tr>
            ) : displayedValidators.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-gray-400">No validators found</p>
                </td>
              </tr>
            ) : (
              <>
                {displayedValidators.map((validator, index) => {
                  // Check if we need to insert Nakamoto coefficient divider
                  const previousValidator =
                    index > 0 ? displayedValidators[index - 1] : null;
                  const showNakamotoDivider =
                    previousValidator &&
                    previousValidator.cumulativeStakePercent < 33.33 &&
                    validator.cumulativeStakePercent >= 33.33;

                  return (
                    <>
                      {showNakamotoDivider && (
                        <tr key={`nakamoto-${validator.votePubkey}`}>
                          <td colSpan={5} className="px-0 py-0">
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
                      <tr
                        key={validator.votePubkey}
                        onClick={() =>
                          (window.location.href = `/validator/${validator.votePubkey}`)
                        }
                        className={`transition-all duration-200 cursor-pointer group border-b border-white/5 ${
                          validator.delinquent
                            ? "bg-red-500/10 hover:bg-red-500/20 border-l-4 border-red-500"
                            : "hover:bg-white/5 hover:shadow-lg hover:shadow-orange-500/5 hover:scale-[1.01]"
                        }`}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 group-hover:border-orange-400/50 transition-all">
                            <span className="text-gray-300 font-bold text-xs">
                              {validator.rank}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {validator.iconUrl ? (
                              <>
                                <img
                                  src={validator.iconUrl}
                                  alt={validator.name || "Validator"}
                                  loading="lazy"
                                  className="w-8 h-8 rounded-lg object-cover border border-white/10 group-hover:border-orange-400 transition-all shadow-lg group-hover:shadow-orange-500/20 group-hover:scale-110"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    e.currentTarget.nextElementSibling?.classList.remove(
                                      "hidden"
                                    );
                                  }}
                                />
                                <div className="hidden w-8 h-8 rounded-lg border border-white/10 group-hover:border-orange-400 transition-colors"></div>
                              </>
                            ) : (
                              <div className="w-8 h-8 rounded-lg border border-white/10 group-hover:border-orange-400 transition-colors"></div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="font-semibold text-sm text-white group-hover:text-orange-400 transition-colors truncate">
                                  {validator.name || validator.votePubkey}
                                </div>
                                {validator.delinquent && (
                                  <span className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-[10px] font-bold text-red-400 whitespace-nowrap">
                                    DELINQUENT
                                  </span>
                                )}
                              </div>
                              {validator.version && (
                                <div className="text-[10px] text-gray-500 font-mono">
                                  v{validator.version}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 w-48">
                          <div>
                            <div className="text-white font-bold text-base whitespace-nowrap group-hover:text-orange-400 transition-colors">
                              {validator.activeStake.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}{" "}
                              <span className="text-sm text-gray-400">SOL</span>
                            </div>
                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                              <span>{validator.stakePercent.toFixed(2)}%</span>
                              {validator.stakeAccountCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span>
                                    {validator.stakeAccountCount.toLocaleString()}{" "}
                                    accts
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
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
                            <span className="text-xs text-gray-400 font-mono w-10 text-right">
                              {validator.cumulativeStakePercent.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-sm font-semibold ${
                              validator.commission >= 90
                                ? "text-red-400"
                                : validator.commission >= 10
                                ? "text-yellow-400"
                                : "text-green-400"
                            }`}
                          >
                            {validator.commission}%
                          </span>
                        </td>
                      </tr>
                    </>
                  );
                })}

                {/* Scroll sentinel for infinite scroll */}
                {displayCount < allValidators.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center">
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

        {/* Infinite scroll trigger */}
        <div ref={observerTarget} className="h-4"></div>
      </div>

      {/* End message */}
      {!loading &&
        displayCount >= allValidators.length &&
        allValidators.length > 0 && (
          <div className="text-center py-8">
            <div className="text-gray-500 text-sm">
              Showing all {allValidators.length} validators
            </div>
          </div>
        )}
    </div>
  );
}
