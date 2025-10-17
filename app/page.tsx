"use client";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  vote_pubkey: string;
  name?: string | null;
  icon_url?: string | null;
  type: "RUG" | "CAUTION" | "INFO";
  from_commission: number;
  to_commission: number;
  delta: number;
  epoch: number;
};

export default function Page() {
  const [epochs, setEpochs] = useState<number>(10);
  const [items, setItems] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/events?epochs=${epochs}`);
    const json = await res.json();
    setItems(json.items || []);
    setLoading(false);
  }

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email || subscribing) return;
    setSubscribing(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubscribed(true);
        setEmail("");
        setTimeout(() => setSubscribed(false), 5000);
      }
    } catch (error) {
      console.error("Subscription failed:", error);
    } finally {
      setSubscribing(false);
    }
  }

  useEffect(() => {
    load();
  }, [epochs]);

  const filtered = items.filter((it) =>
    `${it.vote_pubkey} ${it.name ?? ""} ${it.type}`
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  const rugCount = filtered.filter((it) => it.type === "RUG").length;
  const cautionCount = filtered.filter((it) => it.type === "CAUTION").length;

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4 mb-12">
        <div className="inline-block">
          <h1 className="text-5xl md:text-6xl font-bold gradient-text mb-4">
            Validator Commission Tracker
          </h1>
          <div className="h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 rounded-full"></div>
        </div>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Real-time tracking of ALL Solana validator commission changes. Get
          instant alerts for rugs and suspicious increases.
        </p>
      </div>

      {/* Email Subscription */}
      <div className="glass rounded-2xl p-8 max-w-2xl mx-auto border-2 border-orange-500/20">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-3xl">🔔</span>
            <h2 className="text-2xl font-bold text-white">Get Email Alerts</h2>
          </div>
          <p className="text-gray-400 text-sm">
            Subscribe to receive instant email notifications when validators
            change their commission rates
          </p>
          <form
            onSubmit={handleSubscribe}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mt-6"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="input-modern flex-1 bg-white/5 text-white text-center sm:text-left"
              disabled={subscribing || subscribed}
            />
            <button
              type="submit"
              disabled={subscribing || subscribed}
              className="btn-primary px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {subscribing
                ? "Subscribing..."
                : subscribed
                ? "✓ Subscribed!"
                : "Subscribe"}
            </button>
          </form>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass rounded-2xl p-6 card-shine hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Total Events</p>
              <p className="text-3xl font-bold text-white">{filtered.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 card-shine hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Rug Alerts</p>
              <p className="text-3xl font-bold text-red-400">{rugCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <span className="text-2xl">🚨</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 card-shine hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Caution Alerts</p>
              <p className="text-3xl font-bold text-yellow-400">
                {cautionCount}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center flex-1">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-400 whitespace-nowrap">
                Lookback:
              </label>
              <input
                type="number"
                value={epochs}
                onChange={(e) =>
                  setEpochs(Math.max(1, Number(e.target.value || 1)))
                }
                className="input-modern w-24 bg-white/5 text-white"
              />
              <span className="text-sm text-gray-500">epochs</span>
            </div>
            <div className="relative flex-1 min-w-[300px]">
              <span className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none text-base">
                🔍
              </span>
              <input
                placeholder="Search validator name or pubkey..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input-modern w-full bg-white/5 text-white pl-11"
                style={{ paddingLeft: "2.75rem" }}
              />
            </div>
          </div>
          <a href="/api/export" className="btn-secondary whitespace-nowrap">
            📥 Export CSV
          </a>
        </div>
      </div>

      {/* Events Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                  Validator
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-32">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-40">
                  Commission
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-24">
                  Change
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-24">
                  Epoch
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400">Loading events...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="space-y-2">
                      <div className="text-4xl">🎉</div>
                      <p className="text-gray-400">
                        No suspicious events detected
                      </p>
                      <p className="text-sm text-gray-500">
                        All validators are behaving normally
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr
                    key={it.id}
                    className="hover:bg-white/5 transition-colors duration-200 group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <a
                          href={`/validator/${it.vote_pubkey}`}
                          className="flex-shrink-0"
                        >
                          {it.icon_url ? (
                            <img
                              src={it.icon_url}
                              alt=""
                              className="w-10 h-10 rounded-xl object-cover border border-white/10 hover:border-orange-400 transition-colors"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/30 border border-white/10 hover:border-orange-400 flex items-center justify-center transition-colors ${
                              it.icon_url ? "hidden" : ""
                            }`}
                          >
                            <span className="text-lg">🔷</span>
                          </div>
                        </a>
                        <div className="flex-1 min-w-0">
                          <a
                            href={`/validator/${it.vote_pubkey}`}
                            className="font-semibold text-white hover:text-orange-400 transition-colors block"
                          >
                            {it.name || it.vote_pubkey}
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(it.vote_pubkey);
                              e.currentTarget
                                .querySelector(".copy-icon")
                                ?.classList.add("text-green-400");
                              setTimeout(() => {
                                e.currentTarget
                                  .querySelector(".copy-icon")
                                  ?.classList.remove("text-green-400");
                              }, 1000);
                            }}
                            className="text-xs text-gray-500 font-mono hover:text-orange-400 transition-colors cursor-pointer text-left flex items-center gap-1.5 group/copy"
                            title="Click to copy"
                          >
                            <span className="break-all">{it.vote_pubkey}</span>
                            <span className="copy-icon text-gray-600 group-hover/copy:text-orange-400 transition-colors flex-shrink-0">
                              📋
                            </span>
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          it.type === "RUG"
                            ? "rug-badge"
                            : it.type === "CAUTION"
                            ? "caution-badge"
                            : "inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 border border-white/10"
                        }
                      >
                        {it.type === "RUG"
                          ? "🚨 RUG"
                          : it.type === "CAUTION"
                          ? "⚠️ CAUTION"
                          : "📊 INFO"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">
                          {it.from_commission}%
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-white font-semibold">
                          {it.to_commission}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`font-semibold ${
                          it.type === "RUG"
                            ? "text-red-400"
                            : it.type === "CAUTION"
                            ? "text-yellow-400"
                            : it.delta > 0
                            ? "text-orange-400"
                            : it.delta < 0
                            ? "text-green-400"
                            : "text-gray-400"
                        }`}
                      >
                        {it.delta > 0 ? "+" : ""}
                        {it.delta}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{it.epoch}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="glass rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="rug-badge">🚨 RUG</span>
            <span className="text-gray-400">Commission → 100%</span>
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <span className="caution-badge">⚠️ CAUTION</span>
            <span className="text-gray-400">Increase ≥ 10pp</span>
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 border border-white/10">
              📊 INFO
            </span>
            <span className="text-gray-400">Other changes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
