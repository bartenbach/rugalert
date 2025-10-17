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

export default function CommissionChart({
  data,
}: {
  data: { epoch: number; commission: number }[];
}) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass rounded-lg p-3 border border-white/20">
          <p className="text-gray-300 text-sm mb-1">Epoch {label}</p>
          <p className="text-white font-bold text-lg">
            {payload[0].value}% Commission
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: 0, right: 0, top: 12, bottom: 12 }}
        >
          <defs>
            <linearGradient id="commissionGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff6b35" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#ff6b35" stopOpacity={0} />
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
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            stroke="rgba(255, 255, 255, 0.1)"
            tickLine={false}
            label={{
              value: "Commission %",
              angle: -90,
              position: "insideLeft",
              fill: "#9ca3af",
              fontSize: 12,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="commission"
            stroke="#ff6b35"
            strokeWidth={3}
            fill="url(#commissionGradient)"
            animationDuration={1000}
          />
          <Line
            type="monotone"
            dataKey="commission"
            stroke="#ff6b35"
            strokeWidth={3}
            dot={{ fill: "#ff6b35", strokeWidth: 2, r: 4, stroke: "#1a1a1a" }}
            activeDot={{
              r: 6,
              fill: "#e85a28",
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
