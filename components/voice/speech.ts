export interface SpeechAlternativeLike {
  readonly transcript: string;
}

export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike | undefined;
}

export interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike | undefined;
}

export interface SpeechResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechResultListLike;
}

export interface SpeechErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type VoiceErrorKey =
  "notAllowed" | "noSpeech" | "network" | "audioCapture" | "languageNotSupported" | "generic";

const SPEECH_LANGUAGES: Record<string, readonly string[]> = {
  ru: ["ru-RU"],
  kk: ["kk-KZ", "ru-RU"],
};

const SENTENCE_END = /[.!?…]["»)]*$/;
const LEADING_PUNCTUATION = /^[,.;:!?…)»]/;
const CAPITALIZED_WORD = /^\p{Lu}(?:\p{Ll}|\s|$)/u;

export function speechRecognitionFrom(scope: unknown): SpeechRecognitionConstructor | null {
  if (typeof scope !== "object" || scope === null) {
    return null;
  }
  const candidate = scope as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const constructor = candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
  return typeof constructor === "function" ? (constructor as SpeechRecognitionConstructor) : null;
}

export function speechLanguages(
  locale: string,
  rejected: ReadonlySet<string> = new Set(),
): string[] {
  const preferred = SPEECH_LANGUAGES[locale] ?? SPEECH_LANGUAGES.ru ?? ["ru-RU"];
  const usable = preferred.filter((language) => !rejected.has(language));
  return usable.length > 0 ? usable : ["ru-RU"];
}

export function speechErrorKey(code: string): VoiceErrorKey | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "notAllowed";
    case "no-speech":
      return "noSpeech";
    case "network":
      return "network";
    case "audio-capture":
      return "audioCapture";
    case "language-not-supported":
      return "languageNotSupported";
    default:
      return "generic";
  }
}

function joinSpoken(left: string, right: string): string {
  return [left.trim(), right.trim()].filter((part) => part.length > 0).join(" ");
}

export function collectResults(event: SpeechResultEventLike): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript ?? "";
    if (result?.isFinal) {
      final = joinSpoken(final, transcript);
    } else {
      interim = joinSpoken(interim, transcript);
    }
  }
  return { final, interim };
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function decapitalize(text: string): string {
  return CAPITALIZED_WORD.test(text) ? text.charAt(0).toLocaleLowerCase() + text.slice(1) : text;
}

export function mergeTranscript(text: string, addition: string): string {
  const spoken = addition.replace(/\s+/g, " ").trim();
  if (spoken.length === 0) {
    return text;
  }
  const base = text.replace(/[ \t]+$/, "");
  if (base.trim().length === 0) {
    return base + capitalize(spoken);
  }
  if (LEADING_PUNCTUATION.test(spoken)) {
    return base + spoken;
  }
  if (base.endsWith("\n")) {
    return base + capitalize(spoken);
  }
  return `${base} ${SENTENCE_END.test(base) ? capitalize(spoken) : decapitalize(spoken)}`;
}

export interface DictationCallbacks {
  onText: (text: string) => void;
  onError: (key: VoiceErrorKey) => void;
  onListeningChange: (listening: boolean) => void;
  onLanguageRejected?: (language: string) => void;
}

export interface Dictation {
  stop(): void;
  abort(): void;
}

export function startDictation(
  Recognition: SpeechRecognitionConstructor,
  languages: readonly string[],
  initialText: string,
  callbacks: DictationCallbacks,
): Dictation {
  let committed = initialText;
  let interim = "";
  let current: SpeechRecognitionLike | null = null;
  let fallback: readonly string[] | null = null;
  let stopped = false;

  const run = (queue: readonly string[]) => {
    const [language, ...rest] = queue;
    if (language === undefined) {
      callbacks.onListeningChange(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const chunk = collectResults(event);
      if (chunk.final.length > 0) {
        committed = mergeTranscript(committed, chunk.final);
      }
      interim = chunk.interim;
      callbacks.onText(mergeTranscript(committed, interim));
    };
    recognition.onerror = (event) => {
      if (event.error === "language-not-supported" && rest.length > 0) {
        callbacks.onLanguageRejected?.(language);
        fallback = stopped ? null : rest;
      }
      const key = speechErrorKey(event.error);
      if (key !== null) {
        callbacks.onError(key);
      }
    };
    recognition.onend = () => {
      current = null;
      const next = fallback;
      fallback = null;
      if (next !== null && !stopped) {
        run(next);
        return;
      }
      if (interim.length > 0) {
        committed = mergeTranscript(committed, interim);
        interim = "";
        callbacks.onText(committed);
      }
      callbacks.onListeningChange(false);
    };
    current = recognition;
    try {
      recognition.start();
      callbacks.onListeningChange(true);
    } catch (error) {
      console.warn("Speech recognition could not start", error);
      current = null;
      callbacks.onError("generic");
      callbacks.onListeningChange(false);
    }
  };

  run(languages);
  return {
    stop() {
      stopped = true;
      current?.stop();
    },
    abort() {
      stopped = true;
      current?.abort();
    },
  };
}
