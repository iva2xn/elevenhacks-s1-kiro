"use client";

import { useEffect, useRef } from "react";
import type { NormalizedLandmark } from "@/lib/form-validator";
import type { ExerciseId } from "@/lib/calorie-utils";

interface SkeletonCanvasProps {
  landmarks: NormalizedLandmark[] | null;
  formStatus: "good" | "bad" | "unknown";
  activeVariation: ExerciseId;
  videoEl: HTMLVideoElement | null;
}

const VARIATION_CONNECTIONS: Record<ExerciseId, [number, number][]> = {
  "push-ups": [
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 12], [11, 23], [12, 24], [23, 24],
    [23, 27], [24, 28],
  ],
  "diamond-push-ups": [
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 12], [15, 16],
  ],
  "wide-push-ups": [
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 12], [15, 16],
  ],
  "archer-push-ups": [
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 12],
  ],
  "decline-push-ups": [
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 12], [11, 23], [12, 24], [23, 27], [24, 28],
  ],
  "incline-push-ups": [
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 12], [11, 23], [12, 24],
  ],
  "plank": [
    [11, 12], [11, 23], [12, 24], [23, 24],
    [23, 27], [24, 28],
  ],
};

function getStrokeColor(formStatus: "good" | "bad" | "unknown"): string {
  if (formStatus === "good") return "#22c55e";
  if (formStatus === "bad") return "#ef4444";
  return "rgba(255,255,255,0.5)";
}

export default function SkeletonCanvas({
  landmarks,
  formStatus,
  activeVariation,
  videoEl,
}: SkeletonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep canvas dimensions in sync with the video element
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return;

    const syncSize = () => {
      canvas.width = videoEl.offsetWidth;
      canvas.height = videoEl.offsetHeight;
    };

    syncSize();

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(videoEl);

    window.addEventListener("resize", syncSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [videoEl]);

  // Redraw skeleton on every relevant change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks || landmarks.length === 0) return;

    const connections = VARIATION_CONNECTIONS[activeVariation];
    const color = getStrokeColor(formStatus);

    // Draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    for (const [a, b] of connections) {
      const lmA = landmarks[a];
      const lmB = landmarks[b];

      if (!lmA || !lmB) continue;
      if (lmA.visibility < 0.5 || lmB.visibility < 0.5) continue;

      const ax = lmA.x * canvas.width;
      const ay = lmA.y * canvas.height;
      const bx = lmB.x * canvas.width;
      const by = lmB.y * canvas.height;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Collect unique joint indices from the variation's connections
    const jointIndices = new Set<number>();
    for (const [a, b] of connections) {
      jointIndices.add(a);
      jointIndices.add(b);
    }

    // Draw filled circles at each visible joint
    ctx.fillStyle = color;

    for (const idx of jointIndices) {
      const lm = landmarks[idx];
      if (!lm || lm.visibility < 0.5) continue;

      const px = lm.x * canvas.width;
      const py = lm.y * canvas.height;

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [landmarks, formStatus, activeVariation, videoEl]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}
