"use client";
import { useEffect, useRef, useState } from "react";

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
  const [emailPreference, setEmailPreference] = useState<
    "rugs_only" | "rugs_and_cautions" | "all"
  >("rugs_only");

  // Real-time monitoring state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false); // Default to OFF
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sirenActive, setSirenActive] = useState(false);
  const [newRugDetected, setNewRugDetected] = useState<Row | null>(null);
  const previousRugsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const sirenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load sound preference from localStorage on mount
  useEffect(() => {
    const savedSoundPref = localStorage.getItem("rugalert-sound-enabled");
    if (savedSoundPref !== null) {
      setSoundEnabled(savedSoundPref === "true");
    }
  }, []);

  // Save sound preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem("rugalert-sound-enabled", soundEnabled.toString());
  }, [soundEnabled]);

  async function load(isAutoRefresh = false) {
    if (!isAutoRefresh) setLoading(true);
    try {
      const res = await fetch(`/api/events?epochs=${epochs}`);
      const json = await res.json();
      const newItems = json.items || [];

      // Detect new RUG events
      if (autoRefresh && previousRugsRef.current.size > 0) {
        const currentRugs = newItems.filter((it: Row) => it.type === "RUG");
        const newRug = currentRugs.find(
          (rug: Row) => !previousRugsRef.current.has(rug.id)
        );

        if (newRug) {
          triggerSirenAlert(newRug);
        }
      }

      // Update previous rugs set
      previousRugsRef.current = new Set(
        newItems.filter((it: Row) => it.type === "RUG").map((it: Row) => it.id)
      );

      setItems(newItems);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to load events:", error);
    } finally {
      setLoading(false);
    }
  }

  async function playSirenSound() {
    // Always use Web Audio API for immediate sound generation
    // (HTML5 audio has loading delays)
    await generateSirenWithWebAudio();
  }

  async function generateSirenWithWebAudio() {
    try {
      console.log("🔊 Starting siren sound generation...");

      // Stop any existing oscillators first
      stopAllOscillators();

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      console.log("🔊 Audio context state:", ctx.state);

      // Resume audio context if suspended (required by browser security)
      if (ctx.state === "suspended") {
        console.log("🔊 Resuming suspended audio context...");
        await ctx.resume();
        console.log("🔊 Audio context resumed:", ctx.state);
      }

      const oscillator1 = ctx.createOscillator();
      const oscillator2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator1.type = "sine";
      oscillator2.type = "sine";
      oscillator1.frequency.value = 800;
      oscillator2.frequency.value = 800;

      // Create alternating siren effect
      const now = ctx.currentTime;
      for (let i = 0; i < 30; i++) {
        // Loop for 15 seconds (30 * 0.5s)
        const time = now + i * 0.5;
        const freq = i % 2 === 0 ? 800 : 1200;
        oscillator1.frequency.setValueAtTime(freq, time);
        oscillator2.frequency.setValueAtTime(freq + 5, time); // Slight detune for richer sound
      }

      gainNode.gain.value = 0.15; // Lower volume

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(ctx.destination);

      console.log("🔊 Starting oscillators at time:", now);
      oscillator1.start(now);
      oscillator2.start(now);

      // Store references so we can stop them later
      oscillatorsRef.current = [oscillator1, oscillator2];

      // Schedule stop after 15 seconds
      oscillator1.stop(now + 15);
      oscillator2.stop(now + 15);

      console.log("✅ Siren sound started successfully!");
    } catch (error) {
      console.error("❌ Web Audio API failed:", error);
    }
  }

  function stopAllOscillators() {
    try {
      console.log("🛑 Stopping", oscillatorsRef.current.length, "oscillators");
      oscillatorsRef.current.forEach((osc, index) => {
        try {
          osc.stop();
          osc.disconnect();
          console.log("🛑 Stopped oscillator", index);
        } catch (e) {
          console.log("⚠️ Oscillator", index, "already stopped or error:", e);
        }
      });
      oscillatorsRef.current = [];
    } catch (error) {
      console.error("❌ Failed to stop oscillators:", error);
    }
  }

  function triggerSirenAlert(rug: Row) {
    console.log("🚨 Triggering siren alert for:", rug.name || rug.vote_pubkey);
    setNewRugDetected(rug);
    setSirenActive(true);

    // Play sound only if enabled
    if (soundEnabled) {
      playSirenSound();
    }

    // Auto-dismiss after 15 seconds
    if (sirenTimeoutRef.current) clearTimeout(sirenTimeoutRef.current);
    sirenTimeoutRef.current = setTimeout(() => {
      console.log("⏰ Auto-dismissing alert after 15 seconds");
      dismissSiren();
    }, 15000);
  }

  // Test function to trigger alert manually
  function testSirenAlert() {
    const testRug: Row = {
      id: "test-" + Date.now(),
      vote_pubkey: "TEST123ABC456DEF789",
      name: "Test Validator",
      icon_url: null,
      type: "RUG",
      from_commission: 5,
      to_commission: 100,
      delta: 95,
      epoch: 999,
    };
    triggerSirenAlert(testRug);
  }

  function dismissSiren() {
    console.log("❌ Dismissing siren alert");
    setSirenActive(false);
    setNewRugDetected(null);

    // Stop HTML5 audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Stop Web Audio oscillators
    stopAllOscillators();

    // Clear auto-dismiss timer
    if (sirenTimeoutRef.current) {
      clearTimeout(sirenTimeoutRef.current);
    }
  }

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email || subscribing) return;
    setSubscribing(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, preferences: emailPreference }),
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

  // Initial load
  useEffect(() => {
    load();
  }, [epochs]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      load(true);
    }, 30000); // Poll every 30 seconds (reasonable for backend cron every 15 min)

    return () => clearInterval(interval);
  }, [autoRefresh, epochs]);

  const filtered = items.filter((it) =>
    `${it.vote_pubkey} ${it.name ?? ""} ${it.type}`
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  const rugCount = filtered.filter((it) => it.type === "RUG").length;
  const cautionCount = filtered.filter((it) => it.type === "CAUTION").length;

  return (
    <div className="space-y-8">
      {/* Hidden audio element for siren */}
      <audio ref={audioRef} loop>
        <source src="/siren.mp3" type="audio/mpeg" />
      </audio>

      {/* Siren Alert Overlay */}
      {sirenActive && newRugDetected && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-pulse-slow"
          style={{ margin: 0, padding: 0 }}
        >
          {/* Flashing red siren lights */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-red-600/30 animate-flash"></div>
            <div className="absolute top-10 left-10 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-left"></div>
            <div className="absolute top-10 right-10 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-right"></div>
            <div
              className="absolute bottom-10 left-1/4 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-left"
              style={{ animationDelay: "0.5s" }}
            ></div>
            <div
              className="absolute bottom-10 right-1/4 w-32 h-32 bg-red-500 rounded-full blur-3xl animate-siren-right"
              style={{ animationDelay: "0.5s" }}
            ></div>
          </div>

          {/* Alert Content */}
          <div className="relative z-10 max-w-2xl mx-4 bg-gradient-to-br from-red-950 to-red-900 border-4 border-red-500 rounded-3xl p-8 shadow-2xl shadow-red-500/50 animate-scale-in">
            <div className="text-center space-y-6">
              {/* Siren Icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative text-8xl animate-bounce">🚨</div>
                </div>
              </div>

              {/* Alert Text */}
              <div>
                <h2 className="text-5xl font-black text-white mb-3 animate-pulse tracking-wider">
                  RUG DETECTED!
                </h2>
                <p className="text-2xl text-red-200 font-bold mb-6">
                  Validator Commission → 100%
                </p>
              </div>

              {/* Validator Info */}
              <div className="bg-black/50 rounded-2xl p-6 border-2 border-red-500/50">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {newRugDetected.icon_url ? (
                    <img
                      src={newRugDetected.icon_url}
                      alt="Validator"
                      className="w-16 h-16 rounded-xl border-2 border-red-400"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-red-500/20 flex items-center justify-center border-2 border-red-400">
                      <span className="text-3xl">🔷</span>
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-xl font-bold text-white">
                      {newRugDetected.name || "Unknown Validator"}
                    </p>
                    <p className="text-sm text-gray-400 font-mono break-all">
                      {newRugDetected.vote_pubkey.slice(0, 20)}...
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-red-950/50 rounded-lg p-3 border border-red-500/30">
                    <p className="text-gray-400 mb-1">Previous</p>
                    <p className="text-2xl font-bold text-white">
                      {newRugDetected.from_commission}%
                    </p>
                  </div>
                  <div className="bg-red-950/50 rounded-lg p-3 border border-red-500/30">
                    <p className="text-gray-400 mb-1">Current</p>
                    <p className="text-2xl font-bold text-red-400">
                      {newRugDetected.to_commission}%
                    </p>
                  </div>
                </div>

                <div className="mt-4 text-sm text-gray-400">
                  Epoch: {newRugDetected.epoch}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center pt-4">
                <a
                  href={`/validator/${newRugDetected.vote_pubkey}`}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
                >
                  View Details
                </a>
                <button
                  onClick={dismissSiren}
                  className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Real-time Status Bar */}
      <div className="glass rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                autoRefresh ? "bg-green-500 animate-pulse" : "bg-gray-500"
              }`}
            ></div>
            <span className="text-sm text-gray-400">
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </span>
          </div>
          {lastUpdate && (
            <div className="text-sm text-gray-500">
              Last update: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={testSirenAlert}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
            title="Test the siren alert"
          >
            🚨 Test Alert
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              soundEnabled
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
                : "bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30"
            }`}
            title={
              soundEnabled
                ? "Sound ON - Click to mute"
                : "Sound OFF - Click to enable"
            }
          >
            {soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF"}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              autoRefresh
                ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                : "bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30"
            }`}
          >
            {autoRefresh ? "⏸ Pause" : "▶ Start"} Auto-refresh
          </button>
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
                        All validators are currently behaving ethically!
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
            <span className="text-gray-400">Commission Increase ≥ 10%</span>
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 border border-white/10">
              📊 INFO
            </span>
            <span className="text-gray-400">All other commission changes</span>
          </div>
        </div>
      </div>

      {/* Email Subscription */}
      <div className="glass rounded-2xl p-8 max-w-2xl mx-auto border-2 border-orange-500/20 mt-8">
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
            className="flex flex-col gap-4 max-w-lg mx-auto mt-6"
          >
            {/* Email Preference Selector */}
            <div className="flex flex-col gap-2 items-center">
              <label className="text-sm text-gray-400 text-center">
                Email me for:
              </label>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setEmailPreference("rugs_only")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    emailPreference === "rugs_only"
                      ? "bg-red-500/30 text-red-300 border-2 border-red-500"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  🚨 Rugs
                </button>
                <button
                  type="button"
                  onClick={() => setEmailPreference("rugs_and_cautions")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    emailPreference === "rugs_and_cautions"
                      ? "bg-yellow-500/30 text-yellow-300 border-2 border-yellow-500"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  ⚠️ Increase ≥ 10%
                </button>
                <button
                  type="button"
                  onClick={() => setEmailPreference("all")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    emailPreference === "all"
                      ? "bg-blue-500/30 text-blue-300 border-2 border-blue-500"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  📊 All Changes
                </button>
              </div>
            </div>

            {/* Email Input and Submit */}
            <div className="flex flex-col sm:flex-row gap-3">
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
