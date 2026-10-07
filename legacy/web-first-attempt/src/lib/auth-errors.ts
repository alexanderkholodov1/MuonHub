"use client";

import { AuthProviderError, type AuthErrorCode } from "@muonhub/data-provider";

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  "auth/email-already-in-use": "An account already exists for this email address.",
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/network-request-failed": "MuonHub could not reach the auth service. Check your connection.",
  "auth/operation-not-allowed": "This authentication method is not enabled yet.",
  "auth/persistence-unavailable": "This browser could not keep the session signed in.",
  "auth/requires-recent-login": "Please sign in again before continuing.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/unsupported": "Authentication is not available in this environment.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-record-not-found": "This account is missing its MuonHub profile.",
  "auth/weak-password": "Use at least eight characters with a stronger password.",
  "auth/internal": "Authentication failed. Try again or contact support.",
};

export function authErrorToMessage(error: unknown): string {
  if (error instanceof AuthProviderError) {
    return AUTH_ERROR_MESSAGES[error.code];
  }
  if (error instanceof Error) {
    return error.message;
  }
  return AUTH_ERROR_MESSAGES["auth/internal"];
}
