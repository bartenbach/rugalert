"use client";
import { useEffect, useState } from "react";

interface UptimeDay {
  date: string;
  delinquentMinutes: number;
  totalChecks: number;
  uptimePercent: number;
}

interface UptimeChartProps {
  votePubkey: string;
}

export default function UptimeChart({ votePubkey }: UptimeChartProps) {
  const [data, setData] = useState<UptimeDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUptime() {
      try {
        setLoading(true);
        const response = await fetch(`/api/uptime/${votePubkey}`);
        if (!response.ok) throw new Error("Failed to fetch uptime data");
        const json = await response.json();
        setData(json.days || []);
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
    if (uptimePercent >= 99) return "bg-green-500"; // Perfect uptime
    if (uptimePercent >= 95) return "bg-yellow-400"; // Minor downtime
    if (uptimePercent >= 90) return "bg-orange-500"; // Moderate downtime
    return "bg-red-500"; // Significant downtime
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

  // Format downtime in a readable way
  const formatDowntime = (delinquentMinutes: number) => {
    if (delinquentMinutes === 0) return "No downtime";
    if (delinquentMinutes < 60) return `${delinquentMinutes} min downtime`;
    const hours = Math.floor(delinquentMinutes / 60);
    const mins = delinquentMinutes % 60;
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

  if (data.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Uptime</h3>
        <div className="text-center text-gray-400 py-8">
          <p>No uptime data available yet</p>
          <p className="text-sm text-gray-500 mt-2">
            Data will appear as the monitoring system collects it
          </p>
        </div>
      </div>
    );
  }

  // Group days by week (7 days per row)
  const weeks: UptimeDay[][] = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  // Calculate overall uptime stats
  const totalMinutes = data.reduce((sum, day) => sum + day.totalChecks, 0);
  const totalDowntime = data.reduce(
    (sum, day) => sum + day.delinquentMinutes,
    0
  );
  const overallUptime =
    totalMinutes > 0 ? 100 - (totalDowntime / totalMinutes) * 100 : 100;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Uptime</h3>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">
            {overallUptime.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-400">
            {data.length} {data.length === 1 ? "day" : "days"} tracked
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="space-y-1">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="flex gap-1">
            {week.map((day, dayIdx) => (
              <div key={day.date} className="group relative">
                <div
                  className={`w-4 h-4 rounded-sm ${getUptimeColor(
                    day.uptimePercent
                  )} 
                    transition-all duration-200 hover:ring-2 hover:ring-white/50 hover:scale-150
                    ${day.totalChecks === 0 ? "opacity-30" : "opacity-100"}
                  `}
                  title={`${formatDate(day.date)}: ${day.uptimePercent.toFixed(
                    2
                  )}% uptime`}
                />

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <div className="glass rounded-lg p-3 border border-white/20 whitespace-nowrap shadow-xl">
                    <p className="text-white font-semibold text-sm mb-1">
                      {formatDate(day.date)}
                    </p>
                    <p className="text-gray-300 text-xs mb-1">
                      {day.uptimePercent.toFixed(2)}% uptime
                    </p>
                    <p className="text-gray-400 text-xs">
                      {formatDowntime(day.delinquentMinutes)}
                    </p>
                    {day.totalChecks > 0 && (
                      <p className="text-gray-500 text-xs mt-1">
                        {day.totalChecks} checks
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
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
