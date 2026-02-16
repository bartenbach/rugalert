"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface EpochData {
  epoch: number;
  uniqueValidators: number;
  commissionValidators: number;
  mevValidators: number;
  totalEvents: number;
  commissionEvents: number;
  mevEvents: number;
  bothTypes: number;
}

interface RugEvent {
  id: string;
  vote_pubkey: string;
  name?: string | null;
  icon_url?: string | null;
  type: string;
  rug_type: "COMMISSION" | "MEV";
  from_commission: number;
  to_commission: number;
  from_disabled?: boolean;
  to_disabled?: boolean;
  delta: number;
  epoch: number;
  created_at?: string;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-[#1a1a2e] border border-white/20 rounded-lg px-3 py-2.5 shadow-xl text-xs">
      <div className="font-bold text-white mb-1.5">Epoch {data.epoch}</div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400">Total rugs</span>
          <span className="text-white font-semibold">
            {data.uniqueValidators}
          </span>
        </div>
        {data.commissionValidators > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-red-500"></span>
              <span className="text-gray-400">Inflation</span>
            </div>
            <span className="text-red-300 font-semibold">
              {data.commissionValidators}
            </span>
          </div>
        )}
        {data.mevValidators > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-purple-500"></span>
              <span className="text-gray-400">MEV</span>
            </div>
            <span className="text-purple-300 font-semibold">
              {data.mevValidators}
            </span>
          </div>
        )}
        {data.bothTypes > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-gray-500">Both types</span>
            <span className="text-cyan-300 font-semibold">
              {data.bothTypes}
            </span>
          </div>
        )}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-white/10 text-gray-500 text-[10px]">
        Click to view details
      </div>
    </div>
  );
}

