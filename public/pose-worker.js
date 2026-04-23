// Pose estimation Web Worker — runs MediaPipe entirely off the main thread
// Receives raw pixel data (ImageData buffer), runs inference, posts landmarks back

const MEDIAPIPE_VERSION = "0.10.34";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let landmarker = null;
let ready = false;
let busy = false;
let canvas = null;
let ctx = null;

async function init() {
  const { FilesetResolver, PoseLandmarker } = await import(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`
  );

  for (const delegate of ["GPU", "CPU"]) {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "IMAGE",
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
  self.postMessage({ type: "error", message: "Could not init PoseLandmarker" });
}

self.onmessage = (e) => {
  const { type } = e.data;

  if (type === "init") {
    init();
    return;
  }

  if (type === "frame") {
    if (!ready || !landmarker || busy) return;
    busy = true;

    const { width, height, buffer } = e.data;

    try {
      // Reconstruct ImageData from the transferred buffer
      const pixels = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(pixels, width, height);

      // We need a canvas to pass to detectForVideo/detect
      if (!canvas || canvas.width !== width || canvas.height !== height) {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext("2d");
      }
      ctx.putImageData(imageData, 0, 0);

      const result = landmarker.detect(canvas);

      if (result?.landmarks?.length > 0) {
        self.postMessage({ type: "landmarks", landmarks: result.landmarks[0] });
      } else {
        self.postMessage({ type: "landmarks", landmarks: null });
      }
    } catch (err) {
      self.postMessage({ type: "landmarks", landmarks: null });
    } finally {
      busy = false;
    }
  }
};
