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

  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: any) => {
    // Only show label if slice is > 8% to avoid overlapping
    if (percent < 0.08) return null;

    const RADIAN = Math.PI / 180;
    // Position label inside the slice, closer to outer edge for better spacing
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-bold"
        style={{
          fontSize: "13px",
          textShadow: "0 0 4px rgba(0,0,0,0.9)",
        }}
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  const handleSliceClick = (data: any) => {
    // Only open Solscan for slices with an address (not "Others")
    if (data.fullAddress && !data.name.includes("Others")) {
      window.open(`https://solscan.io/account/${data.fullAddress}`, "_blank");
    }
  };

  return (
    <div
      className="w-full h-full flex items-center justify-center px-2"
      style={{ outline: "none" }}
    >
      <style>{`
        .recharts-wrapper, .recharts-surface, .recharts-layer, .recharts-sector {
          outline: none !important;
        }
        .recharts-sector:focus {
          outline: none !important;
        }
        .recharts-legend-wrapper {
          overflow: visible !important;
          width: 100% !important;
        }
        .recharts-default-legend {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: center !important;
          gap: 6px 8px !important;
          max-width: 100% !important;
          padding: 0 16px !important;
          line-height: 1.5 !important;
        }
        .recharts-legend-item {
          margin: 0 !important;
          flex: 0 1 auto !important;
          max-width: 100% !important;
        }
        @media (max-width: 639px) {
          .recharts-legend-item {
            flex: 0 1 calc(50% - 8px) !important;
          }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .recharts-legend-item {
            flex: 0 1 calc(33.333% - 8px) !important;
          }
        }
        @media (min-width: 1024px) {
          .recharts-legend-item {
            flex: 0 1 auto !important;
          }
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
            innerRadius="0%"
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
            height={75}
            formatter={(value, entry: any) => {
              const data = entry.payload;

              // If it's "Others" or has no address, just show the name
              if (!data.fullAddress || data.name.includes("Others")) {
                return (
                  <span className="text-[10px] sm:text-xs text-gray-300 font-medium">
                    {value}
                  </span>
                );
              }
              // Otherwise, make it a clickable link to Solscan with full name
              return (
                <a
                  href={`https://solscan.io/account/${data.fullAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] sm:text-xs text-gray-300 hover:text-orange-400 transition-colors duration-200 font-medium"
                  title={`${value} - Click to view on Solscan`}
                >
                  {value}
                </a>
              );
            }}
            wrapperStyle={{
              paddingTop: "8px",
              fontSize: "11px",
            }}
            iconSize={10}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
