let audioContext: AudioContext | null = null;

export function primeFeedback() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    audioContext = null;
  }
}

function beep(context: AudioContext) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1046, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.22);
}

export function signalAligned() {
  if ("vibrate" in navigator) navigator.vibrate([70, 50, 70]);
  if (audioContext?.state === "running") beep(audioContext);
}
