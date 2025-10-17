"use client";
import { useEffect, useState } from "react";

export default function History() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  async function load(p = page) {
    setLoading(true);
    const res = await fetch(`/api/history?page=${p}`);
    const json = await res.json();
    setItems(json.items || []);
    setTotal(json.total || 0);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-block">
          <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
            Historical Records
          </h1>
          <div className="h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 rounded-full"></div>
        </div>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Complete archive of all commission change events
        </p>
      </div>

      {/* Stats Bar */}
      <div className="glass rounded-2xl p-6 border border-white/10 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <span className="text-2xl">📚</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{total}</div>
              <div className="text-sm text-gray-400">Total Events</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
              onClick={() => {
                const p = Math.max(1, page - 1);
                setPage(p);
                load(p);
              }}
              disabled={page === 1 || loading}
            >
              ← Previous
            </button>
            <div className="px-6 py-2 glass border border-white/10 rounded-lg">
              <span className="text-white font-semibold">
                {page} <span className="text-gray-400">of</span> {pages}
              </span>
            </div>
            <button
              className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
              onClick={() => {
                const p = Math.min(pages, page + 1);
                setPage(p);
                load(p);
              }}
              disabled={page === pages || loading}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl border border-white/10 shadow-sm overflow-hidden">
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
                  Commission Change
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 w-24">
                  Delta
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
                      <span className="text-gray-400">Loading history...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="space-y-2">
                      <div className="text-4xl">📭</div>
                      <p className="text-gray-300">
                        No historical records found
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((r: any) => (
                  <tr
                    key={r.id}
                    className="hover:bg-white/5 transition-colors duration-200 group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <a
                          href={`/validator/${r.vote_pubkey}`}
                          className="flex-shrink-0"
                        >
                          {r.avatar_url ? (
                            <img
                              src={r.avatar_url}
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
                              r.avatar_url ? "hidden" : ""
                            }`}
                          >
                            <span className="text-lg">🔷</span>
                          </div>
                        </a>
                        <div className="flex-1 min-w-0">
                          <a
                            href={`/validator/${r.vote_pubkey}`}
                            className="font-semibold text-white hover:text-orange-400 transition-colors block"
                          >
                            {r.name || r.vote_pubkey}
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(r.vote_pubkey);
                              e.currentTarget
                                .querySelector(".copy-icon")
                                ?.classList.add("text-green-400");
                              setTimeout(() => {
                                e.currentTarget
                                  .querySelector(".copy-icon")
                                  ?.classList.remove("text-green-400");
                              }, 1000);
                            }}
                            className="text-xs text-gray-400 font-mono hover:text-orange-400 transition-colors cursor-pointer text-left flex items-center gap-1.5 group/copy"
                            title="Click to copy"
                          >
                            <span className="break-all">{r.vote_pubkey}</span>
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
                          r.type === "RUG"
                            ? "rug-badge"
                            : r.type === "CAUTION"
                            ? "caution-badge"
                            : "inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 border border-white/10"
                        }
                      >
                        {r.type === "RUG"
                          ? "🚨 RUG"
                          : r.type === "CAUTION"
                          ? "⚠️ CAUTION"
                          : "📊 INFO"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">
                          {r.fromCommission}%
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-white font-semibold">
                          {r.toCommission}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`font-semibold ${
                          r.type === "RUG"
                            ? "text-red-400"
                            : r.type === "CAUTION"
                            ? "text-yellow-400"
                            : r.delta > 0
                            ? "text-orange-400"
                            : r.delta < 0
                            ? "text-green-400"
                            : "text-gray-400"
                        }`}
                      >
                        {r.delta > 0 ? "+" : ""}
                        {r.delta}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{r.epoch}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      {!loading && items.length > 0 && (
        <div className="glass rounded-xl p-6 border border-white/10 shadow-sm flex items-center justify-center gap-3">
          <span className="text-gray-400 text-sm">
            Showing {(page - 1) * pageSize + 1} -{" "}
            {Math.min(page * pageSize, total)} of {total} events
          </span>
        </div>
      )}
    </div>
  );
}
