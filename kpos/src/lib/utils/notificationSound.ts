export type NotificationSound = 'bell' | 'chime' | 'ding' | 'beep';

type Tone = {
    frequency: number;
    start: number;
    duration: number;
    type?: OscillatorType;
};

const TONES: Record<NotificationSound, Tone[]> = {
    bell: [
        { frequency: 880, start: 0, duration: 0.16, type: 'sine' },
        { frequency: 1320, start: 0.12, duration: 0.22, type: 'sine' },
    ],
    chime: [
        { frequency: 659, start: 0, duration: 0.18, type: 'triangle' },
        { frequency: 988, start: 0.16, duration: 0.24, type: 'triangle' },
    ],
    ding: [
        { frequency: 1175, start: 0, duration: 0.18, type: 'sine' },
    ],
    beep: [
        { frequency: 740, start: 0, duration: 0.12, type: 'square' },
        { frequency: 740, start: 0.18, duration: 0.12, type: 'square' },
    ],
};

function clampVolume(volume: number): number {
    if (!Number.isFinite(volume)) return 0.7;
    return Math.min(1, Math.max(0, volume / 100));
}

export async function playNotificationSound(
    sound: string = 'bell',
    volume: number = 70,
): Promise<void> {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    if (context.state === 'suspended') {
        await context.resume();
    }

    const masterGain = context.createGain();
    masterGain.gain.value = clampVolume(Number(volume));
    masterGain.connect(context.destination);

    const tones = TONES[(sound as NotificationSound) in TONES ? sound as NotificationSound : 'bell'];
    const now = context.currentTime;
    let stopAt = now;

    for (const tone of tones) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startAt = now + tone.start;
        const endAt = startAt + tone.duration;

        oscillator.type = tone.type || 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start(startAt);
        oscillator.stop(endAt + 0.02);
        stopAt = Math.max(stopAt, endAt + 0.04);
    }

    window.setTimeout(() => void context.close(), Math.ceil((stopAt - now) * 1000) + 80);
}

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}
