"use client";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

type ConcentrationEntry = {
  name: string;
  code?: string;
  validatorCount: number;
  totalStake: number;
  stakePercent: number;
  cumulativePercent?: number;
};

type DataCenterEntry = ConcentrationEntry & {
  topCities?: Array<{
    city: string;
    country: string;
    stake: number;
    validators: number;
  }>;
};

type CityEntry = ConcentrationEntry & {
  city: string;
  country: string;
  countryCode: string;
  dataCenters: string[];
};

type ASNEntry = {
  asNumber: number;
  asName: string;
  dataCenter: string;
  validatorCount: number;
  totalStake: number;
  stakePercent: number;
};

type StakeConcentrationData = {
  summary: {
    totalGeoLocatedValidators: number;
    totalNetworkStakeSOL: number;
    geoLocatedStakeSOL: number;
    geoCoveragePercent: number;
    uniqueCountries: number;
    uniqueCities: number;
    uniqueDataCenters: number;
    uniqueASNs: number;
  };
  nakamotoCoefficients: {
    byCountry: number;
    byDataCenter: number;
    byCity: number;
    byASN: number;
    threshold: number;
  };
  superminority: {
    byCountry: (ConcentrationEntry & { cumulativePercent: number })[];
    byDataCenter: (ConcentrationEntry & { cumulativePercent: number })[];
  };
  byCountry: ConcentrationEntry[];
  byDataCenter: DataCenterEntry[];
  byCity: CityEntry[];
  byASN: ASNEntry[];
};

// Color palette for charts
const CHART_COLORS = [
  "#06b6d4", // cyan-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#10b981", // emerald-500
  "#ec4899", // pink-500
  "#3b82f6", // blue-500
  "#f97316", // orange-500
  "#14b8a6", // teal-500
  "#a855f7", // purple-500
  "#22d3ee", // cyan-400
  "#facc15", // yellow-400
  "#fb923c", // orange-400
  "#38bdf8", // sky-400
  "#c084fc", // purple-400
];

function formatStake(sol: number): string {
  if (sol >= 1_000_000) return `${(sol / 1_000_000).toFixed(1)}M`;
  if (sol >= 1_000) return `${(sol / 1_000).toFixed(0)}K`;
  return sol.toFixed(0);
}

function formatPercent(pct: number): string {
  return pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
}

