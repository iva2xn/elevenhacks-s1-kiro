# Implementation Plan: Push-Up Fitness Tracker

## Overview

Incrementally wire a real-time push-up tracking experience into the existing Next.js app. Each task builds on the previous one: dependencies first, then pure logic, then React components, then integration at the page level, and finally the voice/volume layer.

## Tasks

- [x] 1. Install missing dependencies
  - Run `npm install @mediapipe/tasks-vision @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-slot lucide-react clsx tailwind-merge`
  - Run `npm install --save-dev vitest @vitest/ui fast-check @vitest/coverage-v8`
  - Add a `vitest.config.ts` at the project root configured for jsdom environment and path aliases matching `tsconfig.json`
  - Add `"test": "vitest --run"` and `"test:ui": "vitest --ui"` scripts to `package.json`
  - _Requirements: all — these packages are prerequisites for every subsequent task_

- [x] 2. Implement pure utility functions and set up test infrastructure
  - [x] 2.1 Implement `lib/calorie-utils.ts`
    - Export `estimateCalories(met: number, weightKg: number, durationHours: number): number`
    - MET values: `8.0` for all push-up variations, `3.0` for plank (export `MET_VALUES` map keyed by `ExerciseId`)
    - _Requirements: 5.2_

  - [ ]* 2.2 Write property test for calorie formula (Property 5)
    - File: `lib/__tests__/calorie-utils.test.ts`
    - **Property 5: Calorie formula linearity**
    - **Validates: Requirements 5.2**
    - Generate random `(met, weightKg, durationHours)` triples with `fc.float({ min: 0.1 })` arbitraries; assert `result === met * weightKg * durationHours` and that doubling `durationHours` doubles the result
    - Tag: `// Feature: pushup-fitness-tracker, Property 5: Calorie formula linearity`

  - [x] 2.3 Implement `lib/form-validator.ts`
    - Export `computeAngle(a, b, c: NormalizedLandmark): number` — returns degrees in [0, 180]
    - Export `validateForm(landmarks: NormalizedLandmark[] | null, variation: ExerciseId): FormValidationResult`
    - Return `status: 'unknown'` when any key joint for the variation has `visibility < 0.5` or landmarks is null
    - Implement per-variation angle rules from the design's joint rules table
    - Export `FormValidationResult` and `FormStatus` types
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.4 Write property tests for form validator (Properties 1 and 2)
    - File: `lib/__tests__/form-validator.test.ts`
    - **Property 1: Angle symmetry and bounds** — generate three random `NormalizedLandmark` objects; assert result ∈ [0, 180] and `computeAngle(A,B,C) === computeAngle(C,B,A)`
    - **Validates: Requirements 3.2, 4.1, 4.2**
    - **Property 2: Unknown form on low visibility** — generate landmark sets where at least one key joint has `visibility < 0.5`; assert `status === 'unknown'` for all variations
    - **Validates: Requirements 3.6**
    - Tags: `// Feature: pushup-fitness-tracker, Property 1: ...` and `// Feature: pushup-fitness-tracker, Property 2: ...`

  - [x] 2.5 Implement `lib/rep-counter.ts`
    - Export `RepCounterState`, `RepPhase` types
    - Export `initialRepCounterState(): RepCounterState` — returns `{ phase: 'idle', count: 0, holdSeconds: 0 }`
    - Export `updateRepCounter(state, landmarks, variation, deltaSeconds): RepCounterState`
    - Phase transitions: `idle/up → down` when elbow angle < 120° and body in plank; `down → up` when elbow angle > 150°; increment `count` on `down → up`
    - For plank: accumulate `holdSeconds += deltaSeconds` while form is `'good'`; no phase transitions
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [ ]* 2.6 Write property tests for rep counter (Properties 3, 4, and 10)
    - File: `lib/__tests__/rep-counter.test.ts`
    - **Property 3: Rep count monotonicity** — generate random landmark frame sequences; assert `nextState.count >= prevState.count` at every step
    - **Validates: Requirements 4.3, 4.6**
    - **Property 4: Rep counter reset** — generate any `RepCounterState`; assert applying `initialRepCounterState()` produces `count === 0, phase === 'idle'`
    - **Validates: Requirements 4.6**
    - **Property 10: Plank hold time accumulation** — generate random arrays of positive `deltaSeconds`; assert final `holdSeconds === sum(deltas)` while form is `'good'`
    - **Validates: Requirements 4.7**
    - Tags: `// Feature: pushup-fitness-tracker, Property 3/4/10: ...`

