let context: AudioContext | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

export type WebAlarmPermission = NotificationPermission | "unsupported";

export function webAlarmPermission(): WebAlarmPermission {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

export async function enableWebAlarmNotifications(): Promise<WebAlarmPermission> {
  if (webAlarmPermission() === "unsupported") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

async function showWebAlarmNotification() {
  if (webAlarmPermission() !== "granted") return;
  const options: NotificationOptions = {
    body: "알람을 끄고 기상 여부를 알려주세요.",
    icon: "/brand/kkaeddak-alarm-clock.png",
    tag: "kkaeddak-wake-alarm",
    requireInteraction: true,
  };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker
      .getRegistration()
      .catch(() => undefined);
    if (registration) {
      await registration.showNotification("깨딱 · 일어날 시간이에요", options);
      return;
    }
  }
  new Notification("깨딱 · 일어날 시간이에요", options);
}

export function stopAlarmSound() {
  if (interval) clearInterval(interval);
  interval = null;
  if (context) void context.close();
  context = null;
}

export async function startAlarmSound() {
  stopAlarmSound();
  void showWebAlarmNotification();
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
