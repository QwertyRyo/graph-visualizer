import {
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { create } from "zustand";
import { auth } from "./firebase";

type AuthState = { user: User | null; ready: boolean };

export const useAuth = create<AuthState>(() => ({ user: null, ready: false }));

onAuthStateChanged(auth, (user) => useAuth.setState({ user, ready: true }));

export async function signUp(email: string, password: string, displayName?: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const name = displayName?.trim();
  if (name) {
    await updateProfile(user, { displayName: name });
    useAuth.setState({ user: auth.currentUser });
  }
  return user;
}

export async function signIn(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export async function signInWithGoogle(): Promise<User> {
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}

export async function signInWithGitHub(): Promise<User> {
  return (await signInWithPopup(auth, new GithubAuthProvider())).user;
}

// firebase reports success even for unknown emails, so accounts can't be probed
export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email.trim());
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

// a sentence to show the user for a failed sign-in, sign-up or sign-out
export function authErrorMessage(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address isn't valid.";
    case "auth/missing-email":
      return "Enter your email address first.";
    case "auth/missing-password":
      return "Enter a password.";
    case "auth/weak-password":
      return "Passwords need at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account with that email already exists. Try signing in.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Wrong email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/account-exists-with-different-credential":
      return "An account with that email already exists. Sign in the way you did before.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "The sign-in window was blocked. Allow pop-ups for this site and try again.";
    case "auth/network-request-failed":
      return "Couldn't reach the server. Check your connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
