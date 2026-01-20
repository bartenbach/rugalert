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
  "#06b6d4", // cyan
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
  // Show ALL stakers from the distribution data
  const totalDisplayedStake = distribution.reduce((sum, e) => sum + e.amount, 0);

  // Prepare data for pie chart
  const chartData = distribution.map((entry) => ({
    name:
      entry.label || `${entry.staker.slice(0, 4)}...${entry.staker.slice(-4)}`,
    value: entry.amount / 1_000_000_000, // Convert to SOL
    percentage: ((entry.amount / totalDisplayedStake) * 100).toFixed(2),
    fullAddress: entry.staker,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg p-3 border border-white/30 shadow-2xl bg-[#0a0a0a]">
          <p className="text-white font-semibold text-sm mb-1">{data.name}</p>
          <p className="text-gray-300 text-xs">
            ◎ {data.value.toLocaleString()} SOL
          </p>
          <p className="text-cyan-400 font-bold text-xs">
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
    // Only show label if slice is > 12% to avoid overlapping
    if (percent < 0.12) return null;

    const RADIAN = Math.PI / 180;
    // Position label inside the slice
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
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
          fontSize: "12px",
          textShadow: "0 0 6px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1)",
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
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius="85%"
              fill="#8884d8"
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
              onClick={handleSliceClick}
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  style={{
                    cursor: entry.fullAddress ? "pointer" : "default",
                    outline: "none",
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-xs text-gray-500 pb-2">
        Hover for details · Click to view on Solscan
      </p>
    </div>
  );
}
