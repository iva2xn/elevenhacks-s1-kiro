import { computeAngle, validateForm, type NormalizedLandmark } from "./form-validator";
import type { ExerciseId } from "./calorie-utils";

export type RepPhase = "up" | "down" | "idle";

export interface RepCounterState {
  phase: RepPhase;
  count: number;
  holdSeconds: number;
  _confirmFrames: number;
  _pendingPhase: RepPhase | null;
  _shoulderYMin: number;
  _shoulderYMax: number;
  /** Timestamp of last counted rep — prevents double-counting */
  _lastRepTime: number;
}

export function initialRepCounterState(): RepCounterState {
  return {
    phase: "idle", count: 0, holdSeconds: 0,
    _confirmFrames: 0, _pendingPhase: null,
    _shoulderYMin: 1, _shoulderYMax: 0,
    _lastRepTime: 0,
  };
}

// Minimum ms between counted reps — prevents double-counting
const REP_COOLDOWN_MS = 800;

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

  const elbow = getElbowAngle(landmarks);
  const shoulderY = getShoulderY(landmarks);

  let { phase, count, holdSeconds, _confirmFrames, _pendingPhase,
        _shoulderYMin, _shoulderYMax, _lastRepTime } = state;

  if (shoulderY !== null) {
    _shoulderYMin = Math.min(_shoulderYMin, shoulderY);
    _shoulderYMax = Math.max(_shoulderYMax, shoulderY);
  }

  // Either signal can trigger down/up
  let isDown = false;
  let isUp = false;

  if (elbow !== null) {
    if (elbow < 130) isDown = true;
    if (elbow > 140) isUp = true;
  }

  if (shoulderY !== null) {
    const range = _shoulderYMax - _shoulderYMin;
    if (range > 0.02) {
      const mid = (_shoulderYMin + _shoulderYMax) / 2;
      if (shoulderY > mid + range * 0.1) isDown = true;
      if (shoulderY < mid - range * 0.1) isUp = true;
    }
  }

  let suggested: RepPhase | null = null;
  if ((phase === "idle" || phase === "up") && isDown) suggested = "down";
  else if (phase === "down" && isUp) suggested = "up";

  if (!suggested) {
    return { phase, count, holdSeconds, _confirmFrames: 0, _pendingPhase: null,
             _shoulderYMin, _shoulderYMax, _lastRepTime };
  }

  if (suggested === _pendingPhase) {
    const frames = _confirmFrames + 1;
    if (frames >= CONFIRM_FRAMES) {
      let newCount = count;
      if (suggested === "up") {
        const now = performance.now();
        // Only count if enough time has passed since last rep
        if (now - _lastRepTime >= REP_COOLDOWN_MS) {
          newCount = count + 1;
          _lastRepTime = now;
        }
      }
      return { phase: suggested, count: newCount, holdSeconds, _confirmFrames: 0, _pendingPhase: null,
               _shoulderYMin, _shoulderYMax, _lastRepTime };
    }
    return { phase, count, holdSeconds, _confirmFrames: frames, _pendingPhase: suggested,
             _shoulderYMin, _shoulderYMax, _lastRepTime };
  }

  return { phase, count, holdSeconds, _confirmFrames: 1, _pendingPhase: suggested,
           _shoulderYMin, _shoulderYMax, _lastRepTime };
}
