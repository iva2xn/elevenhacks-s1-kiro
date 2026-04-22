# Requirements Document

## Introduction

This feature adds real-time push-up tracking to the existing Next.js fitness app. A live camera feed covers the entire screen as a background, with the existing `WorkoutCard` overlaid on top. MediaPipe Pose Estimation runs in the browser to detect body landmarks, validate push-up form per variation, and count reps automatically. After each exercise set or workout session, ElevenLabs AI voice feedback is played to report calories burned, reps completed, and what to do next (rest, eat, hydrate). An over-exercise detection system monitors daily volume and triggers a voice warning when the user exceeds safe limits.

The feature is built entirely as client-side React components inside the existing Next.js 16 App Router project. Browser-only modules (MediaPipe, camera APIs) are loaded with `next/dynamic` and `ssr: false` to avoid server-side rendering errors.

---

## Glossary

- **Camera_Feed**: The browser `getUserMedia` video stream rendered as a full-screen background element.
- **Pose_Estimator**: The MediaPipe Pose Landmarker running in the browser that produces 33 body landmarks per frame.
- **Form_Validator**: The module that receives landmarks from the Pose_Estimator and determines whether the user's push-up form is correct for the active variation.
- **Rep_Counter**: The module that tracks the up/down phase transitions of a push-up and increments the rep count.
- **Exercise_Session**: A single set of a single push-up variation, from the moment the user presses Start until the set is marked Done.
- **Daily_Volume_Tracker**: The module that accumulates total reps and estimated calories across all Exercise_Sessions within a calendar day, persisted to `localStorage`.
- **Voice_Feedback_Engine**: The client-side module that constructs a natural-language summary and calls the `/api/tts` route to obtain and play an audio response via ElevenLabs.
- **Over_Exercise_Threshold**: The configurable daily rep limit (default: 200 total reps) beyond which the Daily_Volume_Tracker considers the user to be over-exercising.
- **WorkoutCard**: The existing `components/workout-card.tsx` UI component that manages program selection, set/rep inputs, and workout state.
- **MET**: Metabolic Equivalent of Task — a standard unit used to estimate calorie burn from exercise intensity and duration.
- **Landmark**: A single 3-D point (x, y, z, visibility) produced by the Pose_Estimator for a specific body joint.

---

## Requirements

### Requirement 1: Full-Screen Camera Background

**User Story:** As a user, I want the camera feed to fill the entire screen behind the workout card, so that I can see my body position while exercising without navigating away from the app.

#### Acceptance Criteria

1. WHEN the app page loads, THE Camera_Feed SHALL request access to the device's rear or front camera using the browser `getUserMedia` API.
2. WHEN camera permission is granted, THE Camera_Feed SHALL render the video stream as a full-screen background element that covers 100% of the viewport width and height.
3. WHEN camera permission is denied or unavailable, THE Camera_Feed SHALL display a full-screen placeholder with a message indicating that camera access is required.
4. THE WorkoutCard SHALL remain positioned above the Camera_Feed at all times, with a z-index that ensures it is never obscured by the video element.
5. WHILE the Camera_Feed is active, THE Camera_Feed SHALL mirror the video horizontally (CSS `scaleX(-1)`) to match the user's natural mirror expectation.
6. THE Camera_Feed component SHALL be loaded with `next/dynamic` and `ssr: false` so that browser-only APIs are never called during server-side rendering.

---

### Requirement 2: MediaPipe Pose Estimation Integration

**User Story:** As a user, I want the app to detect my body position in real time, so that it can validate my push-up form and count reps automatically.

#### Acceptance Criteria

1. WHEN the Camera_Feed is active, THE Pose_Estimator SHALL process each video frame and produce a set of 33 body Landmarks at a target rate of 30 frames per second.
2. THE Pose_Estimator SHALL use the MediaPipe Pose Landmarker model loaded via the `@mediapipe/tasks-vision` package with the `lite` model variant to minimise latency on consumer hardware.
3. WHEN Landmarks are produced, THE Pose_Estimator SHALL emit the landmark data to both the Form_Validator and the Rep_Counter in the same animation frame.
4. IF the Pose_Estimator fails to detect a human pose in a frame, THEN THE Pose_Estimator SHALL emit a `null` landmark set and THE Form_Validator SHALL display a "No pose detected" indicator.
5. THE Pose_Estimator component SHALL be loaded with `next/dynamic` and `ssr: false`.

