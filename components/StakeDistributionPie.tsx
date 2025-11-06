"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  // Smart logic: show enough top stakers to represent at least 70% of total stake
  // But cap at 20 stakers max to avoid clutter
  let topStakers = [];
  let topStakersTotal = 0;
  const targetPercentage = 0.7; // Show enough to represent 70%
  const maxStakers = 20;

  for (let i = 0; i < Math.min(distribution.length, maxStakers); i++) {
    topStakers.push(distribution[i]);
    topStakersTotal += distribution[i].amount;

    // If we've hit 60% of total stake and have at least 8 stakers, we can stop
    const currentPercentage = topStakersTotal / (totalStake * 1_000_000_000);
    if (currentPercentage >= targetPercentage && i >= 7) {
      break;
    }
  }

  // Everything else is "Others"
  const othersTotal = totalStake * 1_000_000_000 - topStakersTotal;

  // Prepare data for pie chart
  const chartData = topStakers.map((entry) => ({
    name:
      entry.label || `${entry.staker.slice(0, 4)}...${entry.staker.slice(-4)}`,
    value: entry.amount / 1_000_000_000, // Convert to SOL
    percentage: ((entry.amount / 1_000_000_000 / totalStake) * 100).toFixed(2),
    fullAddress: entry.staker,
  }));

  // Always add "Others" if there's any unaccounted stake
  if (othersTotal > 0) {
    const othersPercentage = (
      (othersTotal / 1_000_000_000 / totalStake) *
      100
    ).toFixed(1);
    chartData.push({
      name: `Others (${othersPercentage}%)`,
      value: othersTotal / 1_000_000_000,
      percentage: othersPercentage,
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
    <div className="w-full h-full flex flex-col">
      {/* Pie Chart */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius="70%"
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
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Custom Legend Below Chart */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-4 py-4 border-t border-white/10">
        {chartData.map((entry, index) => (
          <div
            key={`legend-${index}`}
            className="flex items-center gap-1.5 text-xs"
          >
            <div
              className="w-3 h-3 rounded flex-shrink-0"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            {entry.fullAddress && !entry.name.includes("Others") ? (
              <a
                href={`https://solscan.io/account/${entry.fullAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-300 hover:text-orange-400 transition-colors truncate max-w-[140px] sm:max-w-[180px]"
                title={`${entry.name} - Click to view on Solscan`}
              >
                {entry.name}
              </a>
            ) : (
              <span className="text-gray-300 truncate max-w-[140px] sm:max-w-[180px]">
                {entry.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
