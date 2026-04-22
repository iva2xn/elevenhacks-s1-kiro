// Pose estimation Web Worker
// Runs MediaPipe PoseLandmarker off the main thread so inference never blocks UI

const MEDIAPIPE_VERSION = "0.10.34";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let landmarker = null;
let ready = false;
let inferring = false;

async function init() {
  // Import MediaPipe inside the worker
  const { FilesetResolver, PoseLandmarker } = await import(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`
  );

  for (const delegate of ["GPU", "CPU"]) {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      ready = true;
      self.postMessage({ type: "ready", delegate });
      return;
    } catch (err) {
      console.warn(`[pose-worker] delegate=${delegate} failed:`, err);
    }
  }
  self.postMessage({ type: "error", message: "Could not initialise PoseLandmarker" });
}

self.onmessage = async (e) => {
  const { type, bitmap, timestamp } = e.data;

  if (type === "init") {
    init();
    return;
  }

  if (type === "frame") {
    // Drop frame if still processing previous one
    if (!ready || !landmarker || inferring) {
      bitmap.close();
      return;
    }

    inferring = true;
    try {
      const result = landmarker.detectForVideo(bitmap, timestamp);
      bitmap.close();
      if (result?.landmarks?.length > 0) {
        // Serialize landmarks — structured clone handles plain objects fine
        self.postMessage({ type: "landmarks", landmarks: result.landmarks[0] });
      } else {
        self.postMessage({ type: "landmarks", landmarks: null });
      }
    } catch (err) {
      bitmap.close();
      self.postMessage({ type: "landmarks", landmarks: null });
    } finally {
      inferring = false;
    }
  }
};