---

### Requirement 3: Push-Up Form Validation Per Variation

**User Story:** As a user, I want the app to tell me in real time whether my push-up form is correct for the variation I am doing, so that I can correct mistakes before they become habits.

#### Acceptance Criteria

1. WHEN an Exercise_Session is active, THE Form_Validator SHALL evaluate Landmarks on every frame and classify the user's form as either **Good Form** or **Bad Form**.
2. THE Form_Validator SHALL apply the following variation-specific angle rules using the joint angles derived from Landmarks:

   | Variation | Key Joints Checked | Good Form Condition |
   |---|---|---|
   | push-ups | elbow, shoulder, hip, ankle | Elbow angle 80–110° at bottom; body plank angle < 15° deviation |
   | diamond-push-ups | elbow, wrist, shoulder | Elbow angle 70–100° at bottom; hands within 10 cm of each other (normalised) |
   | wide-push-ups | elbow, shoulder | Elbow angle 80–120° at bottom; hand width > 1.5× shoulder width |
   | archer-push-ups | elbow (lead arm), shoulder | Lead elbow angle 70–100° at bottom; trailing arm near-straight (> 150°) |
   | decline-push-ups | hip, shoulder, ankle | Hip angle < 10° deviation from straight; elbow 80–110° at bottom |
   | incline-push-ups | hip, shoulder, wrist | Hip angle < 10° deviation from straight; elbow 80–110° at bottom |
   | plank | hip, shoulder, ankle | Hip angle < 10° deviation from straight; held continuously |

3. WHEN form is classified as **Good Form**, THE Form_Validator SHALL display a green visual indicator overlaid on the camera feed.
4. WHEN form is classified as **Bad Form**, THE Form_Validator SHALL display a red visual indicator with a short text cue (e.g., "Keep hips straight") overlaid on the camera feed.
5. WHEN the active exercise changes, THE Form_Validator SHALL reset its state and apply the rules for the new variation within one frame.
6. IF Landmarks have a visibility score below 0.5 for any key joint, THEN THE Form_Validator SHALL treat that joint as undetected and SHALL NOT classify form for that frame.

---

### Requirement 4: Automatic Rep Counting

**User Story:** As a user, I want the app to count my push-up reps automatically using the camera, so that I do not have to manually track my count.

#### Acceptance Criteria

1. WHEN an Exercise_Session is active, THE Rep_Counter SHALL detect the bottom phase of a push-up when the elbow angle falls below 120° and the body is in a plank-like position.
2. WHEN an Exercise_Session is active, THE Rep_Counter SHALL detect the top phase of a push-up when the elbow angle rises above 150°.
3. WHEN the Rep_Counter transitions from bottom phase to top phase, THE Rep_Counter SHALL increment the rep count by 1.
4. THE Rep_Counter SHALL display the current rep count as a live overlay on the camera feed during an active Exercise_Session.
5. WHEN an Exercise_Session ends (user presses Done), THE Rep_Counter SHALL pass the final rep count to the WorkoutCard to update the session log.
6. WHEN a new Exercise_Session starts, THE Rep_Counter SHALL reset the rep count to 0.
7. FOR the plank variation, THE Rep_Counter SHALL measure elapsed hold time in seconds instead of counting phase transitions.

---

### Requirement 5: Post-Set ElevenLabs Voice Feedback

**User Story:** As a user, I want to hear a spoken summary after each set, so that I stay informed about my progress without looking at the screen.

#### Acceptance Criteria