- [x] 3. Checkpoint — run tests
  - Run `npm test` and ensure all property tests pass before proceeding. Ask the user if any test fails unexpectedly.

- [x] 4. Implement `lib/use-daily-volume.ts`
  - [x] 4.1 Implement the `useDailyVolume` hook
    - On mount: read `localStorage.getItem('pushup-daily-volume-{YYYY-MM-DD}')` for today's date; if stored date differs from today reset to zero
    - `addSession(reps, calories)`: update state and write back to `localStorage`; catch `SecurityError` and operate in-memory only
    - Derive `isOverThreshold` as `dailyVolume.reps > threshold`
    - Export `UseDailyVolumeReturn` and `DailyVolume` types
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

  - [ ]* 4.2 Write property tests for daily volume (Properties 6, 7, and 8)
    - File: `lib/__tests__/use-daily-volume.test.ts`
    - Mock `localStorage` using `vitest`'s `vi.stubGlobal` or a simple in-memory stub
    - **Property 6: Daily volume additivity** — generate random arrays of `(reps, calories)` pairs; assert total reps equals sum of individual reps
    - **Validates: Requirements 6.1, 6.2**
    - **Property 7: localStorage round-trip** — generate random `DailyVolume` objects; assert `JSON.parse(JSON.stringify(v))` produces equal `date`, `reps`, `calories`
    - **Validates: Requirements 6.1**
    - **Property 8: Over-threshold consistency** — generate random `(reps, threshold)` pairs; assert `isOverThreshold === (reps > threshold)`
    - **Validates: Requirements 6.3, 6.6**
    - Tags: `// Feature: pushup-fitness-tracker, Property 6/7/8: ...`

- [x] 5. Implement `lib/voice-feedback-engine.ts`
  - [x] 5.1 Implement `createVoiceFeedbackEngine()`
    - Maintain a `string[]` FIFO queue and `isPlaying: boolean` flag
    - `enqueue(message)`: push to queue; if not playing call `_playNext()`
    - `_playNext()`: shift first message, `POST /api/tts` with `{ text }`, convert response to `Blob`, `URL.createObjectURL`, play via `new Audio(url)`; on `audio.onended` revoke URL and call `_playNext()` if queue non-empty; on fetch error log to console and call `_playNext()`
    - `dispose()`: clear queue, stop any playing audio
    - _Requirements: 5.3, 5.5, 5.6_

  - [ ]* 5.2 Write property test for voice feedback queue order (Property 9)
    - File: `lib/__tests__/voice-feedback-engine.test.ts`
    - Mock `fetch` with `vi.fn()` returning a resolved `Response` with an empty `Blob`; mock `Audio` constructor
    - **Property 9: Queue FIFO order** — generate random arrays of message strings; enqueue all before playback starts; assert playback order matches input order
    - **Validates: Requirements 5.6**
    - Tag: `// Feature: pushup-fitness-tracker, Property 9: Voice feedback queue preserves message order`

- [x] 6. Update `/api/tts` route to use the turbo model
  - In `app/api/tts/route.ts`, change `model_id` from `"eleven_multilingual_v2"` to `"eleven_turbo_v2_5"` for lower latency
  - Keep the existing voice ID and response streaming logic unchanged
  - _Requirements: 5.3_

- [x] 7. Implement `components/camera-feed.tsx`
  - Create the `CameraFeed` Client Component (add `"use client"` directive)
  - Call `navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } })`
  - Render `<video>` as `position: fixed; inset: 0; width: 100vw; height: 100vh; object-fit: cover; z-index: 0`
  - Apply `transform: scaleX(-1)` when `mirrored` prop is true (default true)
  - Call `onStreamReady(videoEl)` once `loadedmetadata` fires
  - Call `onError('denied')` or `onError('unsupported')` on failure; render full-screen placeholder with `role="alert"` message
  - Stop all `MediaStreamTrack` objects in `useEffect` cleanup
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 8.1, 8.4, 8.5_

