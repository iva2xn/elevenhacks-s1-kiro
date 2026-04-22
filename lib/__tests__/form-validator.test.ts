import { describe, it, expect } from 'vitest'
import { computeAngle, validateForm, type NormalizedLandmark } from '../form-validator'

function lm(x: number, y: number, z: number, visibility = 1): NormalizedLandmark {
  return { x, y, z, visibility }
}

describe('computeAngle', () => {
  it('returns 90 for a right angle (A=(1,0,0), B=(0,0,0), C=(0,1,0))', () => {
    const a = lm(1, 0, 0)
    const b = lm(0, 0, 0)
    const c = lm(0, 1, 0)
    expect(computeAngle(a, b, c)).toBeCloseTo(90, 5)
  })

  it('returns 180 for a straight line (A=(-1,0,0), B=(0,0,0), C=(1,0,0))', () => {
    const a = lm(-1, 0, 0)
    const b = lm(0, 0, 0)
    const c = lm(1, 0, 0)
    expect(computeAngle(a, b, c)).toBeCloseTo(180, 5)
  })

  it('is symmetric: computeAngle(A,B,C) === computeAngle(C,B,A)', () => {
    const a = lm(1, 2, 0)
    const b = lm(0, 0, 0)
    const c = lm(-1, 3, 1)
    expect(computeAngle(a, b, c)).toBeCloseTo(computeAngle(c, b, a), 10)
  })
})

describe('validateForm', () => {
  it('returns unknown when landmarks is null', () => {
    const result = validateForm(null, 'push-ups')
    expect(result.status).toBe('unknown')
  })

  it('returns unknown when a key joint has visibility 0.3', () => {
    // Build a 33-landmark array (MediaPipe standard) with all visible,
    // then set one key joint for push-ups (index 11) to low visibility.
    const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () =>
      lm(0.5, 0.5, 0, 1)
    )
    landmarks[11] = lm(0.5, 0.5, 0, 0.3) // below 0.5 threshold
    const result = validateForm(landmarks, 'push-ups')
    expect(result.status).toBe('unknown')
  })
})
