import { describe, expect, it, vi } from "vitest";
import {
  collectResults,
  mergeTranscript,
  speechErrorKey,
  speechLanguages,
  speechRecognitionFrom,
  startDictation,
  type SpeechRecognitionLike,
  type SpeechResultEventLike,
  type VoiceErrorKey,
} from "@/components/voice/speech";

function resultEvent(
  resultIndex: number,
  results: { transcript: string; isFinal: boolean }[],
): SpeechResultEventLike {
  return {
    resultIndex,
    results: results.map((result) => ({
      isFinal: result.isFinal,
      length: 1,
      0: { transcript: result.transcript },
    })),
  };
}

class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  started = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.onend?.();
  }

  abort() {
    this.onend?.();
  }
}

function track() {
  const texts: string[] = [];
  const errors: VoiceErrorKey[] = [];
  const listening: boolean[] = [];
  const rejected: string[] = [];
  return {
    texts,
    errors,
    listening,
    rejected,
    callbacks: {
      onText: (text: string) => texts.push(text),
      onError: (key: VoiceErrorKey) => errors.push(key),
      onListeningChange: (value: boolean) => listening.push(value),
      onLanguageRejected: (language: string) => rejected.push(language),
    },
  };
}

describe("mergeTranscript", () => {
  it("capitalises the first words of an empty field", () => {
    expect(mergeTranscript("", "течь масла на насосе")).toBe("Течь масла на насосе");
    expect(mergeTranscript("  ", "течь")).toBe("Течь");
  });

  it("continues a sentence in lower case with one space", () => {
    expect(mergeTranscript("Течь масла", "Под крышкой")).toBe("Течь масла под крышкой");
    expect(mergeTranscript("Течь масла  ", "  под   крышкой ")).toBe("Течь масла под крышкой");
  });

  it("keeps abbreviations as spoken", () => {
    expect(mergeTranscript("Проверить", "ЛЭП на участке")).toBe("Проверить ЛЭП на участке");
  });

  it("starts a new sentence after terminal punctuation", () => {
    expect(mergeTranscript("Заменил сальник.", "подтянул болты")).toBe(
      "Заменил сальник. Подтянул болты",
    );
    expect(mergeTranscript("Готово?", "да")).toBe("Готово? Да");
  });

  it("attaches spoken punctuation without a space", () => {
    expect(mergeTranscript("Заменил сальник", ", подтянул")).toBe("Заменил сальник, подтянул");
  });

  it("starts a new line with a capital letter", () => {
    expect(mergeTranscript("Первая строка\n", "вторая")).toBe("Первая строка\nВторая");
  });

  it("ignores empty transcripts", () => {
    expect(mergeTranscript("Текст ", "   ")).toBe("Текст ");
  });
});

describe("collectResults", () => {
  it("splits final and interim text from the changed results only", () => {
    const event = resultEvent(1, [
      { transcript: "старое", isFinal: true },
      { transcript: "течь масла", isFinal: true },
      { transcript: " на насосе", isFinal: false },
    ]);
    expect(collectResults(event)).toEqual({ final: "течь масла", interim: "на насосе" });
  });
});

describe("speech settings", () => {
  it("finds the standard or prefixed constructor", () => {
    expect(speechRecognitionFrom({ webkitSpeechRecognition: FakeRecognition })).toBe(
      FakeRecognition,
    );
    expect(speechRecognitionFrom({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionFrom({})).toBeNull();
    expect(speechRecognitionFrom(undefined)).toBeNull();
  });

  it("listens in Kazakh first and falls back to Russian", () => {
    expect(speechLanguages("ru")).toEqual(["ru-RU"]);
    expect(speechLanguages("kk")).toEqual(["kk-KZ", "ru-RU"]);
    expect(speechLanguages("kk", new Set(["kk-KZ"]))).toEqual(["ru-RU"]);
    expect(speechLanguages("en")).toEqual(["ru-RU"]);
    expect(speechLanguages("ru", new Set(["ru-RU"]))).toEqual(["ru-RU"]);
  });

  it("maps browser errors to messages", () => {
    expect(speechErrorKey("not-allowed")).toBe("notAllowed");
    expect(speechErrorKey("service-not-allowed")).toBe("notAllowed");
    expect(speechErrorKey("no-speech")).toBe("noSpeech");
    expect(speechErrorKey("network")).toBe("network");
    expect(speechErrorKey("audio-capture")).toBe("audioCapture");
    expect(speechErrorKey("language-not-supported")).toBe("languageNotSupported");
    expect(speechErrorKey("aborted")).toBeNull();
    expect(speechErrorKey("bad-grammar")).toBe("generic");
  });
});

describe("startDictation", () => {
  it("shows interim words live and keeps the final text", () => {
    FakeRecognition.instances = [];
    const log = track();
    startDictation(FakeRecognition, ["ru-RU"], "Течь масла.", log.callbacks);
    const recognition = FakeRecognition.instances[0];
    expect(recognition).toMatchObject({
      lang: "ru-RU",
      continuous: false,
      interimResults: true,
      started: true,
    });
    recognition?.onresult?.(resultEvent(0, [{ transcript: "подтянул", isFinal: false }]));
    recognition?.onresult?.(resultEvent(0, [{ transcript: "подтянул болты", isFinal: true }]));
    recognition?.onend?.();
    expect(log.texts).toEqual(["Течь масла. Подтянул", "Течь масла. Подтянул болты"]);
    expect(log.listening).toEqual([true, false]);
  });

  it("keeps unfinished words when recognition stops", () => {
    FakeRecognition.instances = [];
    const log = track();
    const dictation = startDictation(FakeRecognition, ["ru-RU"], "", log.callbacks);
    FakeRecognition.instances[0]?.onresult?.(
      resultEvent(0, [{ transcript: "замена ремня", isFinal: false }]),
    );
    dictation.stop();
    expect(log.texts.at(-1)).toBe("Замена ремня");
    expect(log.listening).toEqual([true, false]);
  });

  it("restarts in Russian when Kazakh is not supported", () => {
    FakeRecognition.instances = [];
    const log = track();
    startDictation(FakeRecognition, ["kk-KZ", "ru-RU"], "", log.callbacks);
    const kazakh = FakeRecognition.instances[0];
    kazakh?.onerror?.({ error: "language-not-supported" });
    kazakh?.onend?.();
    const russian = FakeRecognition.instances[1];
    expect(russian?.lang).toBe("ru-RU");
    expect(russian?.started).toBe(true);
    expect(log.rejected).toEqual(["kk-KZ"]);
    expect(log.errors).toEqual(["languageNotSupported"]);
    expect(log.listening).toEqual([true, true]);
  });

  it("reports errors and stays quiet on aborts", () => {
    FakeRecognition.instances = [];
    const log = track();
    startDictation(FakeRecognition, ["ru-RU"], "", log.callbacks);
    const recognition = FakeRecognition.instances[0];
    recognition?.onerror?.({ error: "not-allowed" });
    recognition?.onerror?.({ error: "aborted" });
    recognition?.onend?.();
    expect(log.errors).toEqual(["notAllowed"]);
    expect(log.listening).toEqual([true, false]);
  });

  it("reports a recognizer that refuses to start", () => {
    class Broken extends FakeRecognition {
      override start() {
        throw new Error("already started");
      }
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = track();
    startDictation(Broken, ["ru-RU"], "", log.callbacks);
    warn.mockRestore();
    expect(log.errors).toEqual(["generic"]);
    expect(log.listening).toEqual([false]);
  });
});
