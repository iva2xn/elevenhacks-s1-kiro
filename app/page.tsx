"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import SkeletonCanvas from "@/components/skeleton-canvas";
import { WorkoutCard } from "@/components/workout-card";
import { validateForm, type NormalizedLandmark, type FormValidationResult } from "@/lib/form-validator";
import { updateRepCounter, initialRepCounterState, type RepCounterState } from "@/lib/rep-counter";
import { createVoiceFeedbackEngine, type VoiceFeedbackEngine } from "@/lib/voice-feedback-engine";
import { useDailyVolume } from "@/lib/use-daily-volume";
import type { ExerciseId } from "@/lib/calorie-utils";

// ─── Dynamic imports (browser-only components) ───────────────────────────────
// CameraFeed and PoseEstimator use browser APIs (getUserMedia, WebGL, rAF)
// and must never run on the server.
const CameraFeed = dynamic(() => import("@/components/camera-feed"), { ssr: false });
const PoseEstimator = dynamic(() => import("@/components/pose-estimator"), { ssr: false });
const DevModeFeed = dynamic(() => import("@/components/dev-mode-feed"), { ssr: false });

// ─── Over-exercise warning message ───────────────────────────────────────────
const OVER_THRESHOLD_MESSAGE =
  "You've hit your limit for today. Don't be too hard on yourself — rest is part of the process. Take a break and come back tomorrow.";

