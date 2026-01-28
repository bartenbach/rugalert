"use client";

import { useEffect, useState, useRef } from "react";

interface EpochData {
  epoch: number;
  uniqueValidators: number;
  commissionValidators: number;
  mevValidators: number;
  totalEvents: number;
  commissionEvents: number;
  mevEvents: number;
  bothTypes: number; // validators who rugged both commission and MEV in this epoch
}

interface ApiResponse {
  data: EpochData[];
  meta?: {
    totalUniqueValidators: number;
    totalEpochs: number;
    repeatOffenders: number;
    includesMevRugs: boolean;
    totalCommissionEvents: number;
    totalMevEvents: number;
    validatorEpochCounts?: Record<string, number>; // Deprecated: page-specific counts
    globalValidatorRugCounts?: Record<string, number>; // Global counts across ALL epochs
    // Global stats (all time)
    globalTotalEpochsTracked?: number;
    globalPeakRugs?: number;
    globalAvgPerEpoch?: number;
  };
}

interface RugEvent {
  id: string;
  vote_pubkey: string;
  name?: string | null;
  icon_url?: string | null;
  type: string;
  rug_type: 'COMMISSION' | 'MEV'; // NEW: which type of rug
  from_commission: number;
  to_commission: number;
  from_disabled?: boolean; // MEV was disabled (NULL)
  to_disabled?: boolean; // MEV was disabled (NULL)
  delta: number;
  epoch: number;
  created_at?: string;
}

