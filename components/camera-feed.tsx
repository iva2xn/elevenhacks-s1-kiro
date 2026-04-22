"use client";

import { useEffect, useRef, useState } from "react";

interface CameraFeedProps {
  onStreamReady: (videoEl: HTMLVideoElement) => void;
  onError: (reason: "denied" | "unsupported") => void;
  mirrored?: boolean; // default true
}

export default function CameraFeed({
  onStreamReady,
  onError,
  mirrored = true,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorReason, setErrorReason] = useState<"denied" | "unsupported" | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setErrorReason("unsupported");
      onError("unsupported");
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.play().catch(() => {
          // play() rejection is non-fatal; loadedmetadata will still fire
        });

        video.addEventListener(
          "loadedmetadata",
          () => {
            if (!cancelled) {
              setStreamReady(true);
              onStreamReady(video);
            }
          },
          { once: true }
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name =
          err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErrorReason("denied");
          onError("denied");
        } else {
          setErrorReason("unsupported");
          onError("unsupported");
        }
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // onStreamReady and onError are intentionally excluded — callers should
    // stabilise these with useCallback; re-running on every render would
    // restart the camera unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorReason === "denied") {
    return (
      <div
        role="alert"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
          color: "#fff",
          zIndex: 0,
        }}
      >
        Camera access denied. Please allow camera access to use this app.
      </div>
    );
  }

  if (errorReason === "unsupported") {
    return (
      <div
        role="alert"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
          color: "#fff",
          zIndex: 0,
        }}
      >
        Camera not supported on this device.
      </div>
    );
  }

  return (
    <>
      {/* Loading state: dark overlay shown until stream is ready */}
      {!streamReady && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "#000",
            zIndex: 0,
          }}
        />
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          zIndex: 0,
          transform: mirrored ? "scaleX(-1)" : "none",
          display: streamReady ? "block" : "none",
        }}
      />
    </>
  );
}
