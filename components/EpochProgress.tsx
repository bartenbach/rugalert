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
  const [baseSlotIndex, setBaseSlotIndex] = useState<number>(0);
  const [fetchTime, setFetchTime] = useState<number>(Date.now());
  const [currentSlotIndex, setCurrentSlotIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEpochInfo = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setIsLoading(true);
      }
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
      setBaseSlotIndex(data.slotIndex);
      setFetchTime(Date.now());
      setCurrentSlotIndex(data.slotIndex);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching epoch info:", err);
      setError(err.message || "Failed to load epoch info");
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchEpochInfo(true); // Initial load shows loading state
    // Refresh every 10 seconds to stay accurate (without showing loading state)
    const interval = setInterval(() => fetchEpochInfo(false), 10000);
    return () => clearInterval(interval);
  }, []);

  // Update slot index every 2 seconds to estimate current slot (reduced frequency to prevent flashing)
  useEffect(() => {
    if (!epochInfo) return;

    const updateSlot = () => {
      const elapsedMs = Date.now() - fetchTime;
      const elapsedSlots = Math.floor(elapsedMs / 400);
      const estimatedSlot = Math.min(
        baseSlotIndex + elapsedSlots,
        epochInfo.slotsInEpoch
      );
      setCurrentSlotIndex(estimatedSlot);
    };

    // Update every 2 seconds (5 slots) - reduces DOM updates significantly
    const interval = setInterval(updateSlot, 2000);
    return () => clearInterval(interval);
  }, [epochInfo, baseSlotIndex, fetchTime]);

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
    (currentSlotIndex / epochInfo.slotsInEpoch) * 100;
  const remainingSlots = epochInfo.slotsInEpoch - currentSlotIndex;

  // Estimate time remaining (assuming ~400ms per slot)
  const remainingSeconds = Math.floor(remainingSlots * 0.4);
  const remainingMinutes = Math.floor(remainingSeconds / 60);
  const remainingHours = Math.floor(remainingMinutes / 60);
  const remainingDays = Math.floor(remainingHours / 24);

  let timeRemaining = "";
  if (remainingDays > 0) {
    const hoursLeft = remainingHours % 24;
    const minutesLeft = remainingMinutes % 60;
    timeRemaining = `~${remainingDays}d ${hoursLeft}h ${minutesLeft}m remaining`;
  } else if (remainingHours > 0) {
    const minutesLeft = remainingMinutes % 60;
    timeRemaining = `~${remainingHours}h ${minutesLeft}m remaining`;
  } else if (remainingMinutes > 0) {
    timeRemaining = `~${remainingMinutes}m remaining`;
  } else {
    timeRemaining = `<1m remaining`;
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-gray-300 whitespace-nowrap font-mono">
          Epoch {epochInfo.epoch}
        </span>
        <div className="relative flex-1 h-1.5 bg-gray-800/50 rounded-full overflow-hidden border border-white/10">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-2000 ease-linear will-change-transform"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
          </div>
        </div>
        <span className="text-xs font-medium text-orange-400 whitespace-nowrap font-mono tabular-nums">
          {progressPercentage.toFixed(1)}%
        </span>
      </div>
      <div className="text-[10px] text-gray-500 text-center font-mono tabular-nums">
        {currentSlotIndex.toLocaleString()} /{" "}
        {epochInfo.slotsInEpoch.toLocaleString()} • {timeRemaining}
      </div>
    </div>
  );
}
