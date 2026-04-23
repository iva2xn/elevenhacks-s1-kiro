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
// Wider hysteresis band to catch more push-up styles and camera angles.
// DOWN: elbow bends below 130° → bottom phase (was 110° — too strict)
// UP: elbow extends above 155° → top phase, rep counted
// The wider entry makes it much more responsive to fast/shallow reps.
const DOWN_ENTER = 130;
const UP_ENTER   = 155;

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

  // Use average of both elbows — more stable than min for varied camera angles
  const lAngle = computeAngle(landmarks[11], landmarks[13], landmarks[15]);
  const rAngle = computeAngle(landmarks[12], landmarks[14], landmarks[16]);
  const elbow  = (lAngle + rAngle) / 2;

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
