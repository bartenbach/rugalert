"use client";

import { useEffect, useState } from "react";

interface EpochData {
  epoch: number;
  count: number;
}

export default function RugsPerEpochChart() {
  const [data, setData] = useState<EpochData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Get epochs from URL params (default 10, same as dashboard)
        const urlParams = new URLSearchParams(window.location.search);
        const epochs = urlParams.get("epochs") || "10";
        const res = await fetch(`/api/rugs-per-epoch?epochs=${epochs}`);
        const json = await res.json();
        setData(json.data || []);
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

  const maxCount = Math.max(...data.map((d) => d.count));
  const totalRugs = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="glass rounded-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">
            🚨 Rugs per Epoch
          </h2>
          <p className="text-gray-400 text-sm">
            Unique validators that rugged per epoch
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-red-400">{totalRugs}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Total Rugs
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.epoch} className="group">
            <div className="flex items-center gap-3">
              {/* Epoch Label */}
              <div className="w-20 text-right text-sm font-mono text-gray-400 group-hover:text-orange-400 transition-colors">
                #{item.epoch}
              </div>

              {/* Bar */}
              <div className="flex-1 relative">
                <div className="h-10 bg-white/5 rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500/80 to-red-600/80 rounded-lg transition-all duration-300 group-hover:from-red-400 group-hover:to-red-500 flex items-center justify-end pr-3"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      minWidth: item.count > 0 ? "3rem" : "0",
                    }}
                  >
                    <span className="text-white font-bold text-sm">
                      {item.count}
                    </span>
                  </div>
                </div>
              </div>

              {/* Count Badge */}
              <div className="w-20 text-left">
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                  {item.count} {item.count === 1 ? "validator" : "validators"}
                </span>
              </div>
            </div>
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
              Peak Rugs
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">
              {(totalRugs / data.length).toFixed(1)}
            </div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              Avg per Epoch
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
