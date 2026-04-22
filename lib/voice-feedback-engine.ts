export interface VoiceFeedbackEngine {
  enqueue(message: string): void;
  dispose(): void;
}

export function createVoiceFeedbackEngine(): VoiceFeedbackEngine {
  const queue: string[] = [];
  let isPlaying = false;
  let currentAudio: HTMLAudioElement | null = null;

  async function _playNext(): Promise<void> {
    if (queue.length === 0) {
      isPlaying = false;
      return;
    }

    isPlaying = true;
    const message = queue.shift()!;

    let response: Response;
    try {
      response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    } catch (err) {
      console.error('TTS fetch error:', err);
      _playNext();
      return;
    }

    if (!response.ok) {
      console.error('TTS API error:', response.status);
      _playNext();
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      _playNext();
    };

    audio.onerror = () => {
      console.error('Audio playback error');
      URL.revokeObjectURL(url);
      currentAudio = null;
      _playNext();
    };

    audio.play().catch((err) => {
      console.error('TTS play error:', err);
    });
  }

  return {
    enqueue(message: string): void {
      queue.push(message);
      if (!isPlaying) {
        _playNext();
      }
    },

    dispose(): void {
      queue.length = 0;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      isPlaying = false;
    },
  };
}
