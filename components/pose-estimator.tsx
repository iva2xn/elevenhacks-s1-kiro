"use client";

import { useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@/lib/form-validator";

interface PoseEstimatorProps {
  videoEl: HTMLVideoElement | null;
  isActive: boolean;
  onLandmarks: (landmarks: NormalizedLandmark[] | null) => void;
}

export default function PoseEstimator({
  videoEl,
  isActive,
  onLandmarks,
}: PoseEstimatorProps) {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafHandleRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  // Keep a stable ref to the callback to avoid stale closures in the rAF loop
  const onLandmarksRef = useRef(onLandmarks);
  useEffect(() => {
    onLandmarksRef.current = onLandmarks;
  });

  // Initialise PoseLandmarker once on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        if (!cancelled) {
          poseLandmarkerRef.current = poseLandmarker;
        } else {
          poseLandmarker.close();
        }
      } catch (err) {
        console.error("PoseEstimator: failed to initialise PoseLandmarker", err);
        // Continuously emit null so callers know detection is unavailable
        onLandmarksRef.current(null);
      }
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandleRef.current);
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
    };
  }, []);

  // Manage the rAF loop whenever videoEl or isActive changes
  useEffect(() => {
    // Cancel any existing loop first
    cancelAnimationFrame(rafHandleRef.current);

    if (!isActive || !videoEl) {
      onLandmarksRef.current(null);
      return;
    }

    function detect(timestamp: number) {
      if (
        !poseLandmarkerRef.current ||
        !videoEl ||
        videoEl.readyState < 2
      ) {
        rafHandleRef.current = requestAnimationFrame(detect);
        return;
      }

      if (videoEl.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = videoEl.currentTime;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = poseLandmarkerRef.current.detectForVideo(videoEl, timestamp) as any;
        if (result.landmarks && result.landmarks.length > 0) {
          onLandmarksRef.current(result.landmarks[0] as NormalizedLandmark[]);
        } else {
          onLandmarksRef.current(null);
        }
      }

      rafHandleRef.current = requestAnimationFrame(detect);
    }

    rafHandleRef.current = requestAnimationFrame(detect);

    return () => {
      cancelAnimationFrame(rafHandleRef.current);
    };
  }, [videoEl, isActive]);

  // Logic-only component — renders nothing
  return null;
}
