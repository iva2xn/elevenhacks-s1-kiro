"use client";

import { useEffect, useRef } from "react";
import type { NormalizedLandmark } from "@/lib/form-validator";
import type { ExerciseId } from "@/lib/calorie-utils";

interface SkeletonCanvasProps {
  landmarksRef: React.RefObject<NormalizedLandmark[] | null>;
  activeVariation: ExerciseId;
  videoEl: HTMLVideoElement | null;
  isActive: boolean;
}

const VARIATION_CONNECTIONS: Record<ExerciseId, [number, number][]> = {
  "push-ups": [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,27],[24,28]],
  "diamond-push-ups": [[11,13],[13,15],[12,14],[14,16],[11,12],[15,16]],
  "wide-push-ups": [[11,13],[13,15],[12,14],[14,16],[11,12],[15,16]],
  "archer-push-ups": [[11,13],[13,15],[12,14],[14,16],[11,12]],
  "decline-push-ups": [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,27],[24,28]],
  "incline-push-ups": [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24]],
  "plank": [[11,12],[11,23],[12,24],[23,24],[23,27],[24,28]],
};

const COLOR = "rgba(255,255,255,0.75)";

function getVideoRect(vid: HTMLVideoElement) {
  const elemW = vid.offsetWidth || vid.clientWidth;
  const elemH = vid.offsetHeight || vid.clientHeight;
  const vidW = vid.videoWidth;
  const vidH = vid.videoHeight;
  if (!vidW || !vidH) return { x: 0, y: 0, w: elemW, h: elemH };
  const elemAspect = elemW / elemH;
  const vidAspect = vidW / vidH;
  let rw: number, rh: number, ox: number, oy: number;
  if (vidAspect > elemAspect) {
    rw = elemW; rh = elemW / vidAspect; ox = 0; oy = (elemH - rh) / 2;
  } else {
    rh = elemH; rw = elemH * vidAspect; ox = (elemW - rw) / 2; oy = 0;
  }
  const rect = vid.getBoundingClientRect();
  return { x: rect.left + ox, y: rect.top + oy, w: rw, h: rh };
}

export default function SkeletonCanvas({ landmarksRef, activeVariation, videoEl, isActive }: SkeletonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const activeVariationRef = useRef(activeVariation);

  useEffect(() => { activeVariationRef.current = activeVariation; }, [activeVariation]);

  // Size canvas to viewport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // Own rAF draw loop — completely independent of React renders
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    if (!isActive || !videoEl) return;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = landmarksRef.current;
      if (!landmarks || landmarks.length === 0 || !videoEl) return;

      const vr = getVideoRect(videoEl);
      const conns = VARIATION_CONNECTIONS[activeVariationRef.current];
      const toX = (lm: NormalizedLandmark) => vr.x + lm.x * vr.w;
      const toY = (lm: NormalizedLandmark) => vr.y + lm.y * vr.h;

      ctx.beginPath();
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < conns.length; i++) {
        const a = landmarks[conns[i][0]];
        const b = landmarks[conns[i][1]];
        if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) continue;
        ctx.moveTo(toX(a), toY(a));
        ctx.lineTo(toX(b), toY(b));
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = COLOR;
      const drawn = new Set<number>();
      for (let i = 0; i < conns.length; i++) {
        for (const idx of conns[i]) {
          if (drawn.has(idx)) continue;
          drawn.add(idx);
          const lm = landmarks[idx];
          if (!lm || lm.visibility < 0.3) continue;
          const px = toX(lm); const py = toY(lm);
          ctx.moveTo(px + 4, py);
          ctx.arc(px, py, 4, 0, 6.283);
        }
      }
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoEl, isActive, landmarksRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none" }}
    />
  );
}
