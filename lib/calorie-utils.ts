export type ExerciseId =
  | "push-ups"
  | "diamond-push-ups"
  | "wide-push-ups"
  | "archer-push-ups"
  | "decline-push-ups"
  | "incline-push-ups"
  | "plank";

export const MET_VALUES: Record<ExerciseId, number> = {
  "push-ups": 8.0,
  "diamond-push-ups": 8.0,
  "wide-push-ups": 8.0,
  "archer-push-ups": 8.0,
  "decline-push-ups": 8.0,
  "incline-push-ups": 8.0,
  "plank": 3.0,
};

/**
 * Estimates calories burned using the MET formula.
 * calories = MET × weight_kg × duration_hours
 */
export function estimateCalories(
  met: number,
  weightKg: number,
  durationHours: number
): number {
  return met * weightKg * durationHours;
}