export default function RugsPerEpochChart() {
  const [data, setData] = useState<EpochData[]>([]);
  const [repeatOffenders, setRepeatOffenders] = useState<number>(0);
  const [validatorEpochCounts, setValidatorEpochCounts] = useState<Record<string, number>>({});
  const [globalValidatorRugCounts, setGlobalValidatorRugCounts] = useState<Record<string, number>>({});
  const [initialLoading, setInitialLoading] = useState(true); // Only true on first load
  const [pageLoading, setPageLoading] = useState(false); // True when changing pages
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null);
  const [epochEvents, setEpochEvents] = useState<RugEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [page, setPage] = useState(0); // 0 = most recent 10 epochs, 1 = next 10, etc.
  const epochsPerPage = 10;
  const hasLoadedRef = useRef(false); // Track if we've loaded data before
  
  // Global stats (all time)
  const [globalStats, setGlobalStats] = useState<{
    totalEpochsTracked: number;
    peakRugs: number;
    avgPerEpoch: number;
  }>({ totalEpochsTracked: 0, peakRugs: 0, avgPerEpoch: 0 });

  useEffect(() => {
    async function load() {
      try {
        // Only show page loading if this is not the first load
        if (hasLoadedRef.current) {
          setPageLoading(true);
        } else {
          setInitialLoading(true);
        }
        
        const res = await fetch(`/api/rugs-per-epoch?epochs=${epochsPerPage}&offset=${page * epochsPerPage}`, {
          cache: "no-store"
        });
        const json: ApiResponse = await res.json();
        setData(json.data || []);
        setRepeatOffenders(json.meta?.repeatOffenders || 0);
        setValidatorEpochCounts(json.meta?.validatorEpochCounts || {});
        setGlobalValidatorRugCounts(json.meta?.globalValidatorRugCounts || {});
        
        // Set global stats (only from meta, doesn't change with pagination)
        if (json.meta) {
          setGlobalStats({
            totalEpochsTracked: json.meta.globalTotalEpochsTracked || 0,
            peakRugs: json.meta.globalPeakRugs || 0,
            avgPerEpoch: json.meta.globalAvgPerEpoch || 0,
          });
        }
        
        // Mark that we've successfully loaded data
        hasLoadedRef.current = true;
      } catch (error) {
        console.error("Failed to load rugs per epoch:", error);
      } finally {
        setInitialLoading(false);
        setPageLoading(false);
      }
    }
    load();

    // Reload every 30s
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [page]);

  async function loadEpochEvents(epoch: number) {
    if (selectedEpoch === epoch) {
      // Clicking the same epoch closes it
      setSelectedEpoch(null);
      setEpochEvents([]);
      return;
    }

    setSelectedEpoch(epoch);
    setLoadingEvents(true);
    try {
      // Add timestamp to bust Vercel edge cache
      const res = await fetch(`/api/epoch-events/${epoch}?t=${Date.now()}`, {
        cache: "no-store"
      });
      const json = await res.json();
      setEpochEvents(json.items || []);
    } catch (error) {
      console.error("Failed to load epoch events:", error);
      setEpochEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }

  if (initialLoading) {
    return (
      <>
        {/* Skeleton for global stats header */}
        <div className="glass rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 shadow-2xl shadow-black/20 mb-6 min-h-[120px]">
          <div className="animate-pulse grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="h-8 bg-white/10 rounded w-16 mx-auto mb-2"></div>
              <div className="h-3 bg-white/5 rounded w-24 mx-auto"></div>
            </div>
            <div>
              <div className="h-8 bg-white/10 rounded w-16 mx-auto mb-2"></div>
              <div className="h-3 bg-white/5 rounded w-24 mx-auto"></div>
            </div>
            <div>
              <div className="h-8 bg-white/10 rounded w-16 mx-auto mb-2"></div>
              <div className="h-3 bg-white/5 rounded w-24 mx-auto"></div>
            </div>
          </div>
        </div>
        {/* Skeleton for chart */}
        <div className="glass rounded-2xl p-8 min-h-[500px]">
          <div className="animate-pulse">
            <div className="h-8 bg-white/10 rounded w-1/3 mb-6"></div>
            <div className="h-4 bg-white/5 rounded w-48 mb-6"></div>
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-20 h-4 bg-white/5 rounded"></div>
                  <div className="flex-1 h-10 bg-white/5 rounded-lg"></div>
                  <div className="w-24 h-6 bg-white/5 rounded-lg"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!data.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center min-h-[500px] flex items-center justify-center">
        <p className="text-gray-400">No rug data available yet</p>
      </div>
    );
  }

  const maxCount = data.length > 0 ? Math.max(...data.map((d) => d.uniqueValidators)) : 0;

  return (
    <>
      {/* Global Stats Header - Separate from chart */}
      <div className="glass rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 shadow-2xl shadow-black/20 mb-6">
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl font-bold text-white">{globalStats.totalEpochsTracked}</div>
            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">
              Epochs Tracked
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-red-400">{globalStats.peakRugs}</div>
            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">
              Peak Unique Rugs
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-cyan-400">
              {globalStats.avgPerEpoch}
            </div>
            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">
              Avg per Epoch
            </div>
          </div>
        </div>
        {repeatOffenders > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <p className="text-sm text-gray-400">
              ⚠️ {repeatOffenders} validators rugged in multiple epochs (repeat offenders)
            </p>
          </div>
        )}
      </div>

      {/* Chart Section */}
      <div className="glass rounded-2xl p-8 min-h-[500px]">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          🚨 Rugs per Epoch
        </h2>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-red-500 to-red-600"></div>
            <span className="text-xs text-gray-400">Inflation Commission</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-purple-500 to-purple-600"></div>
            <span className="text-xs text-gray-400">MEV Commission</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-cyan-500 to-cyan-600"></div>
            <span className="text-xs text-gray-400">Both</span>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="space-y-2 relative">
        {pageLoading && (
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] rounded-lg z-10 pointer-events-none"></div>
        )}
        {data.map((item) => (
          <div key={item.epoch}>
            <button
              onClick={() => loadEpochEvents(item.epoch)}
              className="w-full group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {/* Epoch Label */}
                <div
                  className={`w-20 text-right text-sm font-mono transition-colors ${
                    selectedEpoch === item.epoch
                      ? "text-cyan-400 font-bold"
                      : "text-gray-400 group-hover:text-cyan-400"
                  }`}
                >
                  {item.epoch}
                </div>

                {/* Stacked Bar - shows commission (only), MEV (only), and both */}
                <div className="flex-1 relative">
                  <div
                    className={`h-10 bg-white/5 rounded-lg overflow-hidden transition-all ${
                      selectedEpoch === item.epoch
                        ? "ring-2 ring-cyan-500/50"
                        : ""
                    }`}
                  >
                    {/* Stacked segments */}
                    <div className="h-full flex items-stretch">
                      {/* Commission only (validators who ONLY rugged commission, not MEV) */}
                      {item.commissionValidators - item.bothTypes > 0 && (
                        <div
                          className="bg-gradient-to-r from-red-500/80 to-red-600/80 transition-all duration-300 group-hover:from-red-400 group-hover:to-red-500 flex items-center justify-center"
                          style={{
                            width: `${((item.commissionValidators - item.bothTypes) / maxCount) * 100}%`,
                            minWidth: "2rem",
                          }}
                          title={`${item.commissionValidators - item.bothTypes} inflation commission only`}
                        >
                          <span className="text-white font-bold text-xs">
                            {item.commissionValidators - item.bothTypes}
                          </span>
                        </div>
                      )}
                      
                      {/* MEV only (validators who ONLY rugged MEV, not commission) */}
                      {item.mevValidators - item.bothTypes > 0 && (
                        <div
                          className="bg-gradient-to-r from-purple-500/80 to-purple-600/80 transition-all duration-300 group-hover:from-purple-400 group-hover:to-purple-500 flex items-center justify-center"
                          style={{
                            width: `${((item.mevValidators - item.bothTypes) / maxCount) * 100}%`,
                            minWidth: "2rem",
                          }}
                          title={`${item.mevValidators - item.bothTypes} MEV commission only`}
                        >
                          <span className="text-white font-bold text-xs">
                            {item.mevValidators - item.bothTypes}
                          </span>
                        </div>
                      )}
                      
                      {/* Both (validators who rugged BOTH commission and MEV in this epoch) */}
                      {item.bothTypes > 0 && (
                        <div
                          className="bg-gradient-to-r from-cyan-500/80 to-cyan-600/80 transition-all duration-300 group-hover:from-cyan-400 group-hover:to-cyan-500 flex items-center justify-center"
                          style={{
                            width: `${(item.bothTypes / maxCount) * 100}%`,
                            minWidth: "2rem",
                          }}
                          title={`${item.bothTypes} rugged both inflation commission and MEV commission`}
                        >
                          <span className="text-white font-bold text-xs">
                            {item.bothTypes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Count Badge */}
                <div className="w-36 text-left">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      selectedEpoch === item.epoch
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        : "bg-red-500/20 text-red-300 border border-red-500/30 group-hover:bg-red-500/30"
                    }`}
                  >
                    {item.uniqueValidators} total {item.uniqueValidators === 1 ? "rug" : "rugs"}
                  </span>
                </div>
              </div>
            </button>

            {/* Expanded Details */}
            {selectedEpoch === item.epoch && (
              <div className="mt-3 mb-4 ml-0 sm:ml-8 md:ml-24 mr-0 sm:mr-8 md:mr-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                {loadingEvents ? (
                  <div className="p-4 sm:p-6 text-center">
                    <div className="inline-flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400">Loading details...</span>
                    </div>
                  </div>
                ) : epochEvents.length === 0 ? (
                  <div className="p-4 sm:p-6 text-center text-gray-400">
                    No events found for this epoch
                  </div>
                ) : (
                  <>
                    {/* Mobile: Card Layout */}
                    <div className="sm:hidden divide-y divide-white/5">
                      {epochEvents.map((event) => {
                        const globalRugCount = globalValidatorRugCounts[event.vote_pubkey] || 0;
                        const isRepeatOffender = globalRugCount > 1;
                        return (
                          <a
                            key={event.id}
                            href={`/validator/${event.vote_pubkey}`}
                            className={`block p-3 hover:bg-white/5 transition-colors ${
                              isRepeatOffender ? 'bg-cyan-500/5' : ''
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {event.icon_url ? (
                                <img
                                  src={event.icon_url}
                                  alt=""
                                  width={24}
                                  height={24}
                                  className="w-6 h-6 rounded object-cover border border-white/10 flex-shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    const fallback = e.currentTarget.nextElementSibling;
                                    if (fallback) fallback.classList.remove("hidden");
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-6 h-6 rounded bg-gradient-to-br from-cyan-500/20 to-cyan-500/30 border border-white/10 flex items-center justify-center flex-shrink-0 ${
                                  event.icon_url ? "hidden" : ""
                                }`}
                              >
                                <span className="text-xs">🔷</span>
                              </div>
                              <span className="text-sm font-medium text-white truncate flex-1">
                                {event.name || event.vote_pubkey.slice(0, 12) + '...'}
                              </span>
                              {isRepeatOffender && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-semibold border border-cyan-500/30 flex-shrink-0">
                                  {globalRugCount}x
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span
                                className={`px-1.5 py-0.5 rounded font-semibold ${
                                  event.rug_type === 'COMMISSION'
                                    ? 'bg-red-500/20 text-red-300'
                                    : 'bg-purple-500/20 text-purple-300'
                                }`}
                              >
                                {event.rug_type === 'COMMISSION' ? 'Inflation' : 'MEV'}
                              </span>
                              <span className="text-gray-400">
                                {event.rug_type === 'MEV' && event.from_disabled ? 'Off' : `${event.from_commission}%`}
                                {' → '}
                                <span className="text-red-400 font-semibold">
                                  {event.rug_type === 'MEV' && event.to_disabled ? 'Off' : `${event.to_commission}%`}
                                </span>
                              </span>
                              <span className="text-red-400 font-semibold">+{event.delta}%</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                    
                    {/* Desktop: Table Layout */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-white/5 border-b border-white/10">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">
                              Validator
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">
                              Commission
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">
                              Change
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {epochEvents.map((event) => {
                            // Use GLOBAL rug count, not page-specific count
                            const globalRugCount = globalValidatorRugCounts[event.vote_pubkey] || 0;
                            const isRepeatOffender = globalRugCount > 1;
                            return (
                            <tr
                              key={event.id}
                              className={`hover:bg-white/5 transition-colors ${
                                isRepeatOffender ? 'bg-cyan-500/5' : ''
                              }`}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`/validator/${event.vote_pubkey}`}
                                    className="flex items-center gap-2 hover:text-cyan-400 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {event.icon_url ? (
                                      <img
                                        src={event.icon_url}
                                        alt=""
                                        width={32}
                                        height={32}
                                        className="w-8 h-8 rounded-lg object-cover border border-white/10"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none";
                                          const fallback =
                                            e.currentTarget.nextElementSibling;
                                          if (fallback) {
                                            fallback.classList.remove("hidden");
                                          }
                                        }}
                                      />
                                    ) : null}
                                    <div
                                      className={`w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/30 border border-white/10 flex items-center justify-center ${
                                        event.icon_url ? "hidden" : ""
                                      }`}
                                    >
                                      <span className="text-sm">🔷</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-white">
                                        {event.name ||
                                          event.vote_pubkey.slice(0, 8)}
                                      </span>
                                      {isRepeatOffender && (
                                        <span 
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-semibold border border-cyan-500/30"
                                          title={`Rugged in ${globalRugCount} total epochs (across all time)`}
                                        >
                                          ⚠️ {globalRugCount}x
                                        </span>
                                      )}
                                    </div>
                                  </a>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                                    event.rug_type === 'COMMISSION'
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  }`}
                                >
                                  {event.rug_type === 'COMMISSION' ? 'Inflation Commission' : 'MEV Commission'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-400">
                                    {event.rug_type === 'MEV' && event.from_disabled
                                      ? 'MEV Disabled'
                                      : `${event.from_commission}%`}
                                  </span>
                                  <span className="text-gray-600">→</span>
                                  <span className="text-red-400 font-semibold">
                                    {event.rug_type === 'MEV' && event.to_disabled
                                      ? 'MEV Disabled'
                                      : `${event.to_commission}%`}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm font-semibold text-red-400">
                                  +{event.delta}%
                                </span>
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        </div>

        {/* Pagination Controls */}
        <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-center gap-3 relative">
          {pageLoading && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={data.length < epochsPerPage || pageLoading}
            className="px-4 py-2 rounded bg-white/5 border border-white/10 text-white text-sm font-semibold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Older
          </button>
          <span className="text-sm text-gray-400 min-w-[140px] text-center">
            {page === 0 ? 'Most Recent' : `${page * epochsPerPage + 1}-${(page + 1) * epochsPerPage} epochs ago`}
          </span>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || pageLoading}
            className="px-4 py-2 rounded bg-white/5 border border-white/10 text-white text-sm font-semibold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Newer →
          </button>
        </div>
      </div>
    </>
  );
}