1. WHEN an Exercise_Session ends (user presses Done or the Rep_Counter auto-completes the target reps), THE Voice_Feedback_Engine SHALL construct a summary message containing: the exercise name, the number of reps completed, the estimated calories burned for that set, and a next-action recommendation (rest, hydrate, or proceed to next set).
2. THE Voice_Feedback_Engine SHALL estimate calories burned using the formula: `calories = MET × weight_kg × duration_hours`, where MET is 8.0 for push-up variations and 3.0 for plank, weight_kg defaults to 70 kg if the user has not set a body weight, and duration_hours is the set duration in hours.
3. WHEN the summary message is ready, THE Voice_Feedback_Engine SHALL call the `/api/tts` POST endpoint with the message text and SHALL play the returned audio stream using the browser `Audio` API.
4. WHEN the workout session is fully complete (all sets of all exercises done), THE Voice_Feedback_Engine SHALL play a final session summary including total reps, total estimated calories, and a cool-down recommendation.
5. IF the `/api/tts` endpoint returns an error, THEN THE Voice_Feedback_Engine SHALL log the error to the browser console and SHALL NOT block the workout UI.
6. THE Voice_Feedback_Engine SHALL queue messages so that if a new message is triggered before the previous audio finishes, the new message plays immediately after the current one completes.

---

### Requirement 6: Over-Exercise Detection and Voice Warning

**User Story:** As a user, I want the app to warn me when I have exercised too much for the day, so that I avoid injury from overtraining.

#### Acceptance Criteria

1. THE Daily_Volume_Tracker SHALL persist the total rep count and total estimated calories for the current calendar day to `localStorage` under the key `pushup-daily-volume-{YYYY-MM-DD}`.
2. WHEN an Exercise_Session ends, THE Daily_Volume_Tracker SHALL update the persisted daily totals with the reps and calories from that session.
3. WHEN the Daily_Volume_Tracker detects that the cumulative daily rep count has exceeded the Over_Exercise_Threshold, THE Voice_Feedback_Engine SHALL play a warning message such as: "You've hit your limit for today. Don't be too hard on yourself — rest is part of the process."
4. WHEN the app loads on a new calendar day, THE Daily_Volume_Tracker SHALL reset the daily totals to zero.
5. THE Daily_Volume_Tracker SHALL expose the current daily totals so that the WorkoutCard can display them as a progress indicator.
6. WHERE the user has set a custom Over_Exercise_Threshold in app settings, THE Daily_Volume_Tracker SHALL use the user-defined value instead of the default 200 reps.

---

### Requirement 7: Live Pose Overlay

**User Story:** As a user, I want to see a skeleton overlay drawn on my body in the camera feed, so that I can understand which joints the app is tracking.

#### Acceptance Criteria

1. WHEN the Pose_Estimator produces Landmarks, THE Pose_Estimator SHALL draw a skeleton overlay on a `<canvas>` element positioned directly over the Camera_Feed.
2. THE skeleton overlay SHALL draw lines connecting the key joints relevant to the active push-up variation using a colour that contrasts with typical gym backgrounds (default: semi-transparent white).
3. WHEN form is classified as **Good Form**, THE skeleton overlay SHALL tint the key joint connections green.
4. WHEN form is classified as **Bad Form**, THE skeleton overlay SHALL tint the key joint connections red.
5. THE `<canvas>` element SHALL match the Camera_Feed dimensions at all times, including on window resize.

---

### Requirement 8: Camera and Pose Engine Lifecycle Management

**User Story:** As a user, I want the camera and pose engine to start and stop cleanly, so that the app does not drain battery or hold the camera when it is not needed.

#### Acceptance Criteria

1. WHEN the user navigates away from the page or closes the browser tab, THE Camera_Feed SHALL stop all active `MediaStreamTrack` objects to release the camera hardware.
2. WHEN the workout session is in the "idle" or "finished" state, THE Pose_Estimator SHALL pause frame processing to reduce CPU usage.
3. WHEN the user presses Start on the WorkoutCard, THE Pose_Estimator SHALL resume frame processing.
4. IF the device does not support `getUserMedia`, THEN THE Camera_Feed SHALL display a message stating "Camera not supported on this device" and THE WorkoutCard SHALL remain fully functional for manual rep entry.
5. THE Camera_Feed SHALL request the highest available resolution up to 1280×720 to balance pose detection accuracy with performance.
