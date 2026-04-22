"use client";

import { useEffect, useRef } from "react";
import type { NormalizedLandmark } from "@/lib/form-validator";

interface PoseEstimatorProps {
  videoEl: HTMLVideoElement | null;
  isActive: boolean;
  onLandmarks: (landmarks: NormalizedLandmark[] | null) => void;
}

export default function PoseEstimator({ videoEl, isActive, onLandmarks }: PoseEstimatorProps) {
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<OffscreenCanvas | null>(null);
  const ctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const workerReadyRef = useRef(false);
  const pendingFrameRef = useRef(false);

  const isActiveRef = useRef(isActive);
  const videoElRef = useRef(videoEl);
  const onLandmarksRef = useRef(onLandmarks);

  useEffect(() => { onLandmarksRef.current = onLandmarks; });
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { videoElRef.current = videoEl; }, [videoEl]);

  // ── Spawn worker once ──────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker("/pose-worker.js");
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, landmarks } = e.data;

      if (type === "ready") {
        workerReadyRef.current = true;
        return;
      }

      if (type === "landmarks") {
        pendingFrameRef.current = false;
        if (isActiveRef.current) {
          onLandmarksRef.current(landmarks ?? null);
        }
      }

      if (type === "error") {
        console.error("[PoseEstimator]", e.data.message);
      }
    };

    worker.postMessage({ type: "init" });

    return () => {
      cancelAnimationFrame(rafRef.current);
      worker.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, []);

  // ── rAF loop: capture frame → send ImageBitmap to worker ──────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    lastVideoTimeRef.current = -1;
    pendingFrameRef.current = false;

    if (!isActive || !videoEl) {
      onLandmarksRef.current(null);
      return;
    }

    // Create a small OffscreenCanvas for frame capture
    // 256×256 is enough for pose detection and much faster to transfer
    const W = 256;
    const H = 256;
    if (!canvasRef.current) {
      canvasRef.current = new OffscreenCanvas(W, H);
      ctxRef.current = canvasRef.current.getContext("2d") as OffscreenCanvasRenderingContext2D;
    }

    function capture() {
      const vid = videoElRef.current;

      // Always schedule next frame first so UI never stalls
      rafRef.current = requestAnimationFrame(capture);

      if (!isActiveRef.current || !vid || vid.readyState < 2) return;
      if (!workerReadyRef.current) return;

      // Skip if video hasn't advanced
      if (vid.currentTime === lastVideoTimeRef.current) return;

      // Skip if worker is still processing previous frame
      if (pendingFrameRef.current) return;

      lastVideoTimeRef.current = vid.currentTime;
      pendingFrameRef.current = true;

      const ctx = ctxRef.current!;
      ctx.drawImage(vid, 0, 0, W, H);

      // createImageBitmap is zero-copy transferable — no serialization cost
      createImageBitmap(canvasRef.current!).then((bitmap) => {
        workerRef.current?.postMessage(
          { type: "frame", bitmap, timestamp: performance.now() },
          [bitmap] // transfer ownership — avoids copying pixel data
        );
      });
    }

    rafRef.current = requestAnimationFrame(capture);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoEl, isActive]);

  return null;
}
