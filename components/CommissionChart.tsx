"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function CommissionChart({
  data,
}: {
  data: { epoch: number; commission: number | null; mevCommission: number | null }[];
}) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass rounded-lg p-3 border border-white/20">
          <p className="text-gray-300 text-sm mb-1">Epoch {label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-white font-bold text-lg" style={{ color: entry.color }}>
              {entry.value !== null ? `${entry.value}%` : 'N/A'} {entry.name}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => (
    <div className="flex justify-center gap-6 mt-2">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-300 text-sm">{entry.value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: 10, right: 0, top: 12, bottom: 12 }}
        >
          <defs>
            <linearGradient id="inflationGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="mevGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
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
            width={60}
            label={{
              value: "Commission %",
              angle: -90,
              position: "insideLeft",
              fill: "#9ca3af",
              fontSize: 12,
              offset: 10,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          
          {/* Inflation Commission Area */}
          <Area
            type="monotone"
            dataKey="commission"
            name="Inflation Commission"
            stroke="#06b6d4"
            strokeWidth={3}
            fill="url(#inflationGradient)"
            animationDuration={1000}
            connectNulls
          />
          
          {/* Inflation Commission Line */}
          <Line
            type="monotone"
            dataKey="commission"
            name="Inflation Commission"
            stroke="#06b6d4"
            strokeWidth={3}
            dot={{ fill: "#06b6d4", strokeWidth: 2, r: 4, stroke: "#1a1a1a" }}
            activeDot={{
              r: 6,
              fill: "#0891b2",
              stroke: "#1a1a1a",
              strokeWidth: 2,
            }}
            animationDuration={1000}
            connectNulls
          />
          
          {/* MEV Commission Area */}
          <Area
            type="monotone"
            dataKey="mevCommission"
            name="MEV Commission"
            stroke="#a855f7"
            strokeWidth={3}
            strokeDasharray="5 5"
            fill="url(#mevGradient)"
            animationDuration={1000}
            connectNulls
          />
          
          {/* MEV Commission Line */}
          <Line
            type="monotone"
            dataKey="mevCommission"
            name="MEV Commission"
            stroke="#a855f7"
            strokeWidth={3}
            strokeDasharray="5 5"
            dot={{ fill: "#a855f7", strokeWidth: 2, r: 4, stroke: "#1a1a1a" }}
            activeDot={{
              r: 6,
              fill: "#8b3ddb",
              stroke: "#1a1a1a",
              strokeWidth: 2,
            }}
            animationDuration={1000}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
