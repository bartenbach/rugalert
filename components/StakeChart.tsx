"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StakeDataPoint = {
  epoch: number;
  activeStake: number;
  activatingStake?: number;
  deactivatingStake?: number;
};

export default function StakeChart({ data }: { data: StakeDataPoint[] }) {
  // Data is already in SOL (converted by API)
  const chartData = data.map((d) => ({
    epoch: d.epoch,
    activeStake: d.activeStake,
    activatingStake: d.activatingStake,
    deactivatingStake: d.deactivatingStake,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass rounded-lg p-3 border border-white/20">
          <p className="text-gray-300 text-sm mb-1">Epoch {label}</p>
          <p className="text-white font-bold text-lg mb-2">
            {formatStake(data.activeStake)} SOL
          </p>
          {data.activatingStake !== undefined && data.activatingStake > 0 && (
            <p className="text-green-400 text-sm">
              +{formatStake(data.activatingStake)} activating
            </p>
          )}
          {data.deactivatingStake !== undefined &&
            data.deactivatingStake > 0 && (
              <p className="text-red-400 text-sm">
                -{formatStake(data.deactivatingStake)} deactivating
              </p>
            )}
        </div>
      );
    }
    return null;
  };

  // Helper function to format stake
  const formatStake = (stake: number): string => {
    if (stake >= 1000000) {
      return `${(stake / 1000000).toFixed(2)}M`;
    } else if (stake >= 1000) {
      return `${(stake / 1000).toFixed(2)}K`;
    }
    return stake.toFixed(2);
  };

  // Format Y-axis ticks
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-400">
        No stake history available yet
      </div>
    );
  }

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ left: 0, right: 0, top: 12, bottom: 12 }}
        >
          <defs>
            <linearGradient id="stakeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255, 255, 255, 0.1)"
            vertical={false}
          />
          <XAxis
            dataKey="epoch"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            stroke="rgba(255, 255, 255, 0.1)"
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            stroke="rgba(255, 255, 255, 0.1)"
            tickLine={false}
            label={{
              value: "Active Stake (SOL)",
              angle: -90,
              position: "insideLeft",
              fill: "#9ca3af",
              fontSize: 12,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="activeStake"
            stroke="#3b82f6"
            strokeWidth={3}
            fill="url(#stakeGradient)"
            animationDuration={1000}
          />
          <Line
            type="monotone"
            dataKey="activeStake"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4, stroke: "#1a1a1a" }}
            activeDot={{
              r: 6,
              fill: "#2563eb",
              stroke: "#1a1a1a",
              strokeWidth: 2,
            }}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
