"use client";

import { useEffect, useState } from "react";

interface EpochInfo {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  absoluteSlot: number;
}

export default function EpochProgress() {
  const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEpochInfo = async () => {
    try {
      const response = await fetch("/api/epoch-info", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch epoch info");
      }
      const data = await response.json();
      setEpochInfo(data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching epoch info:", err);
      setError(err.message || "Failed to load epoch info");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEpochInfo();
    // Refresh every 10 seconds for more accurate epoch tracking
    const interval = setInterval(fetchEpochInfo, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="w-full animate-pulse">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-3 bg-gray-700/50 rounded w-16"></div>
          <div className="flex-1 h-1.5 bg-gray-700/50 rounded"></div>
          <div className="h-3 bg-gray-700/50 rounded w-10"></div>
        </div>
        <div className="h-2 bg-gray-700/50 rounded w-full"></div>
      </div>
    );
  }

  if (error || !epochInfo) {
    return null; // Silently fail - don't show error in UI
  }

  const progressPercentage =
    (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100;
  const remainingSlots = epochInfo.slotsInEpoch - epochInfo.slotIndex;

  // Estimate time remaining (assuming ~400ms per slot)
  const remainingSeconds = (remainingSlots * 0.4).toFixed(0);
  const remainingMinutes = Math.floor(Number(remainingSeconds) / 60);
  const remainingHours = Math.floor(remainingMinutes / 60);

  let timeRemaining = "";
  if (remainingHours > 0) {
    timeRemaining = `~${remainingHours}h ${remainingMinutes % 60}m remaining`;
  } else if (remainingMinutes > 0) {
    timeRemaining = `~${remainingMinutes}m remaining`;
  } else {
    timeRemaining = `<1m remaining`;
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-gray-300 whitespace-nowrap">
          Epoch {epochInfo.epoch}
        </span>
        <div className="relative flex-1 h-1.5 bg-gray-800/50 rounded-full overflow-hidden border border-white/10">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-1000 ease-out"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
          </div>
        </div>
        <span className="text-xs font-medium text-orange-400 whitespace-nowrap">
          {progressPercentage.toFixed(1)}%
        </span>
      </div>
      <div className="text-[10px] text-gray-500 text-center">
        {epochInfo.slotIndex.toLocaleString()} /{" "}
        {epochInfo.slotsInEpoch.toLocaleString()} • {timeRemaining}
      </div>
    </div>
  );
}
