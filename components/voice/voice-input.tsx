"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  speechLanguages,
  speechRecognitionFrom,
  startDictation,
  type Dictation,
  type VoiceErrorKey,
} from "./speech";

const rejectedLanguages = new Set<string>();

function subscribeToNothing(): () => void {
  return () => undefined;
}

function hasSpeechRecognition(): boolean {
  return speechRecognitionFrom(window) !== null;
}

function noSpeechOnServer(): boolean {
  return false;
}

export interface VoiceInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  whenUnsupported?: "hide" | "disable";
  className?: string;
}

export function VoiceInput({
  value,
  onChange,
  disabled = false,
  whenUnsupported = "hide",
  className,
}: VoiceInputProps) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const supported = useSyncExternalStore(
    subscribeToNothing,
    hasSpeechRecognition,
    noSpeechOnServer,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceErrorKey | null>(null);
  const dictationRef = useRef<Dictation | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  useEffect(
    () => () => {
      dictationRef.current?.abort();
      dictationRef.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    if (dictationRef.current) {
      dictationRef.current.stop();
      return;
    }
    const Recognition = speechRecognitionFrom(window);
    if (!Recognition) {
      return;
    }
    setError(null);
    dictationRef.current = startDictation(
      Recognition,
      speechLanguages(locale, rejectedLanguages),
      valueRef.current,
      {
        onText: (text) => onChangeRef.current(text),
        onError: setError,
        onListeningChange: (active) => {
          setListening(active);
          if (!active) {
            dictationRef.current = null;
          }
        },
        onLanguageRejected: (language) => rejectedLanguages.add(language),
      },
    );
  }, [locale]);

  if (!supported) {
    if (whenUnsupported === "hide") {
      return null;
    }
    return (
      <button
        type="button"
        disabled
        title={t("unsupported")}
        aria-label={t("unsupported")}
        className={cn(
          "border-border text-muted flex min-h-16 min-w-16 cursor-not-allowed items-center justify-center rounded-lg border-2 opacity-60",
          className,
        )}
      >
        <MicOff className="size-7" aria-hidden />
      </button>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? t("stop") : t("start")}
        title={listening ? t("stop") : t("start")}
        className={cn(
          "flex min-h-16 min-w-16 items-center justify-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          listening
            ? "border-danger bg-danger text-danger-foreground animate-pulse"
            : "border-border-strong bg-surface-raised text-foreground hover:bg-surface",
        )}
      >
        {listening ? (
          <Square className="size-6 fill-current" aria-hidden />
        ) : (
          <Mic className="size-7" aria-hidden />
        )}
      </button>
      <span aria-live="polite" className="text-center text-xs font-semibold">
        {listening ? <span className="text-danger">{t("listening")}</span> : null}
        {!listening && error ? (
          <span className="text-danger" role="alert">
            {t(`errors.${error}`)}
          </span>
        ) : null}
      </span>
    </div>
  );
}
