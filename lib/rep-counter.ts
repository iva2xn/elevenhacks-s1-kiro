import { computeAngle, validateForm, type NormalizedLandmark } from "./form-validator";
import type { ExerciseId } from "./calorie-utils";

export type RepPhase = "up" | "down" | "idle";

export interface RepCounterState {
  phase: RepPhase;
  count: number;
  holdSeconds: number; // plank only
}

/**
 * Returns the initial (zeroed) rep counter state.
 */
export function initialRepCounterState(): RepCounterState {
  return { phase: "idle", count: 0, holdSeconds: 0 };
}

/**
 * Pure state machine update for the rep counter.
 *
 * - For plank: accumulates holdSeconds while form is 'good'.
 * - For all other variations: tracks elbow angle phase transitions
 *   (idle/up → down when angle < 120°; down → up when angle > 150°)
 *   and increments count on each down→up transition.
 *
 * Returns state unchanged when landmarks is null or key joints are not visible.
 */
export function updateRepCounter(
  state: RepCounterState,
  landmarks: NormalizedLandmark[] | null,
  variation: ExerciseId,
  deltaSeconds: number
): RepCounterState {
  if (landmarks === null) {
    return state;
  }

  // -------------------------------------------------------------------------
  // Plank: accumulate hold time while form is good
  // -------------------------------------------------------------------------
  if (variation === "plank") {
    const form = validateForm(landmarks, "plank");
    if (form.status === "good") {
      return { ...state, holdSeconds: state.holdSeconds + deltaSeconds };
    }
    return state;
  }

  // -------------------------------------------------------------------------
  // Push-up variations: phase-transition rep counting
  // -------------------------------------------------------------------------

  // Require both elbows to be visible
  const leftElbowLm = landmarks[13];
  const rightElbowLm = landmarks[14];
  if (
    !leftElbowLm ||
    !rightElbowLm ||
    leftElbowLm.visibility < 0.5 ||
    rightElbowLm.visibility < 0.5
  ) {
    return state;
  }

  // Also need shoulder and wrist landmarks for angle computation
  const leftAngle = computeAngle(landmarks[11], landmarks[13], landmarks[15]);
  const rightAngle = computeAngle(landmarks[12], landmarks[14], landmarks[16]);
  const avgElbow = (leftAngle + rightAngle) / 2;

  let { phase, count } = state;

  if (phase === "idle" || phase === "up") {
    if (avgElbow < 120) {
      phase = "down";
    }
  } else if (phase === "down") {
    if (avgElbow > 150) {
      phase = "up";
      count += 1;
    }
  }

  return { phase, count, holdSeconds: 0 };
}
