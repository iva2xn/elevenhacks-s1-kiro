import { describe, it, expect } from 'vitest'
import { initialRepCounterState, updateRepCounter, type RepCounterState } from '../rep-counter'
import type { NormalizedLandmark } from '../form-validator'

function lm(x: number, y: number, z: number, visibility = 1): NormalizedLandmark {
  return { x, y, z, visibility }
}

/**
 * Builds a 33-element landmark array (MediaPipe standard).
 * All landmarks default to (0.5, 0.5, 0) with full visibility.
 * Pass overrides as a partial record keyed by index.
 */
function makeLandmarks(
  overrides: Partial<Record<number, NormalizedLandmark>> = {}
): NormalizedLandmark[] {
  const base = Array.from({ length: 33 }, () => lm(0.5, 0.5, 0, 1))
  for (const [idx, val] of Object.entries(overrides)) {
    base[Number(idx)] = val!
  }
  return base
}

/**
 * Landmarks that produce a ~90° elbow angle (arm bent / "down" phase).
 * Shoulder at (0,0,0), elbow at (1,0,0), wrist at (1,1,0) → 90°.
 */
function bentArmLandmarks(): NormalizedLandmark[] {
  return makeLandmarks({
    11: lm(0, 0, 0), // left shoulder
    12: lm(0, 0, 0), // right shoulder
    13: lm(1, 0, 0), // left elbow
    14: lm(1, 0, 0), // right elbow
    15: lm(1, 1, 0), // left wrist
    16: lm(1, 1, 0), // right wrist
  })
}

/**
 * Landmarks that produce a ~180° elbow angle (arm straight / "up" phase).
 * Shoulder at (0,0,0), elbow at (1,0,0), wrist at (2,0,0) → 180°.
 */
function straightArmLandmarks(): NormalizedLandmark[] {
  return makeLandmarks({
    11: lm(0, 0, 0),
    12: lm(0, 0, 0),
    13: lm(1, 0, 0),
    14: lm(1, 0, 0),
    15: lm(2, 0, 0),
    16: lm(2, 0, 0),
  })
}

/**
 * Landmarks for a good plank: hip angle > 170°.
 * shoulder=(0,0,0), hip=(1,0,0), ankle=(2,0,0) → 180°.
 */
function goodPlankLandmarks(): NormalizedLandmark[] {
  return makeLandmarks({
    11: lm(0, 0, 0), // left shoulder
    12: lm(0, 0, 0), // right shoulder
    23: lm(1, 0, 0), // left hip
    24: lm(1, 0, 0), // right hip
    27: lm(2, 0, 0), // left ankle
    28: lm(2, 0, 0), // right ankle
  })
}

describe('initialRepCounterState', () => {
  it('returns { phase: "idle", count: 0, holdSeconds: 0 }', () => {
    expect(initialRepCounterState()).toEqual({ phase: 'idle', count: 0, holdSeconds: 0 })
  })
})

describe('updateRepCounter — push-ups', () => {
  it('count never decreases across a sequence of frames', () => {
    const frames: NormalizedLandmark[][] = [
      straightArmLandmarks(), // idle/up
      bentArmLandmarks(),     // down
      straightArmLandmarks(), // up → count becomes 1
      bentArmLandmarks(),     // down
      straightArmLandmarks(), // up → count becomes 2
    ]

    let state: RepCounterState = initialRepCounterState()
    let prevCount = 0

    for (const frame of frames) {
      state = updateRepCounter(state, frame, 'push-ups', 1 / 30)
      expect(state.count).toBeGreaterThanOrEqual(prevCount)
      prevCount = state.count
    }
  })
})

describe('updateRepCounter — plank', () => {
  it('accumulates holdSeconds when form is good', () => {
    let state = initialRepCounterState()
    const delta = 0.5

    state = updateRepCounter(state, goodPlankLandmarks(), 'plank', delta)
    expect(state.holdSeconds).toBeCloseTo(delta)

    state = updateRepCounter(state, goodPlankLandmarks(), 'plank', delta)
    expect(state.holdSeconds).toBeCloseTo(delta * 2)
  })
})
