import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextRequest, NextResponse } from "next/server";

const client = new ElevenLabsClient();

const MOOD_PROMPTS: Record<string, string> = {
  energetic:
    "High energy workout music with driving drums, powerful bass, and motivating synth leads. Fast tempo around 140 BPM. Uplifting and intense.",
  chill:
    "Relaxed lo-fi workout beats with smooth bass, gentle percussion, and warm pads. Medium tempo around 100 BPM. Calm but rhythmic.",
  aggressive:
    "Intense heavy workout music with distorted bass, hard-hitting drums, and dark synths. Fast tempo around 150 BPM. Raw and powerful.",
  focused:
    "Minimal electronic workout music with clean beats, subtle melodies, and steady rhythm. Medium-fast tempo around 120 BPM. Concentration-friendly.",
};

export async function POST(req: NextRequest) {
  const { mood } = await req.json();

  const prompt = MOOD_PROMPTS[mood] || MOOD_PROMPTS.energetic;

  try {
    const audio = await client.music.compose({
      prompt,
      musicLengthMs: 60000, // 60 seconds
    });

    // Collect the stream into a buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (err: unknown) {
    console.error("Music generation failed:", err);
    const message = err instanceof Error ? err.message : "Music generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
