"use client";

import { useEffect, useState } from "react";

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
  delta: number;
  epoch: number;
  created_at?: string;
}

export default function RugsPerEpochChart() {
  const [data, setData] = useState<EpochData[]>([]);
  const [repeatOffenders, setRepeatOffenders] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null);
  const [epochEvents, setEpochEvents] = useState<RugEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Get epochs from URL params (default 10, same as dashboard)
        const urlParams = new URLSearchParams(window.location.search);
        const epochs = urlParams.get("epochs") || "10";
        const res = await fetch(`/api/rugs-per-epoch?epochs=${epochs}`);
        const json: ApiResponse = await res.json();
        setData(json.data || []);
        setRepeatOffenders(json.meta?.repeatOffenders || 0);
      } catch (error) {
        console.error("Failed to load rugs per epoch:", error);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Reload when window location changes (epoch filter changes)
    const interval = setInterval(load, 30000); // Also refresh every 30s
    return () => clearInterval(interval);
  }, []);

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
      const res = await fetch(`/api/epoch-events/${epoch}`);
      const json = await res.json();
      setEpochEvents(json.items || []);
    } catch (error) {
      console.error("Failed to load epoch events:", error);
      setEpochEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-white/10 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-gray-400">No rug data available yet</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.uniqueValidators));
  const totalUniqueValidators = data.reduce((sum, d) => sum + d.uniqueValidators, 0);

  return (
    <div className="glass rounded-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🚨 Rugs per Epoch
          </h2>
          {/* Legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-red-500 to-red-600"></div>
              <span className="text-xs text-gray-400">Inflation Commission</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-purple-500 to-purple-600"></div>
              <span className="text-xs text-gray-400">MEV Commission</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-orange-500 to-orange-600"></div>
              <span className="text-xs text-gray-400">Both</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-red-400">{totalUniqueValidators}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Total Unique Validators
          </div>
          {repeatOffenders > 0 && (
            <div className="text-xs text-orange-400 mt-1 font-semibold">
              {repeatOffenders} repeat offenders
            </div>
          )}
        </div>
      </div>

      {/* Bar Chart */}
      <div className="space-y-2">
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
                      ? "text-orange-400 font-bold"
                      : "text-gray-400 group-hover:text-orange-400"
                  }`}
                >
                  {item.epoch}
                </div>

                {/* Stacked Bar - shows commission (only), MEV (only), and both */}
                <div className="flex-1 relative">
                  <div
                    className={`h-10 bg-white/5 rounded-lg overflow-hidden transition-all ${
                      selectedEpoch === item.epoch
                        ? "ring-2 ring-orange-500/50"
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
                          title={`${item.commissionValidators - item.bothTypes} commission only`}
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
                          title={`${item.mevValidators - item.bothTypes} MEV only`}
                        >
                          <span className="text-white font-bold text-xs">
                            {item.mevValidators - item.bothTypes}
                          </span>
                        </div>
                      )}
                      
                      {/* Both (validators who rugged BOTH commission and MEV in this epoch) */}
                      {item.bothTypes > 0 && (
                        <div
                          className="bg-gradient-to-r from-orange-500/80 to-orange-600/80 transition-all duration-300 group-hover:from-orange-400 group-hover:to-orange-500 flex items-center justify-center"
                          style={{
                            width: `${(item.bothTypes / maxCount) * 100}%`,
                            minWidth: "2rem",
                          }}
                          title={`${item.bothTypes} rugged both commission and MEV`}
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
                        ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
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
              <div className="mt-3 mb-4 ml-24 mr-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                {loadingEvents ? (
                  <div className="p-6 text-center">
                    <div className="inline-flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400">Loading details...</span>
                    </div>
                  </div>
                ) : epochEvents.length === 0 ? (
                  <div className="p-6 text-center text-gray-400">
                    No events found for this epoch
                  </div>
                ) : (
                  <div className="overflow-x-auto">
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
                        {epochEvents.map((event) => (
                          <tr
                            key={event.id}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <a
                                  href={`/validator/${event.vote_pubkey}`}
                                  className="flex items-center gap-2 hover:text-orange-400 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {event.icon_url ? (
                                    <img
                                      src={event.icon_url}
                                      alt=""
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
                                    className={`w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-500/30 border border-white/10 flex items-center justify-center ${
                                      event.icon_url ? "hidden" : ""
                                    }`}
                                  >
                                    <span className="text-sm">🔷</span>
                                  </div>
                                  <span className="text-sm font-medium text-white">
                                    {event.name ||
                                      event.vote_pubkey.slice(0, 8)}
                                  </span>
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
                                  {event.from_commission}%
                                </span>
                                <span className="text-gray-600">→</span>
                                <span className="text-red-400 font-semibold">
                                  {event.to_commission}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-semibold text-red-400">
                                +{event.delta}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{data.length}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              Epochs Tracked
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{maxCount}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              Peak Unique Rugs
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">
              {(totalUniqueValidators / data.length).toFixed(1)}
            </div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              Avg per Epoch
            </div>
          </div>
        </div>
        {repeatOffenders > 0 && (
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-400">
              ⚠️ {repeatOffenders} validators rugged in multiple epochs (repeat offenders)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

