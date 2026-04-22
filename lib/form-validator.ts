import type { ExerciseId } from "./calorie-utils";

export type FormStatus = "good" | "bad" | "unknown";

export interface FormValidationResult {
  status: FormStatus;
  cue: string | null;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/**
 * Computes the angle (in degrees) at vertex B formed by points A-B-C.
 * Uses the dot product of vectors BA and BC.
 * Returns a value in [0, 180]. Returns 0 for degenerate (zero-length) vectors.
 */
export function computeAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark
): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = a.z - b.z;

  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = c.z - b.z;

  const dot = bax * bcx + bay * bcy + baz * bcz;
  const magBA = Math.sqrt(bax * bax + bay * bay + baz * baz);
  const magBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);

  if (magBA === 0 || magBC === 0) {
    return 0;
  }

  // Clamp to [-1, 1] to guard against floating-point drift
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Key joint index sets per variation
// ---------------------------------------------------------------------------

const KEY_JOINTS: Record<ExerciseId, number[]> = {
  "push-ups": [11, 12, 13, 14, 23, 24, 27, 28],
  "diamond-push-ups": [11, 12, 13, 14, 15, 16],
  "wide-push-ups": [11, 12, 13, 14, 15, 16],
  "archer-push-ups": [11, 12, 13, 14, 15, 16],
  "decline-push-ups": [11, 12, 13, 14, 23, 24, 27, 28],
  "incline-push-ups": [11, 12, 13, 14, 15, 16, 23, 24],
  "plank": [11, 12, 23, 24, 27, 28],
};

function hasVisibleJoints(
  landmarks: NormalizedLandmark[],
  indices: number[]
): boolean {
  return indices.every(
    (i) => landmarks[i] !== undefined && landmarks[i].visibility >= 0.5
  );
}

// ---------------------------------------------------------------------------
// Per-variation validators
// ---------------------------------------------------------------------------

function validatePushUps(lm: NormalizedLandmark[]): FormValidationResult {
  const leftElbow = computeAngle(lm[11], lm[13], lm[15]);
  const rightElbow = computeAngle(lm[12], lm[14], lm[16]);
  const avgElbow = (leftElbow + rightElbow) / 2;

  const leftHip = computeAngle(lm[11], lm[23], lm[27]);
  const rightHip = computeAngle(lm[12], lm[24], lm[28]);
  const avgHip = (leftHip + rightHip) / 2;

  const elbowOk = avgElbow >= 80 && avgElbow <= 110;
  const hipOk = avgHip > 165;

  if (elbowOk && hipOk) {
    return { status: "good", cue: null };
  }

  if (avgElbow < 80) return { status: "bad", cue: "Go deeper" };
  if (avgElbow > 110) return { status: "bad", cue: "Lower your chest" };
  if (!hipOk) return { status: "bad", cue: "Keep hips straight" };

  return { status: "bad", cue: "Adjust your form" };
}

function validateDiamondPushUps(lm: NormalizedLandmark[]): FormValidationResult {
  const leftElbow = computeAngle(lm[11], lm[13], lm[15]);
  const rightElbow = computeAngle(lm[12], lm[14], lm[16]);
  const avgElbow = (leftElbow + rightElbow) / 2;

  const wristDistance = Math.abs(lm[15].x - lm[16].x);

  const elbowOk = avgElbow >= 70 && avgElbow <= 100;
  const wristOk = wristDistance < 0.1;

  if (elbowOk && wristOk) {
    return { status: "good", cue: null };
  }

  if (!elbowOk) return { status: "bad", cue: "Adjust elbow angle" };
  if (!wristOk) return { status: "bad", cue: "Bring hands closer together" };

  return { status: "bad", cue: "Adjust your form" };
}

function validateWidePushUps(lm: NormalizedLandmark[]): FormValidationResult {
  const leftElbow = computeAngle(lm[11], lm[13], lm[15]);
  const rightElbow = computeAngle(lm[12], lm[14], lm[16]);
  const avgElbow = (leftElbow + rightElbow) / 2;

  const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
  const wristWidth = Math.abs(lm[15].x - lm[16].x);

  const elbowOk = avgElbow >= 80 && avgElbow <= 120;
  const wristOk = wristWidth > 1.5 * shoulderWidth;

  if (elbowOk && wristOk) {
    return { status: "good", cue: null };
  }

  if (!elbowOk) return { status: "bad", cue: "Adjust elbow angle" };
  if (!wristOk) return { status: "bad", cue: "Widen your hand placement" };

  return { status: "bad", cue: "Adjust your form" };
}

