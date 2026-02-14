/**
 * Play a short two-tone "gong" using Web Audio.
 * Returns true if playback was started, false when audio is unavailable/blocked.
 */
export function playCompletionGong(): boolean {
  if (typeof window === 'undefined') return false;

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return false;

  try {
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;

    const createTone = (frequency: number, start: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    createTone(440, now, 0.55, 0.09);
    createTone(660, now + 0.12, 0.65, 0.07);

    // Close context after tones finish to avoid accumulating contexts in long sessions.
    setTimeout(() => {
      void ctx.close();
    }, 900);

    return true;
  } catch (err) {
    console.debug('[audio] completion gong unavailable:', err);
    return false;
  }
}
