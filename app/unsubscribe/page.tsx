"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function UnsubscribeForm() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");

  const [email, setEmail] = useState(emailParam || "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleUnsubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to unsubscribe");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-white mb-4">
            Successfully Unsubscribed
          </h1>
          <p className="text-gray-400 mb-6">
            You've been removed from RugAlert email notifications.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            You can always resubscribe from the homepage if you change your
            mind.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all duration-200"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">👋</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Unsubscribe from RugAlert
          </h1>
          <p className="text-gray-400 text-sm">
            We're sorry to see you go. Enter your email to unsubscribe from all
            commission change alerts.
          </p>
        </div>

        <form onSubmit={handleUnsubscribe} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Unsubscribing..." : "Unsubscribe"}
          </button>

          <div className="text-center">
            <a
              href="/"
              className="text-sm text-gray-400 hover:text-cyan-400 transition-colors"
            >
              ← Back to homepage
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4 animate-pulse">⏳</div>
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <UnsubscribeForm />
    </Suspense>
  );
}
