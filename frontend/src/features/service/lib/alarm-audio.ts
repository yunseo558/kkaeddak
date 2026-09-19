let context: AudioContext | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

export function stopAlarmSound() {
  if (interval) clearInterval(interval);
  interval = null;
  if (context) void context.close();
  context = null;
}

export async function startAlarmSound() {
  stopAlarmSound();
  context = new AudioContext();
  await context.resume();
  const audio = context;
  const chime = () => {
    for (let i = 0; i < 3; i++) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * 0.22;
      oscillator.frequency.value = [660, 880, 990][i];
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    }
  };
  chime();
  interval = setInterval(chime, 1600);
}
