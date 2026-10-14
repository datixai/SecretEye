/** Human-readable messages for Firebase Auth error codes. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "That email address isn't valid.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "No internet connection.";
    case "auth/requires-recent-login":
      return "Please confirm your password and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    default:
      return "Something went wrong. Please try again.";
  }
}
