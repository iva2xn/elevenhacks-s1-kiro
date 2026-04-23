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
  const landmarksRef = useRef<NormalizedLandmark[] | null>(null);

  // ── Summary overlay state ──────────────────────────────────────────────────
  const [showSummary, setShowSummary] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

  // ── Form validation — ref for per-frame updates, state for UI at lower freq
  const formResultRef = useRef<FormValidationResult>({ status: "unknown", cue: null });
  const [formResult, setFormResult] = useState<FormValidationResult>({ status: "unknown", cue: null });

  // ── Rep counter — ref for per-frame updates, state for UI at lower freq
  const repCounterRef = useRef<RepCounterState>(initialRepCounterState());
  const [repCounterState, setRepCounterState] = useState<RepCounterState>(initialRepCounterState());

  // Sync refs to state at ~10fps for UI updates (not every frame)
  const uiUpdateRef = useRef<number>(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFormResult({ ...formResultRef.current });
      setRepCounterState({ ...repCounterRef.current });
    }, 100); // 10fps UI updates
    return () => clearInterval(id);
  }, []);

  // ── Session state ──────────────────────────────────────────────────────────
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [activeVariation, setActiveVariation] = useState<ExerciseId>("push-ups");

  // ── Settings ───────────────────────────────────────────────────────────────
  const [devMode, setDevMode] = useState(false);
  const [hideOverlays, setHideOverlays] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

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

  // ── Form error log for post-set summary ──────────────────────────────────
  const formErrorsRef = useRef<string[]>([]);

  // ── Landmark processing ────────────────────────────────────────────────────
  const onLandmarks = useCallback((lms: NormalizedLandmark[] | null) => {
    landmarksRef.current = lms;

    if (!isSessionActiveRef.current) return;

    const now = performance.now();
    const deltaSeconds =
      lastTimestampRef.current > 0
        ? (now - lastTimestampRef.current) / 1000
        : 1 / 30;
    lastTimestampRef.current = now;

    // Update form validation — write to ref, not state
    const result = validateForm(lms, activeVariationRef.current);
    formResultRef.current = result;

    // Log bad-form cues (deduplicated — only log when cue changes)
    if (result.status === "bad" && result.cue) {
      const last = formErrorsRef.current[formErrorsRef.current.length - 1];
      if (last !== result.cue) {
        formErrorsRef.current.push(result.cue);
      }
    }

    // Update rep counter — write to ref, not state
    repCounterRef.current = updateRepCounter(
      repCounterRef.current, lms, activeVariationRef.current, deltaSeconds
    );
  }, []);

  // ── WorkoutCard session lifecycle ──────────────────────────────────────────
  // Called when WorkoutCard starts a set — receives the active exercise variation
  const onSessionStart = useCallback((variation: ExerciseId) => {
    setIsSessionActive(true);
    setActiveVariation(variation);
    repCounterRef.current = initialRepCounterState();
    setRepCounterState(initialRepCounterState());
    formResultRef.current = { status: "unknown", cue: null };
    setFormResult({ status: "unknown", cue: null });
    formErrorsRef.current = [];
  }, []);

  const onSessionEnd = useCallback(() => {
    setIsSessionActive(false);
    const reps = repCounterRef.current.count;
    if (reps > 0) {
      const durationHours = (reps * 30) / 3600;
      const calories = 8.0 * 70 * durationHours;
      addSession(reps, calories);
    }
    repCounterRef.current = initialRepCounterState();
    setRepCounterState(initialRepCounterState());
    formResultRef.current = { status: "unknown", cue: null };
    setFormResult({ status: "unknown", cue: null });
    lastTimestampRef.current = 0;
    formErrorsRef.current = [];
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
    // White background when no camera feed is active
    <div style={{ position: "fixed", inset: 0, backgroundColor: "#f4f4f5" }}>

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
      {showSkeleton && (
        <SkeletonCanvas
          landmarksRef={landmarksRef}
          activeVariation={activeVariation}
          videoEl={videoEl}
          isActive={isSessionActive}
        />
      )}

      {/* ── Camera error / status cards ─────────────────────────────────── */}
      {(cameraError === "denied" || cameraError === "unsupported") && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: "300px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 15,
            backgroundColor: "#fff",
            borderRadius: "16px",
            border: "1px solid #e4e4e7",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: "1.1rem" }}>📷</span>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#3f3f46" }}>
            {cameraError === "denied"
              ? "Camera access denied — allow camera to enable pose tracking"
              : "Camera not supported on this device"}
          </span>
        </div>
      )}

      {/* ── Layer 10: Form feedback overlay ────────────────────────────── */}
      {isSessionActive && !hideOverlays && (
        <div
          style={{
            position: "fixed",
            bottom: "300px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {formResult.status === "good" && (
            <div
              style={{
                backgroundColor: "#22c55e",
                borderRadius: "12px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              role="status"
              aria-live="polite"
            >
              <span style={{ color: "#fff", fontSize: "0.9rem" }}>✓</span>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.8rem" }}>Good Form</span>
            </div>
          )}
          {formResult.status === "bad" && formResult.cue && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: "1px solid #e4e4e7",
                boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              role="alert"
              aria-live="assertive"
            >
              <span style={{ color: "#ef4444", fontSize: "0.9rem" }}>⚠</span>
              <span style={{ color: "#3f3f46", fontWeight: 700, fontSize: "0.8rem" }}>{formResult.cue}</span>
            </div>
          )}
          {formResult.status === "unknown" && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: "1px solid #e4e4e7",
                boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              role="status"
              aria-live="polite"
            >
              <span style={{ color: "#a1a1aa", fontWeight: 600, fontSize: "0.8rem" }}>No pose detected</span>
            </div>
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
        getFormErrors={() => [...formErrorsRef.current]}
        liveRepCount={liveRepCount}
        dailyVolume={dailyVolume}
        devMode={devMode}
        onDevModeChange={handleDevModeChange}
        hideOverlays={hideOverlays}
        onHideOverlaysChange={setHideOverlays}
        showSkeleton={showSkeleton}
        onShowSkeletonChange={setShowSkeleton}
        onWorkoutFinished={(ready) => { setShowSummary(true); setSummaryReady(ready); }}
        onSummaryDismiss={() => { setShowSummary(false); setSummaryReady(false); }}
      />

      {/* ── Full-screen summary overlay (z-[200], above everything) ────── */}
      {showSummary && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            backgroundColor: "#fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
          }}
        >
          {!summaryReady ? (
            <>
              <div style={{ width: 40, height: 40, border: "3px solid #e4e4e7", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#3f3f46" }}>Preparing your workout summary...</p>
              <p style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>Hang tight, this only takes a moment</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
          ) : (
            <>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#18181b" }}>Workout Complete</h2>
              <p style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>Your summary is playing now</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