// Nakamoto Coefficient Card
function NakamotoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  const getColor = (val: number) => {
    if (val >= 10) return "text-green-400";
    if (val >= 5) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="glass rounded-xl p-4 border border-white/10">
      <div className="text-2xl mb-2">{icon}</div>
      <div className={`text-3xl font-bold ${getColor(value)}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

// Concentration Bar (horizontal)
function ConcentrationBar({
  entries,
  title,
}: {
  entries: ConcentrationEntry[];
  title: string;
}) {
  return (
    <div className="glass rounded-xl p-4 sm:p-5 border border-white/10">
      <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
      <div className="space-y-3">
        {entries.slice(0, 15).map((entry, idx) => (
          <div key={entry.name}>
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                {entry.code && (
                  <img
                    src={`https://flagcdn.com/16x12/${entry.code.toLowerCase()}.png`}
                    alt={entry.code}
                    width={16}
                    height={12}
                    className="inline-block"
                  />
                )}
                <span className="text-white font-medium">{entry.name}</span>
                <span className="text-gray-500 text-xs">
                  ({entry.validatorCount} validators)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">
                  {formatStake(entry.totalStake)} SOL
                </span>
                <span className="text-cyan-400 font-semibold w-16 text-right">
                  {formatPercent(entry.stakePercent)}
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(entry.stakePercent, 100)}%`,
                  backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Superminority Alert
function SuperminorityAlert({
  entries,
  type,
}: {
  entries: (ConcentrationEntry & { cumulativePercent: number })[];
  type: string;
}) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 sm:p-5 border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-400 text-lg">&#9888;</span>
        <h3 className="text-base font-bold text-amber-300">
          Superminority by {type}
        </h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        These {entries.length} {type.toLowerCase()}
        {entries.length === 1 ? "" : "s"} collectively control over 33.3% of
        stake, forming the superminority.
      </p>
      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div
            key={entry.name}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-mono text-xs w-5">
                {idx + 1}.
              </span>
              {entry.code && (
                <img
                  src={`https://flagcdn.com/16x12/${entry.code.toLowerCase()}.png`}
                  alt={entry.code}
                  width={16}
                  height={12}
                  className="inline-block"
                />
              )}
              <span className="text-white font-medium">{entry.name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-amber-400 font-semibold">
                {formatPercent(entry.stakePercent)}
              </span>
              <span className="text-gray-500">
                cum: {formatPercent(entry.cumulativePercent)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StakeConcentrationPage() {
  const [data, setData] = useState<StakeConcentrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "countries" | "datacenters" | "cities" | "asns"
  >("overview");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stake-concentration", {
          cache: "no-store",
        });
        if (!res.ok) {
          const errData = await res.json();
          setError(
            errData.error ||
              "Failed to load stake concentration data. The geo-snapshot job may not have run yet."
          );
          return;
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4" />
          <p className="text-gray-400">Loading stake concentration data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="glass rounded-2xl p-8 border border-red-500/30 bg-red-500/5 max-w-lg text-center">
          <div className="text-4xl mb-4">&#127758;</div>
          <h2 className="text-xl font-bold text-white mb-2">
            No Geolocation Data Yet
          </h2>
          <p className="text-gray-400 text-sm">
            {error ||
              "The geo-snapshot cron job needs to run first to populate validator location data. Check back soon!"}
          </p>
        </div>
      </div>
    );
  }

  const { summary, nakamotoCoefficients, superminority } = data;

  // Prepare pie chart data for top data centers
  const dcPieData = data.byDataCenter.slice(0, 10).map((dc, idx) => ({
    name: dc.name,
    value: Math.round(dc.totalStake),
    percent: dc.stakePercent,
    fill: CHART_COLORS[idx % CHART_COLORS.length],
  }));

  // Add "Other" category for remaining
  const topDcStake = dcPieData.reduce((sum, d) => sum + d.value, 0);
  const otherStake = Math.round(summary.geoLocatedStakeSOL - topDcStake);
  if (otherStake > 0) {
    dcPieData.push({
      name: "Other",
      value: otherStake,
      percent:
        (otherStake / summary.totalNetworkStakeSOL) * 100,
      fill: "#4b5563",
    });
  }

  // Prepare bar chart data for countries (top 15)
  const countryBarData = data.byCountry.slice(0, 15).map((c) => ({
    name: c.code || c.name.slice(0, 3),
    fullName: c.name,
    stake: Math.round(c.totalStake),
    percent: c.stakePercent,
    validators: c.validatorCount,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Stake Concentration
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Geographic and infrastructure distribution of Solana validator stake
          </p>
        </div>
        <div className="text-xs text-gray-500">
          Covering {formatPercent(summary.geoCoveragePercent)} of network stake
          ({summary.totalGeoLocatedValidators.toLocaleString()} validators)
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass rounded-xl p-4 border border-white/10 text-center">
          <div className="text-2xl font-bold text-white">
            {summary.uniqueCountries}
          </div>
          <div className="text-xs text-gray-400 mt-1">Countries</div>
        </div>
        <div className="glass rounded-xl p-4 border border-white/10 text-center">
          <div className="text-2xl font-bold text-white">
            {summary.uniqueCities}
          </div>
          <div className="text-xs text-gray-400 mt-1">Cities</div>
        </div>
        <div className="glass rounded-xl p-4 border border-white/10 text-center">
          <div className="text-2xl font-bold text-white">
            {summary.uniqueDataCenters}
          </div>
          <div className="text-xs text-gray-400 mt-1">Data Centers</div>
        </div>
        <div className="glass rounded-xl p-4 border border-white/10 text-center">
          <div className="text-2xl font-bold text-white">
            {summary.uniqueASNs}
          </div>
          <div className="text-xs text-gray-400 mt-1">Networks (ASNs)</div>
        </div>
      </div>

      {/* Nakamoto Coefficients */}
      <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-bold text-white">
            Geographic Nakamoto Coefficients
          </h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Number of entities needed to control &ge;{nakamotoCoefficients.threshold}%
          of stake (superminority threshold). Higher is better.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NakamotoCard
            label="Countries"
            value={nakamotoCoefficients.byCountry}
            icon="&#127758;"
          />
          <NakamotoCard
            label="Data Centers"
            value={nakamotoCoefficients.byDataCenter}
            icon="&#127959;"
          />
          <NakamotoCard
            label="Cities"
            value={nakamotoCoefficients.byCity}
            icon="&#127961;"
          />
          <NakamotoCard
            label="Networks (ASN)"
            value={nakamotoCoefficients.byASN}
            icon="&#128752;"
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto">
        {[
          { id: "overview" as const, label: "Overview" },
          { id: "countries" as const, label: "Countries" },
          { id: "datacenters" as const, label: "Data Centers" },
          { id: "cities" as const, label: "Cities" },
          { id: "asns" as const, label: "Networks" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Superminority Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SuperminorityAlert
              entries={superminority.byCountry}
              type="Country"
            />
            <SuperminorityAlert
              entries={superminority.byDataCenter}
              type="Data Center"
            />
          </div>

          {/* Side-by-side: Country Bar + DC Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Country Bar Chart */}
            <div className="glass rounded-xl p-4 sm:p-5 border border-white/10">
              <h3 className="text-lg font-bold text-white mb-4">
                Stake by Country
              </h3>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryBarData} layout="vertical">
                    <XAxis
                      type="number"
                      tickFormatter={(v) => formatStake(v)}
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={{ stroke: "#374151" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={40}
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={{ stroke: "#374151" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: string, props: any) => [
                        `${formatStake(value)} SOL (${formatPercent(
                          props.payload.percent
                        )})`,
                        props.payload.fullName,
                      ]}
                    />
                    <Bar dataKey="stake" radius={[0, 4, 4, 0]}>
                      {countryBarData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Data Center Pie Chart */}
            <div className="glass rounded-xl p-4 sm:p-5 border border-white/10">
              <h3 className="text-lg font-bold text-white mb-4">
                Stake by Data Center
              </h3>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dcPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) =>
                        percent >= 3 ? `${name}` : ""
                      }
                      labelLine={false}
                    >
                      {dcPieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: string, props: any) => [
                        `${formatStake(value as number)} SOL (${formatPercent(
                          props.payload.percent
                        )})`,
                        name,
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => (
                        <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "countries" && (
        <ConcentrationBar
          entries={data.byCountry}
          title="Stake by Country"
        />
      )}

      {activeTab === "datacenters" && (
        <div className="space-y-4">
          <ConcentrationBar
            entries={data.byDataCenter}
            title="Stake by Data Center Provider"
          />

          {/* Data Center Detail Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.byDataCenter.slice(0, 9).map((dc, idx) => (
              <div
                key={dc.name}
                className="glass rounded-xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-white">{dc.name}</h4>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${
                        CHART_COLORS[idx % CHART_COLORS.length]
                      }20`,
                      color: CHART_COLORS[idx % CHART_COLORS.length],
                    }}
                  >
                    {formatPercent(dc.stakePercent)}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  {dc.validatorCount} validators | {formatStake(dc.totalStake)}{" "}
                  SOL
                </div>
                {dc.topCities && dc.topCities.length > 0 && (
                  <div className="space-y-1 mt-3 pt-3 border-t border-white/5">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                      Top Locations
                    </div>
                    {dc.topCities.map((city) => (
                      <div
                        key={`${city.city}-${city.country}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-300">
                          {city.city}, {city.country}
                        </span>
                        <span className="text-gray-500">
                          {city.validators} val
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "cities" && (
        <div className="glass rounded-xl p-4 sm:p-5 border border-white/10">
          <h3 className="text-lg font-bold text-white mb-4">Stake by City</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    #
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    City
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">
                    Validators
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">
                    Stake
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">
                    % of Network
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    Data Centers
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byCity.slice(0, 50).map((city, idx) => (
                  <tr
                    key={city.name}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-2 px-3 text-gray-500 text-xs">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {city.countryCode && (
                          <img
                            src={`https://flagcdn.com/16x12/${city.countryCode.toLowerCase()}.png`}
                            alt={city.countryCode}
                            width={16}
                            height={12}
                          />
                        )}
                        <span className="text-white font-medium">
                          {city.city}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {city.country}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {city.validatorCount}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300 font-mono text-xs">
                      {formatStake(city.totalStake)} SOL
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className={`font-semibold ${
                          city.stakePercent >= 10
                            ? "text-red-400"
                            : city.stakePercent >= 5
                            ? "text-amber-400"
                            : "text-cyan-400"
                        }`}
                      >
                        {formatPercent(city.stakePercent)}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {city.dataCenters.slice(0, 3).map((dc) => (
                          <span
                            key={dc}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400"
                          >
                            {dc}
                          </span>
                        ))}
                        {city.dataCenters.length > 3 && (
                          <span className="text-[10px] text-gray-500">
                            +{city.dataCenters.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "asns" && (
        <div className="glass rounded-xl p-4 sm:p-5 border border-white/10">
          <h3 className="text-lg font-bold text-white mb-1">
            Stake by Network (ASN)
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Autonomous System Numbers identify the specific network operator.
            This is the most granular view of infrastructure concentration.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    #
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    ASN
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    Network
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">
                    Provider
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">
                    Validators
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">
                    Stake
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">
                    % of Network
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byASN.slice(0, 50).map((asn, idx) => (
                  <tr
                    key={asn.asNumber}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-2 px-3 text-gray-500 text-xs">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 text-gray-400 font-mono text-xs">
                      AS{asn.asNumber}
                    </td>
                    <td className="py-2 px-3 text-white font-medium text-xs">
                      {asn.asName}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                        {asn.dataCenter}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {asn.validatorCount}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300 font-mono text-xs">
                      {formatStake(asn.totalStake)} SOL
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className={`font-semibold ${
                          asn.stakePercent >= 10
                            ? "text-red-400"
                            : asn.stakePercent >= 5
                            ? "text-amber-400"
                            : "text-cyan-400"
                        }`}
                      >
                        {formatPercent(asn.stakePercent)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