- [x] 8. Implement `components/skeleton-canvas.tsx`
  - Create the `SkeletonCanvas` Client Component
  - Render `<canvas>` with `position: fixed; inset: 0; z-index: 1; pointer-events: none`
  - Use a `ResizeObserver` on `videoEl` to keep canvas width/height in sync; also handle `window` resize
  - Draw only the joint connections relevant to `activeVariation` using the landmark index map from the design
  - Colour connections: green (`#22c55e`) for `'good'`, red (`#ef4444`) for `'bad'`, `rgba(255,255,255,0.6)` for `'unknown'`
  - Draw landmark dots at each key joint position
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Implement `components/pose-estimator.tsx`
  - Create the `PoseEstimator` Client Component (loaded via `next/dynamic` + `ssr: false` at the call site)
  - Lazily initialise `PoseLandmarker` from `@mediapipe/tasks-vision` with `lite` model on first mount using `FilesetResolver`
  - Run `requestAnimationFrame` loop calling `poseLandmarker.detectForVideo(videoEl, timestamp)` when `isActive` is true and `videoEl` is non-null
  - Emit `null` when no pose detected, `isActive` is false, or `videoEl` is null
  - Cancel rAF handle and call `poseLandmarker.close()` on unmount
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.2, 8.3_

- [x] 10. Checkpoint — verify components compile
  - Run `npm run build` (or `npx tsc --noEmit`) to confirm no TypeScript errors in the new components and lib files. Fix any type errors before proceeding.

- [x] 11. Wire everything together in `app/page.tsx`
  - [x] 11.1 Rewrite `app/page.tsx` as a Client Component
    - Add `"use client"` directive
    - Manage shared state: `videoEl`, `landmarks`, `formStatus`, `repCounterState`, `isSessionActive`, `activeVariation`, `cameraError`
    - Load `CameraFeed` and `PoseEstimator` via `next/dynamic` with `ssr: false`
    - Render `CameraFeed` full-screen behind everything (z-index 0)
    - Render `SkeletonCanvas` over the camera feed (z-index 1)
    - Render `WorkoutCard` on top (z-index 20, already set in the component)
    - Pass `onStreamReady` → set `videoEl` state; pass `onLandmarks` → run `validateForm` + `updateRepCounter`, update state
    - Pass `isActive` to `PoseEstimator` based on `WorkoutCard` session status
    - _Requirements: 1.4, 2.3, 3.3, 3.4, 4.4_

  - [x] 11.2 Integrate `WorkoutCard` session lifecycle callbacks
    - Add `onSessionEnd(reps, calories, exerciseId)` callback prop to `WorkoutCard` (or wire via existing `handleDone`/`handleReset` hooks)
    - On session end: call `addSession(reps, calories)` from `useDailyVolume`; call `voiceFeedbackEngine.enqueue(summaryMessage)` with exercise name, reps, calories, and next-action recommendation
    - On workout complete: enqueue final session summary with total reps, total calories, and cool-down recommendation
    - _Requirements: 5.1, 5.4, 6.2_

  - [x] 11.3 Integrate over-exercise detection and voice warning
    - In `app/page.tsx`, watch `isOverThreshold` from `useDailyVolume`; when it flips to `true` enqueue the over-exercise warning message via `VoiceFeedbackEngine`
    - Display daily volume totals from `useDailyVolume` as a progress indicator inside or below `WorkoutCard`
    - _Requirements: 6.3, 6.5_

  - [x] 11.4 Add form feedback overlay
    - Render a small overlay badge (absolute positioned, high z-index) showing "✓ Good Form" (green) or the `cue` text (red) from `FormValidationResult`
    - Show "No pose detected" when `formStatus === 'unknown'` and session is active
    - Ensure text has a semi-transparent backdrop for contrast (≥ 4.5:1 ratio)
    - _Requirements: 3.3, 3.4, 2.4_

  - [x] 11.5 Add rep count overlay
    - Render the live rep count from `repCounterState.count` (or `holdSeconds` for plank) as a large overlay number on the camera feed
    - Hide the overlay when no session is active
    - _Requirements: 4.4_

- [x] 12. Final checkpoint — full test and build pass
  - Run `npm test` to confirm all property-based and unit tests pass
  - Run `npx tsc --noEmit` to confirm zero TypeScript errors
  - Manually verify the dev server starts without errors (`npm run dev`)
  - Ask the user if any issues arise before considering the implementation complete

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- Browser-only components (`CameraFeed`, `PoseEstimator`) must always be loaded via `next/dynamic` with `ssr: false` inside Client Components — never imported directly at the top level of a server component
- The `WorkoutCard` z-index is already set to 20; camera feed is z-index 0; canvas overlay is z-index 1; form/rep overlays should use z-index 10
