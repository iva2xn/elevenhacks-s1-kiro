import { computeAngle, validateForm, type NormalizedLandmark } from "./form-validator";
import type { ExerciseId } from "./calorie-utils";

export type RepPhase = "up" | "down" | "idle";

export interface RepCounterState {
  phase: RepPhase;
  count: number;
  holdSeconds: number; // plank only
  _confirmFrames: number;
  _pendingPhase: RepPhase | null;
}

export function initialRepCounterState(): RepCounterState {
  return { phase: "idle", count: 0, holdSeconds: 0, _confirmFrames: 0, _pendingPhase: null };
}

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Hysteresis band: enter DOWN below 110°, must reach above 145° to count a rep.
// The 35° gap prevents noise from triggering false reps while still catching
// fast reps that don't fully extend.
const DOWN_ENTER = 110;   // elbow bends past this → bottom phase
const UP_ENTER   = 145;   // elbow extends past this → top phase (rep counted)

// Single-frame confirmation — just 1 frame needed to commit a transition.
// LIVE_STREAM mode already delivers results async so there's no rAF blocking;
// adding more confirmation frames only adds lag without reducing noise.
const CONFIRM_FRAMES = 1;

export function updateRepCounter(
  state: RepCounterState,
  landmarks: NormalizedLandmark[] | null,
  variation: ExerciseId,
  deltaSeconds: number
): RepCounterState {
  if (!landmarks) return state;

  // ── Plank ─────────────────────────────────────────────────────────────────
  if (variation === "plank") {
    const form = validateForm(landmarks, "plank");
    return form.status === "good"
      ? { ...state, holdSeconds: state.holdSeconds + deltaSeconds }
      : state;
  }

  // ── Push-up variations ────────────────────────────────────────────────────
  const lEl = landmarks[13];
  const rEl = landmarks[14];
  if (!lEl || !rEl || lEl.visibility < 0.4 || rEl.visibility < 0.4) return state;

  // Use the minimum (most-bent) elbow angle — more robust for side-on camera
  // angles and asymmetric push-up variations
  const lAngle = computeAngle(landmarks[11], landmarks[13], landmarks[15]);
  const rAngle = computeAngle(landmarks[12], landmarks[14], landmarks[16]);
  const elbow  = Math.min(lAngle, rAngle);

  let { phase, count, holdSeconds, _confirmFrames, _pendingPhase } = state;

  let suggested: RepPhase | null = null;
  if ((phase === "idle" || phase === "up") && elbow < DOWN_ENTER) {
    suggested = "down";
  } else if (phase === "down" && elbow > UP_ENTER) {
    suggested = "up";
  }

  if (!suggested) {
    return { phase, count, holdSeconds, _confirmFrames: 0, _pendingPhase: null };
  }

  if (suggested === _pendingPhase) {
    const frames = _confirmFrames + 1;
    if (frames >= CONFIRM_FRAMES) {
      const newCount = suggested === "up" ? count + 1 : count;
      return { phase: suggested, count: newCount, holdSeconds, _confirmFrames: 0, _pendingPhase: null };
    }
    return { phase, count, holdSeconds, _confirmFrames: frames, _pendingPhase: suggested };
  }

  return { phase, count, holdSeconds, _confirmFrames: 1, _pendingPhase: suggested };
}
