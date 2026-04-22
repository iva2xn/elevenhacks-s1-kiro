import { describe, it, expect } from 'vitest'
import { estimateCalories, MET_VALUES } from '../calorie-utils'

describe('estimateCalories', () => {
  it('returns 560 for MET=8, weight=70kg, duration=1h', () => {
    expect(estimateCalories(8, 70, 1)).toBe(560)
  })

  it('returns 105 for MET=3, weight=70kg, duration=0.5h', () => {
    expect(estimateCalories(3, 70, 0.5)).toBe(105)
  })
})

describe('MET_VALUES', () => {
  it('plank has MET value of 3.0', () => {
    expect(MET_VALUES['plank']).toBe(3.0)
  })

  it('push-ups has MET value of 8.0', () => {
    expect(MET_VALUES['push-ups']).toBe(8.0)
  })
})