// ─── Format seconds as M:SS ──────────────────────────────────────────────────
function formatHoldTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  // ── Today's day index (0 = Sunday) ─────────────────────────────────────────
  const today = new Date().getDay();

  // ── Camera / pose state ────────────────────────────────────────────────────
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState<"denied" | "unsupported" | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);

  // ── Form validation state ──────────────────────────────────────────────────
  const [formResult, setFormResult] = useState<FormValidationResult>({
    status: "unknown",
    cue: null,
  });

  // ── Rep counter state ──────────────────────────────────────────────────────
  const [repCounterState, setRepCounterState] = useState<RepCounterState>(
    initialRepCounterState()
  );

  // ── Session state ──────────────────────────────────────────────────────────
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [activeVariation, setActiveVariation] = useState<ExerciseId>("push-ups");

  // ── Settings ───────────────────────────────────────────────────────────────
  const [devMode, setDevMode] = useState(false);
  const [hideOverlays, setHideOverlays] = useState(false);

  // Reset video element when switching modes so PoseEstimator gets a fresh ref
  const handleDevModeChange = useCallback((val: boolean) => {
    setDevMode(val);
    setVideoEl(null);
    setCameraError(null);
  }, []);

  // ── Refs for stale-closure-safe access inside useCallback ─────────────────
  const isSessionActiveRef = useRef(false);
  const activeVariationRef = useRef<ExerciseId>("push-ups");
  const lastTimestampRef = useRef<number>(0);

  // Keep refs in sync with state
  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  useEffect(() => {
    activeVariationRef.current = activeVariation;
  }, [activeVariation]);

  // ── Voice feedback engine (created once) ──────────────────────────────────
  const voiceEngine = useMemo<VoiceFeedbackEngine>(() => createVoiceFeedbackEngine(), []);

  // Dispose on unmount
  useEffect(() => {
    return () => voiceEngine.dispose();
  }, [voiceEngine]);

  // ── Daily volume ───────────────────────────────────────────────────────────
  const { dailyVolume, addSession, isOverThreshold } = useDailyVolume();

  // ── Over-exercise detection ────────────────────────────────────────────────
  // Fire the warning exactly once when isOverThreshold flips from false → true.
  const prevIsOverThresholdRef = useRef(false);
  useEffect(() => {
    if (isOverThreshold && !prevIsOverThresholdRef.current) {
      // Play TTS warning via fetch('/api/tts') as specified in Task 11
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: OVER_THRESHOLD_MESSAGE }),
      })
        .then((res) => {
          if (!res.ok) return;
          return res.blob();
        })
        .then((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          audio.play().catch((e) => console.error("TTS playback failed", e));
        })
        .catch((e) => console.error("TTS over-threshold warning failed", e));

      // Also enqueue via voice engine as a fallback
      voiceEngine.enqueue(OVER_THRESHOLD_MESSAGE);
    }
    prevIsOverThresholdRef.current = isOverThreshold;
  }, [isOverThreshold, voiceEngine]);

  // ── Camera callbacks ───────────────────────────────────────────────────────
  const onStreamReady = useCallback((el: HTMLVideoElement) => {
    setVideoEl(el);
  }, []);

  const onCameraError = useCallback((reason: "denied" | "unsupported") => {
    setCameraError(reason);
  }, []);

  // ── Landmark processing ────────────────────────────────────────────────────
  // Called on every animation frame by PoseEstimator.
  const onLandmarks = useCallback((lms: NormalizedLandmark[] | null) => {
    setLandmarks(lms);

    if (!isSessionActiveRef.current) return;

    const now = performance.now();
    const deltaSeconds =
      lastTimestampRef.current > 0
        ? (now - lastTimestampRef.current) / 1000
        : 1 / 30;
    lastTimestampRef.current = now;

    // Update form validation
    const result = validateForm(lms, activeVariationRef.current);
    setFormResult(result);

    // Update rep counter (pure state machine)
    setRepCounterState((prev) =>
      updateRepCounter(prev, lms, activeVariationRef.current, deltaSeconds)
    );
  }, []);

  // ── WorkoutCard session lifecycle ──────────────────────────────────────────
  // Called when WorkoutCard starts a set — receives the active exercise variation
  const onSessionStart = useCallback((variation: ExerciseId) => {
    setIsSessionActive(true);
    setActiveVariation(variation);
    setRepCounterState(initialRepCounterState());
  }, []);

  // Called when WorkoutCard ends the session (reset or finished)
  const onSessionEnd = useCallback(() => {
    setIsSessionActive(false);
    // Persist reps to daily volume
    setRepCounterState((prev) => {
      const reps = prev.count;
      if (reps > 0) {
        const durationHours = (reps * 30) / 3600;
        const calories = 8.0 * 70 * durationHours;
        addSession(reps, calories);
      }
      return initialRepCounterState();
    });
    setFormResult({ status: "unknown", cue: null });
    lastTimestampRef.current = 0;
  }, [addSession]);

  // Legacy mirror-mode change handler (kept for backward compat)
  const onMirrorModeChange = useCallback(
    (active: boolean) => {
      if (!active) {
        onSessionEnd();
      }
    },
    [onSessionEnd]
  );

  // ── Derived display values ─────────────────────────────────────────────────
  const repCount = repCounterState.count;
  const holdSeconds = repCounterState.holdSeconds;
  const isPlank = activeVariation === "plank";

  // liveRepCount: for plank show hold seconds, for others show rep count
  const liveRepCount = isPlank ? Math.floor(holdSeconds) : repCount;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Full-screen black background — camera feed renders on top of this
    <div style={{ position: "fixed", inset: 0, backgroundColor: "#000" }}>

      {/* ── Layer 0: Camera feed or Dev Mode feed ──────────────────────── */}
      {devMode ? (
        <DevModeFeed onStreamReady={onStreamReady} />
      ) : (
        <CameraFeed
          onStreamReady={onStreamReady}
          onError={onCameraError}
          mirrored={true}
        />
      )}

      {/* ── Pose estimator (logic-only, renders nothing) ────────────────── */}
      <PoseEstimator
        videoEl={videoEl}
        isActive={isSessionActive && !cameraError}
        onLandmarks={onLandmarks}
      />

      {/* ── Layer 1: Skeleton canvas overlay ───────────────────────────── */}
      {/* Always mounted; draws nothing when landmarks is null */}
      <SkeletonCanvas
        landmarks={landmarks}
        formStatus={formResult.status}
        activeVariation={activeVariation}
        videoEl={videoEl}
      />

      {/* ── Camera error overlays ───────────────────────────────────────── */}
      {cameraError === "denied" && (
        <div
          role="alert"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.85)",
            color: "#fff",
            zIndex: 5,
            textAlign: "center",
            padding: "24px",
            fontSize: "1rem",
          }}
        >
          Camera access denied. Please allow camera access to use pose tracking.
        </div>
      )}
      {cameraError === "unsupported" && (
        <div
          role="alert"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.85)",
            color: "#fff",
            zIndex: 5,
            textAlign: "center",
            padding: "24px",
            fontSize: "1rem",
          }}
        >
          Camera not supported on this device.
        </div>
      )}

      {/* ── Layer 10: Form feedback overlay ────────────────────────────── */}
      {isSessionActive && !hideOverlays && (
        <div
          style={{
            position: "fixed",
            bottom: "260px", // sit above the WorkoutCard (~240px tall)
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {formResult.status === "good" && (
            <span
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "#22c55e",
                fontWeight: 700,
                fontSize: "0.875rem",
                padding: "6px 14px",
                borderRadius: "9999px",
                border: "1px solid rgba(34,197,94,0.4)",
                letterSpacing: "0.02em",
              }}
              role="status"
              aria-live="polite"
            >
              ✓ Good Form
            </span>
          )}
          {formResult.status === "bad" && formResult.cue && (
            <span
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "#ef4444",
                fontWeight: 700,
                fontSize: "0.875rem",
                padding: "6px 14px",
                borderRadius: "9999px",
                border: "1px solid rgba(239,68,68,0.4)",
                letterSpacing: "0.02em",
              }}
              role="alert"
              aria-live="assertive"
            >
              {formResult.cue}
            </span>
          )}
          {landmarks === null && (
            <span
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "rgba(255,255,255,0.7)",
                fontWeight: 600,
                fontSize: "0.875rem",
                padding: "6px 14px",
                borderRadius: "9999px",
                border: "1px solid rgba(255,255,255,0.2)",
                letterSpacing: "0.02em",
              }}
              role="status"
              aria-live="polite"
            >
              No pose detected
            </span>
          )}
        </div>
      )}

      {/* ── Layer 10: Rep count / hold time overlay (top-left) ─────────── */}
      {isSessionActive && !hideOverlays && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            left: "24px",
            zIndex: 10,
            backgroundColor: "rgba(0,0,0,0.55)",
            borderRadius: "12px",
            padding: "12px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: "80px",
          }}
          aria-live="polite"
          role="status"
        >
          <span
            style={{
              color: "#fff",
              fontSize: "3rem",
              fontWeight: 900,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {isPlank ? formatHoldTime(holdSeconds) : repCount}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginTop: "4px",
            }}
          >
            {isPlank ? "HOLD" : "REPS"}
          </span>
        </div>
      )}

      {/* ── Layer 10: Daily volume indicator (top-right) ───────────────── */}
      {dailyVolume.reps > 0 && !hideOverlays && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            zIndex: 10,
            backgroundColor: "rgba(0,0,0,0.55)",
            borderRadius: "12px",
            padding: "8px 14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
          aria-label={`Today's total: ${dailyVolume.reps} reps`}
        >
          <span
            style={{
              color: isOverThreshold ? "#ef4444" : "rgba(255,255,255,0.9)",
              fontSize: "1.25rem",
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {dailyVolume.reps}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.6rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: "2px",
            }}
          >
            TODAY
          </span>
        </div>
      )}

      {/* ── Layer 20: WorkoutCard (fixed bottom, z-index set internally) ── */}
      <WorkoutCard
        today={today}
        onMirrorModeChange={onMirrorModeChange}
        onSessionStart={onSessionStart}
        onSessionEnd={onSessionEnd}
        liveRepCount={liveRepCount}
        dailyVolume={dailyVolume}
        devMode={devMode}
        onDevModeChange={handleDevModeChange}
        hideOverlays={hideOverlays}
        onHideOverlaysChange={setHideOverlays}
      />
    </div>
  );
}
