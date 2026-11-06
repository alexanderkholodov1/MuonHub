/**
 * English UI strings — the source locale (spec 0088 FR5). Every user-visible text comes from here;
 * translations (es, pt-BR) are added in M7 with the same keys.
 */
export const en = {
  "app.name": "MuonHub",
  "app.tagline": "Open science for cosmic-ray detectors",
  "nav.signIn": "Sign in",
  "nav.signUp": "Create account",
  "nav.signOut": "Sign out",
  "nav.myStations": "My stations",
  "nav.account": "Account",
  "home.title": "MuonHub",
  "home.body":
    "An open-science platform for cosmic-ray detectors, starting at the USFQ physics laboratory in Quito. The public site is being rebuilt; signed-in users can manage their stations and streams.",
  "home.cta.signIn": "Sign in",
  "home.cta.signUp": "Create an account",
  "notFound.title": "Page not found",
  "notFound.body": "The address does not match any page of MuonHub.",
  "notFound.back": "Go to the start page",
  "config.title": "MuonHub is not configured",
  "config.body":
    "This build is missing its public Firebase configuration, so it cannot connect. The following values are missing or invalid:",
  "state.loading": "Loading…",
  "state.retry": "Try again",
  "error.generic": "Something went wrong. Please try again.",
  "error.unavailable":
    "MuonHub cannot reach the server right now. Check your connection and try again.",
  "error.permissionDenied": "You do not have access to this.",
  "error.unauthenticated": "Your session has ended. Please sign in again.",
  "error.notFound": "This item does not exist or was removed.",
  "error.alreadyExists": "This already exists.",
  "error.invalidCredentials": "The email or password is not correct.",
  "error.emailInUse": "An account with this email already exists.",
  "error.weakPassword": "Choose a password with at least 8 characters.",
  "error.rateLimited": "Too many attempts. Wait a moment and try again.",
  "error.invalidArgument": "Some values are not valid.",
  "error.conflict": "This was changed by someone else. Reload and try again.",
  "error.outcomeUnknown":
    "The server did not answer in time; the change may or may not have been saved. Reload to check.",
} as const;

export type MessageKey = keyof typeof en;
