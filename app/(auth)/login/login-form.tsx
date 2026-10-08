"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signInWithPin, type LoginFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ErrorMessage({ state }: { state: NonNullable<LoginFormState> }) {
  const t = useTranslations("auth");
  return (
    <div
      role="alert"
      className="border-danger bg-danger/10 rounded-lg border-2 p-4 text-base font-medium"
    >
      <p>{t(`errors.${state.error}`, { minutes: state.lockMinutes ?? 5 })}</p>
      {state.error === "invalid_credentials" && state.attemptsLeft !== undefined ? (
        <p className="text-muted mt-1">{t("attemptsLeft", { count: state.attemptsLeft })}</p>
      ) : null}
    </div>
  );
}

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState<LoginFormState, FormData>(
    signInWithPin,
    null,
  );
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold">{t("personnelNumber")}</span>
        <Input
          name="personnelNumber"
          inputMode="numeric"
          autoComplete="username"
          pattern="[0-9]*"
          maxLength={10}
          required
          autoFocus
          aria-invalid={state?.error === "invalid_input" || state?.error === "invalid_credentials"}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold">{t("pin")}</span>
        <Input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9]*"
          maxLength={6}
          required
          aria-invalid={state?.error === "invalid_input" || state?.error === "invalid_credentials"}
        />
      </label>
      {state ? <ErrorMessage state={state} /> : null}
      <Button type="submit" block disabled={isPending}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
