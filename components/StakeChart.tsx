"use client";

import { useEffect, useRef } from "react";

type StakeDataPoint = {
  epoch: number;
  activeStake: number;
  activatingStake?: number;
  deactivatingStake?: number;
};

export default function StakeChart({ data }: { data: StakeDataPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 80 };

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Find min/max for scaling
    const maxStake = Math.max(...data.map((d) => d.activeStake));
    const minStake = Math.min(...data.map((d) => d.activeStake));
    const minEpoch = data[0].epoch;
    const maxEpoch = data[data.length - 1].epoch;

    // Helper functions
    const xScale = (epoch: number) =>
      padding.left +
      ((epoch - minEpoch) / (maxEpoch - minEpoch)) *
        (width - padding.left - padding.right);

    const yScale = (stake: number) =>
      height -
      padding.bottom -
      ((stake - minStake) / (maxStake - minStake)) *
        (height - padding.top - padding.bottom);

    // Draw grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + ((height - padding.top - padding.bottom) * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Draw stake line with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(34, 197, 94, 0.8)"); // green
    gradient.addColorStop(1, "rgba(34, 197, 94, 0.2)");

    // Draw area under the line
    ctx.beginPath();
    ctx.moveTo(xScale(data[0].epoch), height - padding.bottom);
    data.forEach((d) => {
      ctx.lineTo(xScale(d.epoch), yScale(d.activeStake));
    });
    ctx.lineTo(xScale(data[data.length - 1].epoch), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(xScale(data[0].epoch), yScale(data[0].activeStake));
    data.forEach((d) => {
      ctx.lineTo(xScale(d.epoch), yScale(d.activeStake));
    });
    ctx.strokeStyle = "rgba(34, 197, 94, 1)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw points
    data.forEach((d) => {
      ctx.beginPath();
      ctx.arc(xScale(d.epoch), yScale(d.activeStake), 4, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(34, 197, 94, 1)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw Y-axis labels (stake amounts)
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const stake = minStake + ((maxStake - minStake) * (5 - i)) / 5;
      const y = padding.top + ((height - padding.top - padding.bottom) * i) / 5;

      // Format stake amounts: M for millions, K for thousands
      let label: string;
      if (stake >= 1000000) {
        label = `${(stake / 1000000).toFixed(2)}M`;
      } else if (stake >= 1000) {
        label = `${(stake / 1000).toFixed(0)}K`;
      } else {
        label = stake.toFixed(0);
      }

      ctx.fillText(label, padding.left - 10, y + 4);
    }

    // Draw X-axis labels (epochs)
    ctx.textAlign = "center";
    const epochStep = Math.max(1, Math.floor(data.length / 8));
    data.forEach((d, i) => {
      if (i % epochStep === 0 || i === data.length - 1) {
        ctx.fillText(
          `${d.epoch}`,
          xScale(d.epoch),
          height - padding.bottom + 20
        );
      }
    });

    // Draw axis labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Epoch", width / 2, height - 5);

    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Active Stake (SOL)", 0, 0);
    ctx.restore();
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-400">
        No stake history available yet
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px]">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
