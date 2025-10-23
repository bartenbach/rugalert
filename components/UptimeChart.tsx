"use client";
import { useEffect, useState } from "react";

interface UptimeDay {
  date: string;
  uptimeChecks: number;
  delinquentChecks: number;
  uptimePercent: number;
}

interface UptimeData {
  days: UptimeDay[];
  overallUptime: number;
  totalChecks: number;
  totalDelinquent: number;
  daysTracked: number;
}

interface UptimeChartProps {
  votePubkey: string;
}

export default function UptimeChart({ votePubkey }: UptimeChartProps) {
  const [data, setData] = useState<UptimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUptime() {
      try {
        setLoading(true);
        const response = await fetch(`/api/uptime/${votePubkey}`);
        if (!response.ok) throw new Error("Failed to fetch uptime data");
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        console.error("Error fetching uptime:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (votePubkey) {
      fetchUptime();
    }
  }, [votePubkey]);

  // Determine color based on uptime percentage
  const getUptimeColor = (uptimePercent: number) => {
    if (uptimePercent >= 99) return "bg-green-500";
    if (uptimePercent >= 95) return "bg-yellow-400";
    if (uptimePercent >= 90) return "bg-orange-500";
    return "bg-red-500";
  };

  // Format date for tooltip
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format downtime
  const formatDowntime = (delinquentChecks: number) => {
    if (delinquentChecks === 0) return "No downtime";
    if (delinquentChecks < 60) return `${delinquentChecks} min downtime`;
    const hours = Math.floor(delinquentChecks / 60);
    const mins = delinquentChecks % 60;
    return mins > 0 ? `${hours}h ${mins}m downtime` : `${hours}h downtime`;
  };

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Uptime</h3>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Uptime</h3>
        <div className="text-center text-gray-400 py-8">
          <p>Failed to load uptime data</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.days.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Uptime</h3>
        <div className="text-center text-gray-400 py-8">
          <p>Collecting uptime data...</p>
          <p className="text-sm text-gray-500 mt-2">
            Check back soon for uptime statistics
          </p>
        </div>
      </div>
    );
  }

  // Group days by week (7 days per row)
  const weeks: UptimeDay[][] = [];
  for (let i = 0; i < data.days.length; i += 7) {
    weeks.push(data.days.slice(i, i + 7));
  }

  return (
    <div className="glass rounded-2xl p-8 border border-white/10 shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-white mb-1">Uptime</h3>
          <p className="text-sm text-gray-400">
            {data.daysTracked} {data.daysTracked === 1 ? "day" : "days"} tracked
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-white">
            {data.overallUptime.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="space-y-1 mb-4">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="flex gap-1">
            {week.map((day) => (
              <div key={day.date} className="group relative">
                <div
                  className={`w-4 h-4 rounded-sm ${getUptimeColor(
                    day.uptimePercent
                  )} 
                    transition-all duration-200 hover:ring-2 hover:ring-white/50 hover:scale-150
                  `}
                />

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <div className="bg-[#0a0a0a] rounded-xl p-3 border-2 border-white/30 whitespace-nowrap shadow-2xl backdrop-blur-xl">
                    <p className="text-white font-bold text-base mb-2">
                      {formatDate(day.date)}
                    </p>
                    <p className="text-green-400 font-semibold text-sm mb-1">
                      {day.uptimePercent.toFixed(2)}% uptime
                    </p>
                    <p className="text-red-400 font-medium text-xs mb-1">
                      {formatDowntime(day.delinquentChecks)}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {day.uptimeChecks} checks
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-500"></div>
          <span>99-100%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-yellow-400"></div>
          <span>95-99%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
          <span>90-95%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-red-500"></div>
          <span>&lt;90%</span>
        </div>
      </div>
    </div>
  );
}
