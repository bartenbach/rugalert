"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface StakeDistributionPieProps {
  distribution: Array<{
    staker: string;
    amount: number;
    label: string | null;
  }>;
  totalStake: number;
}

const COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#10b981", // green
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#ef4444", // red
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f43f5e", // rose
  "#a855f7", // violet
  "#eab308", // yellow
  "#64748b", // slate
];

export default function StakeDistributionPie({
  distribution,
  totalStake,
}: StakeDistributionPieProps) {
  // Take top 10 stakers and group the rest as "Others"
  const top10 = distribution.slice(0, 10);

  // Calculate total shown in top 10
  const top10Total = top10.reduce((sum, entry) => sum + entry.amount, 0);

  // Everything else is "Others" (difference between total stake and top 10)
  const othersTotal = totalStake * 1_000_000_000 - top10Total;

  // Prepare data for pie chart
  const chartData = top10.map((entry) => ({
    name:
      entry.label || `${entry.staker.slice(0, 4)}...${entry.staker.slice(-4)}`,
    value: entry.amount / 1_000_000_000, // Convert to SOL
    percentage: ((entry.amount / 1_000_000_000 / totalStake) * 100).toFixed(2),
    fullAddress: entry.staker,
  }));

  // Always add "Others" if there's any unaccounted stake
  if (othersTotal > 0) {
    const otherStakers = distribution.length - 10;
    chartData.push({
      name: otherStakers > 0 ? `${otherStakers} Others` : "Others",
      value: othersTotal / 1_000_000_000,
      percentage: ((othersTotal / 1_000_000_000 / totalStake) * 100).toFixed(2),
      fullAddress: "",
    });
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg p-3 border border-white/30 shadow-2xl bg-[#0a0a0a]">
          <p className="text-white font-semibold text-sm mb-1">{data.name}</p>
          <p className="text-gray-300 text-xs">
            ◎ {data.value.toLocaleString()} SOL
          </p>
          <p className="text-orange-400 font-bold text-xs">
            {data.percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = (entry: any) => {
    const percent = parseFloat(entry.percentage);
    // Only show label if slice is > 5%
    if (percent > 5) {
      return `${percent}%`;
    }
    return "";
  };

  const handleSliceClick = (data: any) => {
    // Only open Solscan for slices with an address (not "Others")
    if (data.fullAddress && !data.name.includes("Others")) {
      window.open(`https://solscan.io/account/${data.fullAddress}`, "_blank");
    }
  };

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ outline: "none" }}
    >
      <style>{`
        .recharts-wrapper, .recharts-surface, .recharts-layer, .recharts-sector {
          outline: none !important;
        }
        .recharts-sector:focus {
          outline: none !important;
        }
      `}</style>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius="65%"
            fill="#8884d8"
            dataKey="value"
            animationBegin={0}
            animationDuration={800}
            onClick={handleSliceClick}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                style={{
                  cursor:
                    entry.fullAddress && !entry.name.includes("Others")
                      ? "pointer"
                      : "default",
                  outline: "none",
                }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value, entry: any) => {
              const data = entry.payload;
              // If it's "Others" or has no address, just show the name
              if (!data.fullAddress || data.name.includes("Others")) {
                return (
                  <span className="text-[10px] sm:text-[11px] text-gray-300 font-medium">
                    {value}
                  </span>
                );
              }
              // Otherwise, make it a clickable link to Solscan
              return (
                <a
                  href={`https://solscan.io/account/${data.fullAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] sm:text-[11px] text-gray-300 hover:text-orange-400 transition-colors duration-200 font-medium"
                >
                  {value}
                </a>
              );
            }}
            wrapperStyle={{
              paddingTop: "10px",
              fontSize: "10px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