function validateArcherPushUps(lm: NormalizedLandmark[]): FormValidationResult {
  // Lead arm = whichever elbow has lower y value (higher on screen)
  const leftIsLead = lm[13].y <= lm[14].y;

  const leadShoulder = leftIsLead ? lm[11] : lm[12];
  const leadElbow = leftIsLead ? lm[13] : lm[14];
  const leadWrist = leftIsLead ? lm[15] : lm[16];

  const trailShoulder = leftIsLead ? lm[12] : lm[11];
  const trailElbow = leftIsLead ? lm[14] : lm[13];
  const trailWrist = leftIsLead ? lm[16] : lm[15];

  const leadAngle = computeAngle(leadShoulder, leadElbow, leadWrist);
  const trailAngle = computeAngle(trailShoulder, trailElbow, trailWrist);

  const leadOk = leadAngle >= 70 && leadAngle <= 100;
  const trailOk = trailAngle > 150;

  if (leadOk && trailOk) {
    return { status: "good", cue: null };
  }

  if (!leadOk) return { status: "bad", cue: "Adjust lead arm angle" };
  if (!trailOk) return { status: "bad", cue: "Straighten trailing arm" };

  return { status: "bad", cue: "Adjust your form" };
}

function validateDeclinePushUps(lm: NormalizedLandmark[]): FormValidationResult {
  const leftElbow = computeAngle(lm[11], lm[13], lm[15]);
  const rightElbow = computeAngle(lm[12], lm[14], lm[16]);
  const avgElbow = (leftElbow + rightElbow) / 2;

  const leftHip = computeAngle(lm[11], lm[23], lm[27]);
  const rightHip = computeAngle(lm[12], lm[24], lm[28]);
  const avgHip = (leftHip + rightHip) / 2;

  const elbowOk = avgElbow >= 80 && avgElbow <= 110;
  const hipOk = avgHip > 170;

  if (elbowOk && hipOk) {
    return { status: "good", cue: null };
  }

  if (!elbowOk) return { status: "bad", cue: "Adjust elbow angle" };
  if (!hipOk) return { status: "bad", cue: "Keep hips straight" };

  return { status: "bad", cue: "Adjust your form" };
}

function validateInclinePushUps(lm: NormalizedLandmark[]): FormValidationResult {
  const leftElbow = computeAngle(lm[11], lm[13], lm[15]);
  const rightElbow = computeAngle(lm[12], lm[14], lm[16]);
  const avgElbow = (leftElbow + rightElbow) / 2;

  // Hip alignment: shoulder → hip → wrist
  const leftHip = computeAngle(lm[11], lm[23], lm[15]);
  const rightHip = computeAngle(lm[12], lm[24], lm[16]);
  const avgHip = (leftHip + rightHip) / 2;

  const elbowOk = avgElbow >= 80 && avgElbow <= 110;
  const hipOk = avgHip > 170;

  if (elbowOk && hipOk) {
    return { status: "good", cue: null };
  }

  if (!elbowOk) return { status: "bad", cue: "Adjust elbow angle" };
  if (!hipOk) return { status: "bad", cue: "Keep hips straight" };

  return { status: "bad", cue: "Adjust your form" };
}

function validatePlank(lm: NormalizedLandmark[]): FormValidationResult {
  const leftHip = computeAngle(lm[11], lm[23], lm[27]);
  const rightHip = computeAngle(lm[12], lm[24], lm[28]);
  const avgHip = (leftHip + rightHip) / 2;

  if (avgHip > 170) {
    return { status: "good", cue: null };
  }

  return { status: "bad", cue: "Keep hips straight" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates push-up form for the given variation using MediaPipe landmarks.
 * Returns `status: 'unknown'` when landmarks is null or any key joint has
 * visibility < 0.5.
 */
export function validateForm(
  landmarks: NormalizedLandmark[] | null,
  variation: ExerciseId
): FormValidationResult {
  if (landmarks === null) {
    return { status: "unknown", cue: null };
  }

  const keyJoints = KEY_JOINTS[variation];
  if (!hasVisibleJoints(landmarks, keyJoints)) {
    return { status: "unknown", cue: null };
  }

  switch (variation) {
    case "push-ups":
      return validatePushUps(landmarks);
    case "diamond-push-ups":
      return validateDiamondPushUps(landmarks);
    case "wide-push-ups":
      return validateWidePushUps(landmarks);
    case "archer-push-ups":
      return validateArcherPushUps(landmarks);
    case "decline-push-ups":
      return validateDeclinePushUps(landmarks);
    case "incline-push-ups":
      return validateInclinePushUps(landmarks);
    case "plank":
      return validatePlank(landmarks);
  }
}
