"use client";
import CommissionChart from "@/components/CommissionChart";
import StakeChart from "@/components/StakeChart";
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

type ValidatorInfo = {
  validator: {
    votePubkey: string;
    identityPubkey: string;
    name?: string;
    iconUrl?: string;
    website?: string;
    version?: string;
    delinquent?: boolean;
  };
  performance: {
    skipRate: number;
    voteCredits: number;
    voteCreditsPercentage: number;
    slotsElapsed: number;
    maxPossibleCredits: number;
    epoch: number;
  } | null;
  stake: {
    activeStake: number;
    activatingStake: number;
    deactivatingStake: number;
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

export default function Detail({ params }: { params: { votePubkey: string } }) {
  const [series, setSeries] = useState<{ epoch: number; commission: number }[]>(
    []
  );
  const [stakeHistory, setStakeHistory] = useState<StakeHistory[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [validatorInfo, setValidatorInfo] = useState<ValidatorInfo | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [copiedIdentity, setCopiedIdentity] = useState(false);
  const [copiedVote, setCopiedVote] = useState(false);

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
      <button
        onClick={() => {
          // Try to go back, but if no history (direct link), go to validators page
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = "/validators";
          }
        }}
        className="inline-flex items-center gap-2 text-gray-400 hover:text-orange-400 transition-colors"
      >
        <span>←</span>
        <span>Back to Validators</span>
      </button>

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
                <div className="relative group flex-shrink-0">
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
                className={`w-24 h-24 flex-shrink-0 rounded-2xl border-2 border-white/10 flex items-center justify-center ${
                  meta?.avatarUrl ? "hidden" : ""
                }`}
              ></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold gradient-text break-all">
                    {meta?.name || params.votePubkey}
                  </h1>
                  {validatorInfo?.validator?.delinquent && (
                    <span className="px-3 py-1 bg-red-500/20 border-2 border-red-500 rounded-lg text-sm font-bold text-red-400 whitespace-nowrap animate-pulse">
                      🚨 DELINQUENT
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {/* Identity Pubkey */}
                  {validatorInfo?.validator?.identityPubkey && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          validatorInfo.validator.identityPubkey
                        );
                        setCopiedIdentity(true);
                        setTimeout(() => {
                          setCopiedIdentity(false);
                        }, 2000);
                      }}
                      className={`flex items-center gap-2 text-gray-400 text-sm font-mono rounded-lg px-4 py-2 border transition-all cursor-pointer group ${
                        copiedIdentity
                          ? "bg-green-500/20 border-green-500"
                          : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-400"
                      }`}
                      title="Click to copy Identity Pubkey"
                    >
                      <span className="text-gray-500 font-semibold">
                        Identity:
                      </span>
                      <span className="flex-1 text-left">
                        {validatorInfo.validator.identityPubkey}
                      </span>
                      {copiedIdentity ? (
                        <span className="text-green-400 font-semibold">
                          ✓ Copied!
                        </span>
                      ) : (
                        <span className="text-gray-600 group-hover:text-orange-400 transition-colors">
                          📋
                        </span>
                      )}
                    </button>
                  )}

                  {/* Vote Pubkey */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(params.votePubkey);
                      setCopiedVote(true);
                      setTimeout(() => {
                        setCopiedVote(false);
                      }, 2000);
                    }}
                    className={`flex items-center gap-2 text-gray-400 text-sm font-mono rounded-lg px-4 py-2 border transition-all cursor-pointer group ${
                      copiedVote
                        ? "bg-green-500/20 border-green-500"
                        : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-400"
                    }`}
                    title="Click to copy Vote Pubkey"
                  >
                    <span className="text-gray-500 font-semibold">Vote:</span>
                    <span className="flex-1 text-left">
                      {params.votePubkey}
                    </span>
                    {copiedVote ? (
                      <span className="text-green-400 font-semibold">
                        ✓ Copied!
                      </span>
                    ) : (
                      <span className="text-gray-600 group-hover:text-orange-400 transition-colors">
                        📋
                      </span>
                    )}
                  </button>
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

          {/* Stats Grid - Commission History */}
          {series.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm card-shine hover:shadow-md hover:border-green-500/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <span>📉</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Minimum Commission
                  </div>
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
                  <div className="text-sm text-gray-400">
                    Average Commission
                  </div>
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
                  <div className="text-sm text-gray-400">
                    Maximum Commission
                  </div>
                </div>
                <div className="text-3xl font-bold text-red-400">
                  {maxCommission}%
                </div>
              </div>
            </div>
          )}

          {/* Validator Info - Performance & Stake */}
          {validatorInfo && (
            <div className="glass rounded-2xl p-8 border border-white/10 shadow-sm">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Current Performance & Stake
                </h2>
                <p className="text-gray-400 text-sm">
                  Real-time validator metrics for Epoch{" "}
                  {validatorInfo.currentEpoch}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Software Version */}
                <div className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-purple-500/30 transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-sm">
                      🔧
                    </div>
                    <div className="text-xs text-gray-400 font-medium">
                      Software Version
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-purple-400 font-mono">
                    {validatorInfo.validator.version || "Unknown"}
                  </div>
                </div>

                {/* Skip Rate */}
                {validatorInfo.performance && (
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-orange-500/30 transition-all">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-sm">
                        📡
                      </div>
                      <div className="text-xs text-gray-400 font-medium">
                        Skip Rate
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-orange-400">
                      {validatorInfo.performance.skipRate.toFixed(2)}%
                    </div>
                  </div>
                )}

                {/* Vote Performance */}
                {validatorInfo.performance && (
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-cyan-500/30 transition-all">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-sm">
                        🗳️
                      </div>
                      <div className="text-xs text-gray-400 font-medium">
                        Vote Performance
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-cyan-400">
                      {validatorInfo.performance.voteCreditsPercentage.toFixed(
                        1
                      )}
                      %
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {validatorInfo.performance.voteCredits.toLocaleString()} /{" "}
                      {validatorInfo.performance.maxPossibleCredits.toLocaleString()}{" "}
                      credits
                    </div>
                  </div>
                )}

                {/* Active Stake */}
                {validatorInfo.stake && (
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-green-500/30 transition-all">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-sm">
                        💎
                      </div>
                      <div className="text-xs text-gray-400 font-medium">
                        Active Stake
                      </div>
                    </div>
                    <div className="text-xl font-bold text-green-400">
                      {validatorInfo.stake.activeStake.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">SOL</div>
                  </div>
                )}
              </div>

              {/* Activating/Deactivating Stake (if present) */}
              {validatorInfo.stake &&
                (validatorInfo.stake.activatingStake > 0 ||
                  validatorInfo.stake.deactivatingStake > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    {validatorInfo.stake.activatingStake > 0 && (
                      <div className="bg-blue-500/5 rounded-xl p-5 border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">⬆️</span>
                          <div className="text-sm text-gray-400">
                            Activating Stake
                          </div>
                        </div>
                        <div className="text-xl font-bold text-blue-400">
                          {validatorInfo.stake.activatingStake.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 0 }
                          )}{" "}
                          SOL
                        </div>
                      </div>
                    )}

                    {validatorInfo.stake.deactivatingStake > 0 && (
                      <div className="bg-yellow-500/5 rounded-xl p-5 border border-yellow-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">⬇️</span>
                          <div className="text-sm text-gray-400">
                            Deactivating Stake
                          </div>
                        </div>
                        <div className="text-xl font-bold text-yellow-400">
                          {validatorInfo.stake.deactivatingStake.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 0 }
                          )}{" "}
                          SOL
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          )}

          {/* Commission Chart */}
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

          {/* Stake History Chart */}
          <div className="glass rounded-2xl p-8 border border-white/10 shadow-sm card-shine">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                Stake History
              </h2>
              <p className="text-gray-400 text-sm">
                Track how this validator's active stake has grown or declined
                over time
              </p>
            </div>
            {stakeHistory.length > 0 ? (
              <StakeChart data={stakeHistory} />
            ) : (
              <div className="text-center py-12 text-gray-400">
                No stake history available yet
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
                        <div className="flex items-center gap-1.5">
                          Detected
                          <span className="text-xs text-gray-500">↓</span>
                        </div>
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
                          {event.created_at ? (
                            <div
                              className="cursor-help"
                              title={`${new Date(
                                event.created_at
                              ).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              })} • Epoch ${event.epoch}`}
                            >
                              <div className="text-sm text-white font-medium">
                                {getRelativeTime(event.created_at)}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">
                                Epoch {event.epoch}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 font-mono">
                              Epoch {event.epoch}
                            </span>
                          )}
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
