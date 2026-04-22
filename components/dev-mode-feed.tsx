"use client";

import { useEffect, useRef, useState } from "react";

interface DevModeFeedProps {
  onStreamReady: (videoEl: HTMLVideoElement) => void;
}

export default function DevModeFeed({ onStreamReady }: DevModeFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Notify parent once video metadata is loaded
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl) return;
    const onLoaded = () => onStreamReady(el);
    el.addEventListener("loadedmetadata", onLoaded);
    return () => el.removeEventListener("loadedmetadata", onLoaded);
  }, [videoUrl, onStreamReady]);

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function handleFile(file: File) {
    if (!file.type.startsWith("video/")) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (videoUrl) {
    return (
      <video
        ref={videoRef}
        src={videoUrl}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          zIndex: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <label
        htmlFor="dev-video-upload"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          padding: "40px 48px",
          borderRadius: "16px",
          border: `2px dashed ${isDragging ? "rgba(99,102,241,0.8)" : "rgba(255,255,255,0.15)"}`,
          backgroundColor: isDragging ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.04)",
          cursor: "pointer",
          transition: "all 0.15s ease",
          textAlign: "center",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: "0.9rem" }}>
          Upload push-up video
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.75rem" }}>
          MP4, MOV, WebM · drag & drop or click
        </span>
        <input
          id="dev-video-upload"
          type="file"
          accept="video/*"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
      </label>
    </div>
  );
}
