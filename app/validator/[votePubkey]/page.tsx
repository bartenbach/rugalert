"use client";
import CommissionChart from "@/components/CommissionChart";
import StakeChart from "@/components/StakeChart";
import UptimeChart from "@/components/UptimeChart";
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

// Circular Progress Gauge Component with dynamic coloring
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
  sublabel?: string;
  size?: number;
  thresholds?: { good: number; warning: number }; // e.g., { good: 90, warning: 75 }
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 45; // radius = 45
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
    green: { stroke: "stroke-green-500", text: "text-green-400" },
    yellow: { stroke: "stroke-yellow-500", text: "text-yellow-400" },
    orange: { stroke: "stroke-orange-500", text: "text-orange-400" },
    red: { stroke: "stroke-red-500", text: "text-red-400" },
    purple: { stroke: "stroke-purple-500", text: "text-purple-400" },
  };

  const colors = colorClasses[color];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r="45"
            fill="none"
            className={colors.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`text-xl font-bold ${colors.text}`}>
            {value.toFixed(1)}
            {max === 100 && "%"}
          </div>
          {sublabel && (
            <div className="text-[10px] text-gray-500 mt-0.5">{sublabel}</div>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-400 mt-2 text-center font-medium">
        {label}
      </div>
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
  const [meta, setMeta] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [validatorInfo, setValidatorInfo] = useState<ValidatorInfo | null>(
    null
  );
  const [uptimePercentage, setUptimePercentage] = useState<number | null>(null);
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
      console.log("📊 Stake History Response:", shj);
      console.log("📊 Stake History Data:", shj.history);
      console.log("📊 Stake History Length:", shj.history?.length || 0);
      setStakeHistory(shj.history || []);

      // Fetch uptime data
      try {
        const u = await fetch(`/api/uptime/${params.votePubkey}`);
        const uj = await u.json();
        if (uj.days && uj.days.length > 0) {
          // Calculate average uptime from available data
          const totalMinutes = uj.days.reduce(
            (sum: number, day: any) => sum + day.totalChecks,
            0
          );
          const totalDowntime = uj.days.reduce(
            (sum: number, day: any) => sum + day.delinquentMinutes,
            0
          );
          const avgUptime =
            totalMinutes > 0 ? 100 - (totalDowntime / totalMinutes) * 100 : 100;
          setUptimePercentage(avgUptime);
        }
      } catch (err) {
        console.error("Failed to fetch uptime:", err);
        setUptimePercentage(null);
      }

      setLoading(false);
    })();
  }, [params.votePubkey]);

  const currentCommission =
    series.length > 0 ? series[series.length - 1].commission : null;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => {
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
          {/* Validator Header - Compact */}
          <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="flex-shrink-0">
                {meta?.avatarUrl ? (
                  <img
                    src={meta.avatarUrl}
                    className="w-20 h-20 rounded-xl object-cover border-2 border-white/10"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl border-2 border-white/10 bg-white/5"></div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <h1 className="text-3xl font-bold text-white">
                    {meta?.name ? (
                      <span>
                        {meta.name
                          .split(/([\u{1F300}-\u{1F9FF}])/u)
                          .map((part, i) => {
                            // Check if part is an emoji
                            if (/[\u{1F300}-\u{1F9FF}]/u.test(part)) {
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

                {/* Website */}
                {meta?.website && (
                  <div className="mb-3">
                    <a
                      href={meta.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 hover:text-orange-300 text-sm hover:underline inline-flex items-center gap-1.5"
                    >
                      <span className="emoji">🌐</span>
                      <span>{meta.website}</span>
                    </a>
                  </div>
                )}

                {/* Inline Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-500">Commission:</span>
                    <span className="text-white font-semibold">
                      {currentCommission !== null
                        ? `${currentCommission}%`
                        : "—"}
                    </span>
                  </div>
                  {validatorInfo?.stake && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500">Stake:</span>
                      <span className="text-white font-semibold">
                        {(validatorInfo.stake.activeStake / 1000000).toFixed(2)}
                        M SOL
                      </span>
                    </div>
                  )}
                  {validatorInfo?.validator?.version && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500">Version:</span>
                      <span className="text-white font-mono font-semibold text-xs">
                        {validatorInfo.validator.version}
                      </span>
                    </div>
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
                      <span className="text-gray-500">Identity:</span>
                      <span className="truncate max-w-[200px]">
                        {validatorInfo.validator.identityPubkey}
                      </span>
                      {copiedIdentity ? "✓" : "📋"}
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
                    <span className="text-gray-500">Vote:</span>
                    <span className="truncate max-w-[200px]">
                      {params.votePubkey}
                    </span>
                    {copiedVote ? "✓" : "📋"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Gauges */}
          {validatorInfo && (
            <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm">
              <h2 className="text-lg font-bold text-white mb-6">
                Current Performance
                <span className="text-sm text-gray-400 ml-2 font-normal">
                  Epoch {validatorInfo.currentEpoch}
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {validatorInfo.performance && (
                  <>
                    <CircularGauge
                      value={100 - validatorInfo.performance.skipRate}
                      label="Block Success"
                      thresholds={{ good: 95, warning: 85 }}
                    />
                    <CircularGauge
                      value={validatorInfo.performance.voteCreditsPercentage}
                      label="Vote Performance"
                      sublabel={`${validatorInfo.performance.voteCredits.toLocaleString()} credits`}
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
                      uptimePercentage < 100 ? "Collecting data" : undefined
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Active Stake</div>
                <div className="text-2xl font-bold text-white">
                  {(validatorInfo.stake.activeStake / 1000000).toFixed(2)}M
                </div>
                <div className="text-xs text-gray-500 mt-1">SOL</div>
              </div>
              <div className="glass rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Activating</div>
                <div className="text-2xl font-bold text-green-400">
                  {validatorInfo.stake.activatingStake >= 1000000
                    ? `${(
                        validatorInfo.stake.activatingStake / 1000000
                      ).toFixed(2)}M`
                    : validatorInfo.stake.activatingStake >= 1000
                    ? `${(validatorInfo.stake.activatingStake / 1000).toFixed(
                        2
                      )}K`
                    : validatorInfo.stake.activatingStake.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">SOL</div>
              </div>
              <div className="glass rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Deactivating</div>
                <div className="text-2xl font-bold text-red-400">
                  {validatorInfo.stake.deactivatingStake >= 1000000
                    ? `${(
                        validatorInfo.stake.deactivatingStake / 1000000
                      ).toFixed(2)}M`
                    : validatorInfo.stake.deactivatingStake >= 1000
                    ? `${(validatorInfo.stake.deactivatingStake / 1000).toFixed(
                        2
                      )}K`
                    : validatorInfo.stake.deactivatingStake.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">SOL</div>
              </div>
            </div>
          )}

          {/* Uptime Chart */}
          <UptimeChart votePubkey={params.votePubkey} />

          {/* Stake History Chart */}
          <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm">
            <h2 className="text-lg font-bold text-white mb-4">Stake History</h2>
            {stakeHistory.length > 0 ? (
              <StakeChart data={stakeHistory} />
            ) : (
              <div className="text-center py-12 text-gray-400">
                No stake history available yet
              </div>
            )}
          </div>

          {/* Commission History - Simplified */}
          {series.length > 0 && (
            <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm">
              <h2 className="text-lg font-bold text-white mb-4">
                Commission History
              </h2>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-1">Current</div>
                  <div className="text-2xl font-bold text-white">
                    {currentCommission}%
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-1">Minimum</div>
                  <div className="text-2xl font-bold text-green-400">
                    {Math.min(...series.map((s) => s.commission))}%
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-1">Maximum</div>
                  <div className="text-2xl font-bold text-red-400">
                    {Math.max(...series.map((s) => s.commission))}%
                  </div>
                </div>
              </div>
              <CommissionChart data={series} />
            </div>
          )}

          {/* Commission Change Events Table - Only if events exist */}
          {events.length > 0 && (
            <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm">
              <h2 className="text-lg font-bold text-white mb-4">
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
