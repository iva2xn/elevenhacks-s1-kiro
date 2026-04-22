"use client";

import { useState, useEffect } from "react";

export interface DailyVolume {
  reps: number;
  calories: number;
  date: string; // YYYY-MM-DD
}

export interface UseDailyVolumeReturn {
  dailyVolume: DailyVolume;
  addSession(reps: number, calories: number): void;
  threshold: number;
  setThreshold(n: number): void;
  isOverThreshold: boolean;
}

/** Returns today's date as a YYYY-MM-DD string. */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns the localStorage key for today's daily volume. */
function getTodayKey(): string {
  return `pushup-daily-volume-${getTodayDate()}`;
}

const DEFAULT_THRESHOLD = 200;

function makeZeroVolume(): DailyVolume {
  return { reps: 0, calories: 0, date: getTodayDate() };
}

export function useDailyVolume(
  defaultThreshold?: number
): UseDailyVolumeReturn {
  const [dailyVolume, setDailyVolume] = useState<DailyVolume>(makeZeroVolume);
  const [threshold, setThreshold] = useState<number>(
    defaultThreshold ?? DEFAULT_THRESHOLD
  );

  // On mount: hydrate from localStorage if the stored date matches today.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) {
        const parsed: DailyVolume = JSON.parse(raw) as DailyVolume;
        if (parsed.date === getTodayDate()) {
          setDailyVolume(parsed);
        }
        // If date differs, keep the zero state already set.
      }
    } catch {
      // SecurityError (private browsing) or JSON parse error — operate in-memory only.
    }
  }, []);

  function addSession(reps: number, calories: number): void {
    const today = getTodayDate();
    setDailyVolume((prev) => {
      const next: DailyVolume = {
        reps: prev.reps + reps,
        calories: prev.calories + calories,
        date: today,
      };
      try {
        localStorage.setItem(getTodayKey(), JSON.stringify(next));
      } catch {
        // SecurityError — operate in-memory only.
      }
      return next;
    });
  }

  const isOverThreshold = dailyVolume.reps > threshold;

  return {
    dailyVolume,
    addSession,
    threshold,
    setThreshold,
    isOverThreshold,
  };
}
