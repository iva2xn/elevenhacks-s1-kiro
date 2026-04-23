import { computeAngle, validateForm, type NormalizedLandmark } from "./form-validator";
import type { ExerciseId } from "./calorie-utils";

export type RepPhase = "up" | "down" | "idle";

export interface RepCounterState {
  phase: RepPhase;
  count: number;
  holdSeconds: number;
  _confirmFrames: number;
  _pendingPhase: RepPhase | null;
  /** Tracks the shoulder Y baseline for front-angle detection */
  _shoulderYBaseline: number;
  _shoulderYMin: number;
  _shoulderYMax: number;
}

export function initialRepCounterState(): RepCounterState {
  return {
    phase: "idle", count: 0, holdSeconds: 0,
    _confirmFrames: 0, _pendingPhase: null,
    _shoulderYBaseline: 0, _shoulderYMin: 1, _shoulderYMax: 0,
  };
}

const MIN_VIS = 0.15;
const CONFIRM_FRAMES = 1;

function getElbowAngle(landmarks: NormalizedLandmark[]): number | null {
  const lSh = landmarks[11], lEl = landmarks[13], lWr = landmarks[15];
  const rSh = landmarks[12], rEl = landmarks[14], rWr = landmarks[16];
  const lVis = lSh && lEl && lWr ? Math.min(lSh.visibility, lEl.visibility, lWr.visibility) : 0;
  const rVis = rSh && rEl && rWr ? Math.min(rSh.visibility, rEl.visibility, rWr.visibility) : 0;
  if (lVis >= MIN_VIS && rVis >= MIN_VIS) return (computeAngle(lSh, lEl, lWr) + computeAngle(rSh, rEl, rWr)) / 2;
  if (lVis >= MIN_VIS) return computeAngle(lSh, lEl, lWr);
  if (rVis >= MIN_VIS) return computeAngle(rSh, rEl, rWr);
  return null;
}

function getShoulderY(landmarks: NormalizedLandmark[]): number | null {
  const lSh = landmarks[11], rSh = landmarks[12];
  const lOk = lSh && lSh.visibility >= MIN_VIS;
  const rOk = rSh && rSh.visibility >= MIN_VIS;
  if (lOk && rOk) return (lSh.y + rSh.y) / 2;
  if (lOk) return lSh.y;
  if (rOk) return rSh.y;
  return null;
}

export function updateRepCounter(
  state: RepCounterState,
  landmarks: NormalizedLandmark[] | null,
  variation: ExerciseId,
  deltaSeconds: number
): RepCounterState {
  if (!landmarks) return state;

  if (variation === "plank") {
    const form = validateForm(landmarks, "plank");
    return form.status === "good"
      ? { ...state, holdSeconds: state.holdSeconds + deltaSeconds }
      : state;
  }

  // ── Dual detection: elbow angle OR shoulder Y movement ──────────────────
  const elbow = getElbowAngle(landmarks);
  const shoulderY = getShoulderY(landmarks);

  // Track shoulder Y range for adaptive thresholds
  let { phase, count, holdSeconds, _confirmFrames, _pendingPhase,
        _shoulderYBaseline, _shoulderYMin, _shoulderYMax } = state;

  if (shoulderY !== null) {
    _shoulderYMin = Math.min(_shoulderYMin, shoulderY);
    _shoulderYMax = Math.max(_shoulderYMax, shoulderY);
    if (_shoulderYBaseline === 0) _shoulderYBaseline = shoulderY;
  }

  // Determine if we're in "down" or "up" position using EITHER signal
  let isDown = false;
  let isUp = false;

  // Signal 1: Elbow angle (works best from side angle)
  if (elbow !== null) {
    // Very lenient: any angle below 130° = down, above 140° = up
    if (elbow < 130) isDown = true;
    if (elbow > 140) isUp = true;
  }

  // Signal 2: Shoulder Y position (works from front angle)
  // In normalized coords, Y increases downward. During a push-up from front,
  // shoulders move DOWN (Y increases) then back UP (Y decreases).
  if (shoulderY !== null) {
    const range = _shoulderYMax - _shoulderYMin;
    if (range > 0.02) { // need at least 2% viewport movement to be meaningful
      const mid = (_shoulderYMin + _shoulderYMax) / 2;
      // Shoulder below midpoint = body is down
      if (shoulderY > mid + range * 0.1) isDown = true;
      // Shoulder above midpoint = body is up
      if (shoulderY < mid - range * 0.1) isUp = true;
    }
  }

  // State machine
  let suggested: RepPhase | null = null;
  if ((phase === "idle" || phase === "up") && isDown) {
    suggested = "down";
  } else if (phase === "down" && isUp) {
    suggested = "up";
  }

  if (!suggested) {
    return { phase, count, holdSeconds, _confirmFrames: 0, _pendingPhase: null,
             _shoulderYBaseline, _shoulderYMin, _shoulderYMax };
  }

  if (suggested === _pendingPhase) {
    const frames = _confirmFrames + 1;
    if (frames >= CONFIRM_FRAMES) {
      const newCount = suggested === "up" ? count + 1 : count;
      return { phase: suggested, count: newCount, holdSeconds, _confirmFrames: 0, _pendingPhase: null,
               _shoulderYBaseline, _shoulderYMin, _shoulderYMax };
    }
    return { phase, count, holdSeconds, _confirmFrames: frames, _pendingPhase: suggested,
             _shoulderYBaseline, _shoulderYMin, _shoulderYMax };
  }

  return { phase, count, holdSeconds, _confirmFrames: 1, _pendingPhase: suggested,
           _shoulderYBaseline, _shoulderYMin, _shoulderYMax };
}
