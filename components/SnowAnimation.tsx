"use client";
import { useState } from "react";

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
  rotation: number; // Rotation speed for spinning effect
}

export default function SnowAnimation() {
  // Generate snowflakes immediately on mount
  const generateSnowflakes = (): Snowflake[] => {
    const count = 40; // Number of snowflakes (reduced for subtlety)
    const flakes: Snowflake[] = [];

    for (let i = 0; i < count; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100, // Random horizontal position
        animationDuration: 6 + Math.random() * 10, // 6-16 seconds (faster than before)
        animationDelay: Math.random() * 1, // Small random delay (0-1s) for staggered start
        size: 4 + Math.random() * 6, // 4-10px (subtle size)
        opacity: 0.3 + Math.random() * 0.4, // 0.3-0.7 opacity (subtle)
        rotation: Math.random() * 360, // Random starting rotation
      });
    }

    return flakes;
  };

  const [snowflakes] = useState<Snowflake[]>(generateSnowflakes);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {snowflakes.map((flake) => {
        return (
          <div
            key={flake.id}
            className="snowflake absolute top-0"
            style={{
              left: `${flake.left}%`,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              opacity: flake.opacity,
              animation: `snowfall ${flake.animationDuration}s linear infinite`,
              animationDelay: `${flake.animationDelay}s`, // Negative delays start mid-animation
            }}
          >
            {/* Snowflake shape using CSS */}
            <div className="absolute inset-0">
              {/* 6 arms of the snowflake */}
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: "50%",
                    top: "50%",
                    width: `${Math.max(1, flake.size * 0.2)}px`,
                    height: `${flake.size * 0.6}px`,
                    background: `rgba(6, 182, 212, ${flake.opacity})`,
                    transformOrigin: "center top",
                    transform: `translate(-50%, -50%) rotate(${i * 60}deg)`,
                    borderRadius: "1px",
                    boxShadow: `0 0 ${flake.size * 0.3}px rgba(6, 182, 212, ${
                      flake.opacity * 0.6
                    })`,
                  }}
                />
              ))}
              {/* Center dot */}
              <div
                className="absolute"
                style={{
                  left: "50%",
                  top: "50%",
                  width: `${flake.size * 0.3}px`,
                  height: `${flake.size * 0.3}px`,
                  background: `rgba(6, 182, 212, ${flake.opacity})`,
                  borderRadius: "50%",
                  transform: "translate(-50%, -50%)",
                  boxShadow: `0 0 ${flake.size * 0.4}px rgba(6, 182, 212, ${
                    flake.opacity * 0.5
                  })`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
