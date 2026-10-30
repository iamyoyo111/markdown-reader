const PREFERRED_US_VOICES = [
  "Samantha",
  "Ava",
  "Allison",
  "Aria",
  "Jenny",
  "Guy",
  "Andrew",
  "Alex",
];

export function getEnglishVoices(voices: SpeechSynthesisVoice[]) {
  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => {
      const aUS = a.lang.toLowerCase() === "en-us" ? 1 : 0;
      const bUS = b.lang.toLowerCase() === "en-us" ? 1 : 0;
      if (aUS !== bUS) return bUS - aUS;

      const aPreferred = PREFERRED_US_VOICES.some((name) => a.name.includes(name))
        ? 1
        : 0;
      const bPreferred = PREFERRED_US_VOICES.some((name) => b.name.includes(name))
        ? 1
        : 0;
      return bPreferred - aPreferred || a.name.localeCompare(b.name);
    });
}

export function getDefaultVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "en-us") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

export type SpeakOptions = {
  text: string;
  voice?: SpeechSynthesisVoice | null;
  rate: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

export function speakEnglish({
  text,
  voice,
  rate,
  onStart,
  onEnd,
  onError,
}: SpeakOptions) {
  if (!("speechSynthesis" in window)) {
    onError?.();
    return null;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang ?? "en-US";
  utterance.voice = voice ?? null;
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onError?.();
  window.speechSynthesis.speak(utterance);
  return utterance;
}
