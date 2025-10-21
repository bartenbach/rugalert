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
};

export default function ValidatorsPage() {
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalValidators, setTotalValidators] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const observerTarget = useRef<HTMLDivElement>(null);

  // Initial load
  const loadValidators = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/validators?page=1&pageSize=100");
      const data = await res.json();

      if (res.ok) {
        setValidators(data.validators);
        setCurrentPage(1);
        setHasMore(data.hasMore);
        setTotalValidators(data.total);
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

  // Load more validators
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;

    try {
      setLoadingMore(true);
      const nextPage = currentPage + 1;
      const res = await fetch(`/api/validators?page=${nextPage}&pageSize=100`);
      const data = await res.json();

      if (res.ok) {
        setValidators((prev) => [...prev, ...data.validators]);
        setCurrentPage(nextPage);
        setHasMore(data.hasMore);
      }
    } catch (err) {
      console.error("Error loading more validators:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, currentPage]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
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
  }, [hasMore, loadingMore, loadMore]);

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
      {!loading && validators.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Total Validators</div>
              <div className="text-3xl font-bold text-white">
                {totalValidators}
              </div>
            </div>
            <div className="w-px h-12 bg-white/10"></div>
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Total Stake</div>
              <div className="text-3xl font-bold text-orange-400">
                {validators
                  .reduce((sum, v) => sum + v.activeStake, 0)
                  .toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                SOL
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validators Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-16">
                  #
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                  Validator
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                  Stake
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-32">
                  Cumulative
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-32">
                  Commission
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-32">
                  Version
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400">
                        Loading validators...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : validators.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-gray-400">No validators found</p>
                  </td>
                </tr>
              ) : (
                <>
                  {validators.map((validator) => (
                    <tr
                      key={validator.votePubkey}
                      onClick={() =>
                        (window.location.href = `/validator/${validator.votePubkey}`)
                      }
                      className="hover:bg-white/5 transition-colors duration-200 cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <span className="text-gray-400 font-mono text-sm">
                          {validator.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {validator.iconUrl ? (
                            <img
                              src={validator.iconUrl}
                              alt={validator.name || "Validator"}
                              className="w-10 h-10 rounded-xl object-cover border border-white/10 group-hover:border-orange-400 transition-colors"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/30 border border-white/10 group-hover:border-orange-400 flex items-center justify-center transition-colors ${
                              validator.iconUrl ? "hidden" : ""
                            }`}
                          >
                            <span className="text-lg">🔷</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-white group-hover:text-orange-400 transition-colors truncate">
                                {validator.name || validator.votePubkey}
                              </div>
                              {validator.delinquent && (
                                <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs font-bold text-red-400 whitespace-nowrap">
                                  DELINQUENT
                                </span>
                              )}
                            </div>
                            {validator.version && (
                              <div className="text-xs text-gray-500 font-mono">
                                v{validator.version}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-white font-semibold">
                            {validator.activeStake.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}{" "}
                            SOL
                          </div>
                          <div className="text-xs text-gray-500">
                            {validator.stakePercent.toFixed(2)}%
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
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
                          <span className="text-sm text-gray-400 font-mono w-12 text-right">
                            {validator.cumulativeStakePercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-400 font-mono">
                          {validator.version || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Loading more indicator */}
                  {loadingMore && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center">
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

        {/* Infinite scroll trigger */}
        <div ref={observerTarget} className="h-4"></div>
      </div>

      {/* End message */}
      {!loading && !hasMore && validators.length > 0 && (
        <div className="text-center py-8">
          <div className="text-gray-500 text-sm">
            Showing all {totalValidators} validators
          </div>
        </div>
      )}
    </div>
  );
}
