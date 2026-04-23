"use client";

import { useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@/lib/form-validator";

interface PoseEstimatorProps {
  videoEl: HTMLVideoElement | null;
  isActive: boolean;
  onLandmarks: (landmarks: NormalizedLandmark[] | null) => void;
}

const MEDIAPIPE_VERSION = "0.10.34";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export default function PoseEstimator({ videoEl, isActive, onLandmarks }: PoseEstimatorProps) {
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const isActiveRef = useRef(isActive);
  const videoElRef = useRef(videoEl);
  const onLandmarksRef = useRef(onLandmarks);

  useEffect(() => { onLandmarksRef.current = onLandmarks; });
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { videoElRef.current = videoEl; }, [videoEl]);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          const vision = await FilesetResolver.forVisionTasks(WASM_URL);
          const lm = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.4,
            minPosePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
          if (!cancelled) {
            landmarkerRef.current = lm;
            console.info(`PoseEstimator: ready (${delegate})`);
          } else {
            lm.close();
          }
          return;
        } catch (e) {
          console.warn(`PoseEstimator: ${delegate} failed`, e);
        }
      }
      console.error("PoseEstimator: init failed");
      onLandmarksRef.current(null);
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  // ── Detection loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    lastVideoTimeRef.current = -1;

    if (!isActive || !videoEl) {
      onLandmarksRef.current(null);
      return;
    }

    function detect() {
      // Schedule next IMMEDIATELY so UI never stalls
      rafRef.current = requestAnimationFrame(detect);

      const vid = videoElRef.current;
      const lm = landmarkerRef.current;
      if (!isActiveRef.current || !vid || vid.readyState < 2 || !lm) return;

      // Only run when video has a new frame
      if (vid.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = vid.currentTime;

      try {
        const result = lm.detectForVideo(vid, performance.now()) as any;
        if (result?.landmarks?.length > 0) {
          onLandmarksRef.current(result.landmarks[0] as NormalizedLandmark[]);
        } else {
          onLandmarksRef.current(null);
        }
      } catch {
        onLandmarksRef.current(null);
      }
    }

    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoEl, isActive]);

  return null;
}
