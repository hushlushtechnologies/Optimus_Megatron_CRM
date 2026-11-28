"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { acceptInvitation } from "@/app/invite/[token]/actions";
import { assessPassword, MIN_PASSWORD_LENGTH } from "@/src/lib/utils/staff-password";

/*
| Setting a password when accepting an invitation.
|
| The rules are checked here as the person types AND again in the action. This
| copy is a courtesy so nobody submits a form to be told it was wrong; the
| action is the gate. Both call assessPassword(), so there is one definition of
| the policy rather than two that drift.
|
| The show/hide toggle is deliberate. Hiding a password the person is choosing
| for the first time, on their own screen, mostly produces typos — and the
| confirm box already catches those. Being able to see what you typed is the
| difference between choosing a long passphrase and choosing something short
| enough to retype confidently.
*/

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  fullName: string;
  roleName: string | null;
}

export function AcceptInvitationForm({ token, email, fullName, roleName }: AcceptInvitationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const assessment = useMemo(() => assessPassword(password, { email, fullName }), [password, email, fullName]);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = assessment.ok && confirm === password && !isPending;

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await acceptInvitation(formData);

      if (result.error) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setDone(true);
      // Straight to sign-in, and the token leaves the address bar with it.
      router.replace("/login?invited=1");
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="text-success size-8" aria-hidden="true" />
        <p className="text-text-primary text-[15px] font-semibold">Your account is ready</p>
        <p className="text-text-muted text-[13px]">Taking you to the sign-in page…</p>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="border-border bg-card-hover/40 rounded-xl border px-4 py-3">
        <p className="text-text-muted text-[12px]">You are setting up</p>
        <p className="text-text-primary mt-0.5 text-[14px] font-semibold">{fullName}</p>
        <p className="text-text-muted text-[12px]">{email}</p>
        {roleName && (
          <p className="text-text-muted mt-1.5 inline-flex items-center gap-1.5 text-[12px]">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {roleName}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Input
          label="Choose a password"
          name="password"
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setTouched(true);
          }}
          error={fieldErrors.password}
          hint={
            touched
              ? undefined
              : `At least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words are easier to remember and harder to guess than one short word with symbols in it.`
          }
        />

        {/* The shared Input renders rightIcon as decoration — pointer-events-none
            and aria-hidden — so the reveal toggle cannot live inside the field
            without changing a component used by every other form. It sits
            beside the rules instead, which also keeps it reachable by keyboard
            in a sensible order. */}
        <div className="flex items-start justify-between gap-3">
          {touched && assessment.problems.length > 0 ? (
            <ul className="space-y-1">
              {assessment.problems.map((problem) => (
                <li key={problem} className="text-warning text-[12px]">
                  {problem}
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={() => setReveal((current) => !current)}
            className="text-text-muted hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 text-[12px] transition-colors"
          >
            {reveal ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <Input
        label="Type it again"
        name="confirmPassword"
        type={reveal ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={mismatch ? "Those two passwords are different." : fieldErrors.confirmPassword}
      />

      {error && (
        <p role="alert" className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit} isLoading={isPending}>
        Set password and continue
      </Button>
    </form>
  );
}
