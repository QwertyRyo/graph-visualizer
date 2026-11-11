import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { authErrorMessage, resetPassword, signIn, signInWithGitHub, signInWithGoogle, signUp, useAuth } from "../data/auth";
import { WindowBar, WindowClose } from "../editor/layout/WindowBar";
import { inputClass, primaryButton } from "../editor/layout/styles";
import { closeAuthDialog, useAuthDialog, type AuthMode } from "./authDialogStore";

const MIN_PASSWORD = 6;

const providerButton =
  "flex items-center justify-center gap-2 border border-ink bg-white px-4 py-1.5 text-sm shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-accent-soft active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40";

// sign-in / sign-up window, opened from anywhere with openAuthDialog()
export function AuthDialog() {
  const mode = useAuthDialog((s) => s.mode);
  const user = useAuth((s) => s.user);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (mode && !dialog.open) dialog.showModal();
    if (!mode && dialog.open) dialog.close();
  }, [mode]);

  useEffect(() => {
    if (user) closeAuthDialog();
  }, [user]);

  return (
    <dialog
      ref={ref}
      onClose={closeAuthDialog}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthDialog();
      }}
      aria-label={mode === "signUp" ? "Create account" : "Sign in"}
      className="m-auto w-88 max-w-[calc(100vw-2rem)] border border-ink bg-white p-0 shadow-[6px_6px_0_0_var(--color-ink)] backdrop:bg-slate-900/40"
    >
      {mode && <AuthForm initialMode={mode} />}
    </dialog>
  );
}

function AuthForm({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const signingUp = mode === "signUp";

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  const forgotPassword = () => {
    if (!email.trim()) {
      setNotice(null);
      setError("Enter your email address first.");
      return;
    }
    void run(async () => {
      await resetPassword(email);
      setNotice("If an account uses that email, a password reset link is on its way.");
      setBusy(false);
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (signingUp && password.length < MIN_PASSWORD) {
      setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
      return;
    }
    void run(() => (signingUp ? signUp(email, password, name) : signIn(email, password)));
  };

  const switchMode = () => {
    setMode(signingUp ? "signIn" : "signUp");
    setError(null);
    setNotice(null);
  };

  return (
    <>
      <WindowBar title={signingUp ? "Create account" : "Sign in"}>
        <WindowClose label="Close" onClick={closeAuthDialog} />
      </WindowBar>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => void run(signInWithGoogle)} className={providerButton}>
            Continue with Google
          </button>
          <button type="button" disabled={busy} onClick={() => void run(signInWithGitHub)} className={providerButton}>
            Continue with GitHub
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {signingUp && (
            <Field id={`${ids}-name`} label="Name (optional)">
              <input
                id={`${ids}-name`}
                className={inputClass}
                autoComplete="name"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field id={`${ids}-email`} label="Email">
            <input
              id={`${ids}-email`}
              type="email"
              className={inputClass}
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id={`${ids}-password`} label="Password">
            <input
              id={`${ids}-password`}
              type="password"
              className={inputClass}
              autoComplete={signingUp ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {!signingUp && (
            <button
              type="button"
              disabled={busy}
              onClick={forgotPassword}
              className="-mt-1 self-end text-xs text-slate-500 underline-offset-2 hover:text-accent-strong hover:underline"
            >
              Forgot password?
            </button>
          )}

          {notice && (
            <p role="status" className="border-l-2 border-accent bg-accent-soft px-2 py-1 text-sm text-accent-strong">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="border-l-2 border-danger bg-red-50 px-2 py-1 text-sm text-danger-strong">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${primaryButton} mt-1`}>
            {busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600">
          {signingUp ? "Already have an account?" : "New here?"}{" "}
          <button type="button" disabled={busy} onClick={switchMode} className="font-medium text-accent-strong underline-offset-2 hover:underline">
            {signingUp ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}
