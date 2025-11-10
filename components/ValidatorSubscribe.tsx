"use client";

import { useState, useEffect } from "react";

interface ValidatorSubscribeProps {
  votePubkey: string;
  validatorName?: string;
}

export default function ValidatorSubscribe({
  votePubkey,
  validatorName,
}: ValidatorSubscribeProps) {
  const [email, setEmail] = useState("");
  const [commissionAlerts, setCommissionAlerts] = useState(true);
  const [delinquencyAlerts, setDelinquencyAlerts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  // Check if user is already subscribed when email changes
  useEffect(() => {
    const checkSubscription = async () => {
      if (!email || !email.includes("@")) return;

      setCheckingSubscription(true);
      try {
        const res = await fetch("/api/validator-subscription-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, votePubkey }),
        });

        const data = await res.json();

        if (data.subscribed && data.subscription) {
          setIsSubscribed(true);
          setCommissionAlerts(data.subscription.commissionAlerts);
          setDelinquencyAlerts(data.subscription.delinquencyAlerts);
          setMessage({
            type: "info",
            text: "You're already subscribed to this validator",
          });
        } else {
          setIsSubscribed(false);
          setMessage(null);
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
      } finally {
        setCheckingSubscription(false);
      }
    };

    // Debounce the check
    const timeout = setTimeout(checkSubscription, 500);
    return () => clearTimeout(timeout);
  }, [email, votePubkey]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/validator-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          votePubkey,
          commissionAlerts,
          delinquencyAlerts,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: isSubscribed
            ? "Subscription preferences updated!"
            : "Successfully subscribed! You'll receive alerts for this validator.",
        });
        setIsSubscribed(true);
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to subscribe",
        });
      }
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || "An error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!confirm("Are you sure you want to unsubscribe from this validator?")) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/validator-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, votePubkey }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Successfully unsubscribed from this validator",
        });
        setIsSubscribed(false);
        setCommissionAlerts(true);
        setDelinquencyAlerts(true);
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to unsubscribe",
        });
      }
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || "An error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 border border-white/10 shadow-2xl shadow-black/30 hover:border-white/20 transition-all duration-300">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          🔔 Get Alerts for This Validator
        </h2>
        <p className="text-sm text-gray-400">
          Subscribe to receive email notifications when{" "}
          {validatorName ? (
            <span className="text-orange-400 font-semibold">
              {validatorName}
            </span>
          ) : (
            "this validator"
          )}{" "}
          changes commission or goes offline.
        </p>
      </div>

      <form onSubmit={handleSubscribe} className="space-y-4">
        {/* Email Input */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
        </div>

        {/* Alert Type Checkboxes */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="commissionAlerts"
              checked={commissionAlerts}
              onChange={(e) => setCommissionAlerts(e.target.checked)}
              disabled={loading}
              className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-orange-500 focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label htmlFor="commissionAlerts" className="flex-1">
              <div className="text-white font-medium text-sm">
                Get Commission Alerts
              </div>
              <div className="text-gray-400 text-xs mt-0.5">
                Notified when inflation or MEV commission changes
              </div>
            </label>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="delinquencyAlerts"
              checked={delinquencyAlerts}
              onChange={(e) => setDelinquencyAlerts(e.target.checked)}
              disabled={loading}
              className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-orange-500 focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label htmlFor="delinquencyAlerts" className="flex-1">
              <div className="text-white font-medium text-sm">
                Get Delinquency Alerts
              </div>
              <div className="text-gray-400 text-xs mt-0.5">
                Notified when validator becomes delinquent (&gt;128 slots behind)
              </div>
            </label>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`p-4 rounded-lg border ${
              message.type === "success"
                ? "bg-green-500/10 border-green-500/50 text-green-400"
                : message.type === "error"
                ? "bg-red-500/10 border-red-500/50 text-red-400"
                : "bg-blue-500/10 border-blue-500/50 text-blue-400"
            }`}
          >
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={
              loading ||
              !email ||
              checkingSubscription ||
              (!commissionAlerts && !delinquencyAlerts)
            }
            className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40"
          >
            {loading
              ? "Processing..."
              : isSubscribed
              ? "Update Subscription"
              : "Subscribe"}
          </button>

          {isSubscribed && (
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={loading}
              className="px-6 py-3 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 text-gray-300 hover:text-red-400 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Unsubscribe
            </button>
          )}
        </div>

        {/* Privacy Note */}
        <p className="text-xs text-gray-500 text-center">
          By subscribing, you agree to receive email notifications for this
          validator only. You can unsubscribe at any time.
        </p>
      </form>
    </div>
  );
}