export default function RugsPerEpochChart() {
  const [data, setData] = useState<EpochData[]>([]);
  const [globalValidatorRugCounts, setGlobalValidatorRugCounts] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null);
  const [epochEvents, setEpochEvents] = useState<RugEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [globalStats, setGlobalStats] = useState<{
    totalEpochsTracked: number;
    peakRugs: number;
    avgPerEpoch: number;
  }>({ totalEpochsTracked: 0, peakRugs: 0, avgPerEpoch: 0 });

  useEffect(() => {
    async function load() {
      try {
        // Fetch a large range to get all historical data
        const res = await fetch(`/api/rugs-per-epoch?epochs=500&offset=0`, {
          cache: "no-store",
        });
        const json = await res.json();

        // Fill in zero-epochs between the min and max so the chart has no gaps
        const rawData: EpochData[] = json.data || [];
        if (rawData.length > 0) {
          const minEpoch = rawData[0].epoch;
          const maxEpoch = rawData[rawData.length - 1].epoch;
          const dataMap = new Map(rawData.map((d) => [d.epoch, d]));

          const filled: EpochData[] = [];
          for (let e = minEpoch; e <= maxEpoch; e++) {
            filled.push(
              dataMap.get(e) || {
                epoch: e,
                uniqueValidators: 0,
                commissionValidators: 0,
                mevValidators: 0,
                totalEvents: 0,
                commissionEvents: 0,
                mevEvents: 0,
                bothTypes: 0,
              }
            );
          }
          setData(filled);
        } else {
          setData([]);
        }

        setGlobalValidatorRugCounts(
          json.meta?.globalValidatorRugCounts || {}
        );
        if (json.meta) {
          setGlobalStats({
            totalEpochsTracked: json.meta.globalTotalEpochsTracked || 0,
            peakRugs: json.meta.globalPeakRugs || 0,
            avgPerEpoch: json.meta.globalAvgPerEpoch || 0,
          });
        }
      } catch (error) {
        console.error("Failed to load rugs per epoch:", error);
      } finally {
        setLoading(false);
      }
    }
    load();

    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  async function handleChartClick(data: any) {
    if (!data?.activePayload?.[0]?.payload) return;
    const epoch = data.activePayload[0].payload.epoch;
    const count = data.activePayload[0].payload.uniqueValidators;

    if (count === 0) {
      setSelectedEpoch(null);
      setEpochEvents([]);
      return;
    }

    if (selectedEpoch === epoch) {
      setSelectedEpoch(null);
      setEpochEvents([]);
      return;
    }

    setSelectedEpoch(epoch);
    setLoadingEvents(true);
    try {
      const res = await fetch(`/api/epoch-events/${epoch}?t=${Date.now()}`, {
        cache: "no-store",
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="animate-pulse grid grid-cols-3 gap-6 text-center">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="h-8 bg-white/10 rounded w-16 mx-auto mb-2"></div>
                <div className="h-3 bg-white/5 rounded w-24 mx-auto"></div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-6 h-[350px]">
          <div className="animate-pulse h-full bg-white/5 rounded-lg"></div>
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

  return (
    <div className="space-y-4">
      {/* Global Stats */}
      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
              {globalStats.totalEpochsTracked}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-medium mt-0.5">
              Epochs Tracked
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-red-400 tabular-nums">
              {globalStats.peakRugs}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-medium mt-0.5">
              Peak Rugs / Epoch
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-cyan-400 tabular-nums">
              {globalStats.avgPerEpoch}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-medium mt-0.5">
              Avg per Epoch
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="glass rounded-2xl border border-white/10 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Rugs per Epoch
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Click any data point to see individual rugs
            </p>
          </div>
        </div>

        <div className="h-[280px] sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              onClick={handleChartClick}
              style={{ cursor: "pointer" }}
            >
              <defs>
                <linearGradient id="rugGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="epoch"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: "rgba(6,182,212,0.3)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              <Area
                type="monotone"
                dataKey="uniqueValidators"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#rugGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "#06b6d4",
                  stroke: "#1a1a2e",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected Epoch Details */}
      {selectedEpoch !== null && (
        <div className="glass rounded-2xl border border-cyan-500/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 bg-cyan-500/[0.03]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                Epoch {selectedEpoch}
              </h3>
              <span className="text-xs text-gray-500">
                {epochEvents.length} rug{epochEvents.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedEpoch(null);
                setEpochEvents([]);
              }}
              className="text-gray-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-all"
            >
              Close
            </button>
          </div>

          {loadingEvents ? (
            <div className="p-6 text-center">
              <div className="inline-flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-400 text-sm">
                  Loading details...
                </span>
              </div>
            </div>
          ) : epochEvents.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No events found for this epoch
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {epochEvents.map((event) => {
                const globalRugCount =
                  globalValidatorRugCounts[event.vote_pubkey] || 0;
                const isRepeatOffender = globalRugCount > 1;
                return (
                  <a
                    key={event.id}
                    href={`/validator/${event.vote_pubkey}`}
                    className={`flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-white/[0.03] transition-colors ${
                      isRepeatOffender ? "bg-cyan-500/[0.02]" : ""
                    }`}
                  >
                    {/* Avatar */}
                    {event.icon_url ? (
                      <img
                        src={event.icon_url}
                        alt=""
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-lg object-cover border border-white/10 flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          const fallback = e.currentTarget.nextElementSibling;
                          if (fallback) fallback.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/30 border border-white/10 flex items-center justify-center flex-shrink-0 ${
                        event.icon_url ? "hidden" : ""
                      }`}
                    >
                      <span className="text-xs">&#128311;</span>
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {event.name || event.vote_pubkey.slice(0, 12) + "..."}
                        </span>
                        {isRepeatOffender && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30 shrink-0">
                            {globalRugCount}x
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Type badge */}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 ${
                        event.rug_type === "COMMISSION"
                          ? "bg-red-500/15 text-red-300 border border-red-500/30"
                          : "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                      }`}
                    >
                      {event.rug_type === "COMMISSION" ? "Inflation" : "MEV"}
                    </span>

                    {/* Commission change */}
                    <div className="text-xs text-right shrink-0 w-24">
                      <span className="text-gray-400">
                        {event.rug_type === "MEV" && event.from_disabled
                          ? "Off"
                          : `${event.from_commission}%`}
                      </span>
                      <span className="text-gray-600 mx-1">&rarr;</span>
                      <span className="text-red-400 font-semibold">
                        {event.rug_type === "MEV" && event.to_disabled
                          ? "Off"
                          : `${event.to_commission}%`}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
