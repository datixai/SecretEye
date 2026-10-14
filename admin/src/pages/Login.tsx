import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Input, toast } from "@/components/ui";
import { auth } from "@/lib/firebase";

const messages: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-email": "That email address isn't valid.",
  "auth/too-many-requests": "Too many attempts. Try again in a moment.",
  "auth/network-request-failed": "No internet connection.",
};

export default function Login({ reason }: { reason?: "not-admin" | "disabled" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === "not-admin" ? "This account doesn't have admin access. Homeowners should use the SecretEye mobile app." : reason === "disabled" ? "This account is disabled." : null,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(messages[(err as { code?: string }).code ?? ""] ?? "Couldn't sign in. Please try again.");
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) return setError("Enter your email first, then click “Forgot password”.");
    await sendPasswordResetEmail(auth, email.trim()).catch(() => {});
    toast("Reset link sent", { tone: "success", message: `If ${email.trim()} has an account, a reset email is on its way.` });
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.png" alt="" className="h-14 w-14" />
          <h1 className="mt-4 text-2xl font-bold">
            Secret<span className="text-accent">Eye</span> Admin
          </h1>
          <p className="mt-1 text-sm text-muted">Control centre sign in</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <Input label="Email" type="email" icon={Mail} autoComplete="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" type="password" icon={Lock} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy}>
            Sign in
          </Button>
          <button type="button" onClick={reset} className="block w-full text-center text-sm font-medium text-accent hover:underline">
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}
