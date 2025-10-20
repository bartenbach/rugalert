"use client";
import CommissionChart from "@/components/CommissionChart";
import { useEffect, useState } from "react";

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
};

export default function Detail({ params }: { params: { votePubkey: string } }) {
  const [series, setSeries] = useState<{ epoch: number; commission: number }[]>(
    []
  );
  const [meta, setMeta] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    })();
  }, [params.votePubkey]);

  const currentCommission =
    series.length > 0 ? series[series.length - 1].commission : null;
  const minCommission =
    series.length > 0 ? Math.min(...series.map((s) => s.commission)) : null;
  const maxCommission =
    series.length > 0 ? Math.max(...series.map((s) => s.commission)) : null;
  const avgCommission =
    series.length > 0
      ? Math.round(
          series.reduce((acc, s) => acc + s.commission, 0) / series.length
        )
      : null;

  return (
    <div className="space-y-8">
      {/* Back Button */}
      <a
        href="/"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-orange-400 transition-colors"
      >
        <span>←</span>
        <span>Back to Dashboard</span>
      </a>

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
          <div className="glass rounded-2xl p-8 border border-white/10 shadow-sm card-shine">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              {meta?.avatarUrl ? (
                <div className="relative group">
                  <img
                    src={meta.avatarUrl}
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-white/10 group-hover:border-orange-500/30 transition-colors"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement?.nextElementSibling?.classList.remove(
                        "hidden"
                      );
                    }}
                  />
                </div>
              ) : null}
              <div
                className={`w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/30 border-2 border-white/10 flex items-center justify-center ${
                  meta?.avatarUrl ? "hidden" : ""
                }`}
              >
                <span className="text-4xl">🔷</span>
              </div>
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                  {meta?.name || "Unknown Validator"}
                </h1>
                <div className="flex items-center gap-2 text-gray-400 text-sm font-mono bg-white/5 rounded-lg px-4 py-2 inline-block border border-white/10">
                  <span className="text-gray-400">📋</span>
                  <span>{params.votePubkey}</span>
                </div>
              </div>
              {currentCommission !== null && (
                <div className="glass rounded-xl p-6 text-center min-w-[140px] border border-white/10 shadow-sm">
                  <div className="text-sm text-gray-400 mb-1">
                    Current Commission
                  </div>
                  <div className="text-4xl font-bold gradient-text">
                    {currentCommission}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          {series.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm card-shine hover:shadow-md hover:border-green-500/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <span>📉</span>
                  </div>
                  <div className="text-sm text-gray-400">Minimum</div>
                </div>
                <div className="text-3xl font-bold text-green-400">
                  {minCommission}%
                </div>
              </div>

              <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm card-shine hover:shadow-md hover:border-blue-500/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <span>📊</span>
                  </div>
                  <div className="text-sm text-gray-400">Average</div>
                </div>
                <div className="text-3xl font-bold text-blue-400">
                  {avgCommission}%
                </div>
              </div>

              <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm card-shine hover:shadow-md hover:border-red-500/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <span>📈</span>
                  </div>
                  <div className="text-sm text-gray-400">Maximum</div>
                </div>
                <div className="text-3xl font-bold text-red-400">
                  {maxCommission}%
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="glass rounded-2xl p-8 border border-white/10 shadow-sm card-shine">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                Commission History
              </h2>
              <p className="text-gray-400 text-sm">
                Track how this validator's commission has changed over time
              </p>
            </div>
            {series.length > 0 ? (
              <CommissionChart data={series} />
            ) : (
              <div className="text-center py-12 text-gray-400">
                No commission history available
              </div>
            )}
          </div>

          {/* Commission Change Events Table */}
          {events.length > 0 && (
            <div className="glass rounded-2xl p-8 border border-white/10 shadow-sm card-shine">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Commission Change Events
                </h2>
                <p className="text-gray-400 text-sm">
                  All detected commission changes for this validator
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-400">
                        Status
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-400">
                        Commission
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-400">
                        Change
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-400">
                        Epoch
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr
                        key={event.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-4 px-4">
                          {event.type === "RUG" && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-semibold border border-red-500/20">
                              🚨 RUG
                            </span>
                          )}
                          {event.type === "CAUTION" && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-semibold border border-yellow-500/20">
                              ⚠️ Caution
                            </span>
                          )}
                          {event.type === "INFO" && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-semibold border border-blue-500/20">
                              📊 Info
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400">
                              {event.from_commission}%
                            </span>
                            <span className="text-gray-600">→</span>
                            <span className="text-white font-semibold">
                              {event.to_commission}%
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`text-sm font-semibold ${
                              event.delta > 0
                                ? "text-red-400"
                                : event.delta < 0
                                ? "text-green-400"
                                : "text-gray-400"
                            }`}
                          >
                            {event.delta > 0 ? "+" : ""}
                            {event.delta}%
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-sm text-gray-400 font-mono">
                            {event.epoch}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Additional Info */}
          <div className="glass rounded-xl p-6 border border-white/10 shadow-sm text-center">
            <p className="text-sm text-gray-400">
              Data spans {series.length} epochs • {events.length} commission
              changes detected • Updated in real-time
            </p>
          </div>
        </>
      )}
    </div>
  );
}
