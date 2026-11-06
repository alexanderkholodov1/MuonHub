import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import type { ReactNode } from "react";
import { DataProviderRoot } from "@/lib/data/DataProviderContext";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { SignUpForm } from "@/features/auth/SignUpForm";
import { SignInForm } from "@/features/auth/SignInForm";
import { ResetForm } from "@/features/auth/ResetForm";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { SignedInHome } from "@/features/home/SignedInHome";
import { VerificationBanner } from "@/features/auth/VerificationBanner";
import { SiteHeader } from "@/components/SiteHeader";
import { safeNext } from "@/features/auth/safe-next";
import { t } from "@/i18n/t";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/app", query: "" }));
const router = { replace: navigation.replace };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

function mount(provider: dp.DataProviderV2, children: ReactNode) {
  return render(
    <DataProviderRoot provider={provider}>
      <AuthProvider>{children}</AuthProvider>
    </DataProviderRoot>,
  );
}
function fixture() {
  const store = new dp.MemoryStore();
  return { store, provider: dp.createMemoryProviderV2({ store }) };
}
async function fillSignUp(username = "researcher_1") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t("auth.email")), "new@example.test");
  await user.type(screen.getByLabelText(t("auth.password")), "password123");
  await user.type(screen.getByLabelText(t("auth.displayName")), "Researcher");
  await user.type(screen.getByLabelText(t("auth.username")), username);
  await user.click(screen.getByRole("button", { name: t("nav.signUp") }));
}
beforeEach(() => {
  navigation.replace.mockReset();
  navigation.query = "";
  navigation.pathname = "/app";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("sign-up (CA4)", () => {
  it("creates the account, profile and verification email before navigating", async () => {
    const { provider, store } = fixture();
    mount(provider, <SignUpForm />);
    await fillSignUp();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
    const account = provider.currentUser()!;
    expect(account.emailVerified).toBe(false);
    expect(await provider.getUser(account.uid)).toMatchObject({
      displayName: "Researcher",
      username: "researcher_1",
      email: "new@example.test",
      uid: account.uid,
    });
    expect(await provider.findUidByUsername("researcher_1")).toBe(account.uid);
    expect(store.verificationEmails).toHaveLength(1);
  });
  it("resumes an incomplete account after the sign-up page is remounted", async () => {
    const { provider, store } = fixture();
    store.injectFault({ op: "createUserProfile", kind: "unavailable" });
    const first = mount(provider, <SignUpForm />);
    await fillSignUp();
    await screen.findByRole("alert");
    const uid = provider.currentUser()!.uid;
    first.unmount();
    mount(provider, <SignUpForm />);
    expect(screen.queryByLabelText(t("auth.password"))).toBeNull();
    expect(screen.getByLabelText(t("auth.email"))).toHaveProperty("value", "new@example.test");
    await userEvent.type(screen.getByLabelText(t("auth.displayName")), "Researcher");
    await userEvent.type(screen.getByLabelText(t("auth.username")), "recovered_name");
    await userEvent.click(screen.getByRole("button", { name: t("auth.finishProfile") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
    expect(store.accounts.size).toBe(1);
    expect((await provider.getUser(uid))?.username).toBe("recovered_name");
  });
  it("completes the profile of an authenticated Google account without asking for a password", async () => {
    const { provider, store } = fixture();
    await provider.signInWithGoogle();
    mount(provider, <SignUpForm />);
    expect(screen.queryByLabelText(t("auth.password"))).toBeNull();
    await userEvent.type(screen.getByLabelText(t("auth.displayName")), "Google researcher");
    await userEvent.type(screen.getByLabelText(t("auth.username")), "google_researcher");
    await userEvent.click(screen.getByRole("button", { name: t("auth.finishProfile") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
    expect(store.accounts.size).toBe(1);
    expect((await provider.getUser(provider.currentUser()!.uid))?.username).toBe(
      "google_researcher",
    );
  });
  it("reports an occupied username on the field without creating an account", async () => {
    const { provider, store } = fixture();
    store.plantDoc("usernames/researcher_1", { uid: "another", createdAt: Date.now() });
    mount(provider, <SignUpForm />);
    await fillSignUp();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("auth.usernameTaken"));
    expect(screen.getByLabelText(t("auth.username")).getAttribute("aria-invalid")).toBe("true");
    expect(store.accounts.size).toBe(0);
    expect(provider.currentUser()).toBeNull();
  });
  it.each(["ab", "Uppercase", "has-hyphen", "has.dot", "has space", "x".repeat(31)])(
    "refuses invalid username %s before any write",
    async (name) => {
      const { provider, store } = fixture();
      const view = mount(provider, <SignUpForm />);
      // Dispatch submit directly to exercise application validation beyond native constraints.
      fireEvent.change(screen.getByLabelText(t("auth.username")), { target: { value: name } });
      fireEvent.submit(view.container.querySelector("form")!);
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        t("auth.usernameInvalid"),
      );
      expect(store.accounts.size).toBe(0);
    },
  );
  it.each(["_abc", "abc_"])(
    "reports the existing shared-schema limitation for %s before creating an account",
    async (name) => {
      const { provider, store } = fixture();
      mount(provider, <SignUpForm />);
      await fillSignUp(name);
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        t("auth.usernameBoundary"),
      );
      expect(store.accounts.size).toBe(0);
    },
  );
  it("refuses a short password without creating an account", async () => {
    const { provider, store } = fixture();
    const view = mount(provider, <SignUpForm />);
    fireEvent.change(screen.getByLabelText(t("auth.username")), {
      target: { value: "valid_name" },
    });
    fireEvent.change(screen.getByLabelText(t("auth.password")), { target: { value: "short" } });
    fireEvent.submit(view.container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("error.weakPassword"));
    expect(store.accounts.size).toBe(0);
  });
  it("recovers a username race by completing the same account with another username", async () => {
    const { provider, store } = fixture();
    const original = provider.createUserProfile.bind(provider);
    vi.spyOn(provider, "createUserProfile")
      .mockImplementationOnce(async () => {
        throw new dp.DataProviderError("already-exists");
      })
      .mockImplementation(original);
    mount(provider, <SignUpForm />);
    await fillSignUp();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("auth.usernameTaken"));
    expect(store.accounts.size).toBe(1);
    const uid = provider.currentUser()!.uid;
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(t("auth.username")));
    await user.type(screen.getByLabelText(t("auth.username")), "available_name");
    await user.click(screen.getByRole("button", { name: t("auth.finishProfile") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
    expect(store.accounts.size).toBe(1);
    expect((await provider.getUser(uid))?.username).toBe("available_name");
  });
  it("retries failed verification without recreating the account or profile", async () => {
    const { provider, store } = fixture();
    store.injectFault({ op: "sendEmailVerification", kind: "unavailable" });
    const profile = vi.spyOn(provider, "createUserProfile");
    mount(provider, <SignUpForm />);
    await fillSignUp();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("error.unavailable"));
    expect(navigation.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: t("auth.retryVerification") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
    expect(store.accounts.size).toBe(1);
    expect(profile).toHaveBeenCalledTimes(1);
  });
  it("shows a safe error when username preflight is denied, without creating an account", async () => {
    const { provider, store } = fixture();
    store.injectFault({ op: "findUidByUsername", kind: "permission-denied" });
    mount(provider, <SignUpForm />);
    await fillSignUp();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      t("error.permissionDenied"),
    );
    expect(store.accounts.size).toBe(0);
  });
});

describe("protected routes and sign-in (CA5)", () => {
  it.each([
    ["", "/signin?next=%2Fapp"],
    ["station=abc&view=raw", "/signin?next=%2Fapp%3Fstation%3Dabc%26view%3Draw"],
  ])("preserves path and query while redirecting signed-out users", async (query, expected) => {
    navigation.query = query;
    const { provider } = fixture();
    mount(
      provider,
      <RequireAuth>
        <p data-testid="private" />
      </RequireAuth>,
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(expected));
    expect(screen.queryByTestId("private")).toBeNull();
  });
  it.each([
    ["/app/station?id=abc", "/app/station?id=abc"],
    ["//evil.example", "/app"],
    ["https://evil.example", "/app"],
  ])("returns to a safe next after sign-in: %s", async (next, expected) => {
    const { provider } = fixture();
    await provider.createAccount("user@example.test", "password123");
    await provider.signOut();
    navigation.query = `next=${encodeURIComponent(next)}`;
    mount(provider, <SignInForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(t("auth.email")), "user@example.test");
    await user.type(screen.getByLabelText(t("auth.password")), "password123");
    await user.click(screen.getByRole("button", { name: t("nav.signIn") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(expected));
  });
  it.each([
    null,
    "",
    "javascript:alert(1)",
    "/\\evil.example",
    "/\tevil.example",
    " //evil.example",
    "/\n/evil.example",
  ])("rejects unsafe next %s", (next) => {
    expect(safeNext(next)).toBe("/app");
  });
  it("renders auth subscription errors and never reveals protected children", async () => {
    const { provider } = fixture();
    const unsubscribe = vi.fn();
    vi.spyOn(provider, "onAuthChange").mockImplementation(({ onError }) => {
      onError(new dp.DataProviderError("unavailable"));
      return unsubscribe;
    });
    const view = mount(
      provider,
      <RequireAuth>
        <p data-testid="private" />
      </RequireAuth>,
    );
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("error.unavailable"));
    expect(screen.queryByTestId("private")).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("shows Google only when enabled and applies the same redirect validation", async () => {
    const { provider } = fixture();
    vi.stubEnv("NEXT_PUBLIC_AUTH_GOOGLE", "0");
    const view = mount(provider, <SignInForm />);
    expect(screen.queryByRole("button", { name: t("auth.google") })).toBeNull();
    view.unmount();
    vi.stubEnv("NEXT_PUBLIC_AUTH_GOOGLE", "1");
    navigation.query = "next=%2F%2Fevil.example";
    mount(provider, <SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: t("auth.google") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
    expect(provider.currentUser()).not.toBeNull();
  });
});

describe("password reset (CA6)", () => {
  it("uses the exact same confirmation for known and unknown email addresses", async () => {
    const { provider } = fixture();
    await provider.createAccount("known@example.test", "password123");
    await provider.signOut();
    const confirmations: (string | null)[] = [];
    for (const email of ["known@example.test", "unknown@example.test"]) {
      const view = mount(provider, <ResetForm />);
      await userEvent.type(screen.getByLabelText(t("auth.email")), email);
      await userEvent.click(screen.getByRole("button", { name: t("auth.sendReset") }));
      confirmations.push((await screen.findByRole("status")).textContent);
      view.unmount();
    }
    expect(confirmations).toEqual([t("auth.resetConfirmation"), t("auth.resetConfirmation")]);
  });
  it("shows delivery failures instead of a false confirmation", async () => {
    const { provider, store } = fixture();
    store.injectFault({ op: "sendPasswordReset", kind: "unavailable" });
    mount(provider, <ResetForm />);
    await userEvent.type(screen.getByLabelText(t("auth.email")), "unknown@example.test");
    await userEvent.click(screen.getByRole("button", { name: t("auth.sendReset") }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("error.unavailable"));
    expect(screen.queryByText(t("auth.resetConfirmation"))).toBeNull();
  });
});

describe("verification and sign-out", () => {
  it("resends verification and removes the banner after reloading a verified user", async () => {
    const { provider, store } = fixture();
    await provider.createAccount("user@example.test", "password123");
    mount(provider, <VerificationBanner />);
    await userEvent.click(await screen.findByRole("button", { name: t("auth.resend") }));
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      t("auth.verificationSent"),
    );
    expect(store.verificationEmails).toHaveLength(1);
    store.accounts.get("user@example.test")!.emailVerified = true;
    await userEvent.click(screen.getByRole("button", { name: t("auth.checkVerification") }));
    await waitFor(() => expect(screen.queryByText(t("auth.verificationBanner"))).toBeNull());
  });
  it("shows sign-out failure and then signs out from the account menu", async () => {
    const { provider, store } = fixture();
    await provider.createAccount("user@example.test", "password123");
    store.injectFault({ op: "signOut", kind: "unavailable" });
    mount(provider, <SiteHeader />);
    await userEvent.click(await screen.findByText(t("nav.account")));
    await userEvent.click(screen.getByRole("button", { name: t("nav.signOut") }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("error.unavailable"));
    expect(provider.currentUser()).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: t("nav.signOut") }));
    await waitFor(() => expect(provider.currentUser()).toBeNull());
    expect(await screen.findByRole("link", { name: t("nav.signIn") })).toBeTruthy();
  });
});

describe("signed-in home (FR9)", () => {
  it("shows only owned/shared station names and roles, plus quarantine warnings", async () => {
    const { provider, store } = fixture();
    const user = await provider.createAccount("user@example.test", "password123");
    const station = (name: string, ownerUid: string): v2.Station => ({
      schemaVersion: 2,
      id: dp.newStationId(),
      ownerUid,
      name,
      location: { lat: -0.2, lon: -78.4, altitudeM: 2800, city: "Private city", countryCode: "EC" },
      publicPrecision: "hidden",
      visibility: "private",
      timezone: "America/Guayaquil",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const owned = station("Owned lab", user.uid);
    const shared = station("Shared lab", "another");
    await provider.createStation(owned);
    await provider.createStation(shared);
    await provider.addMember(shared.id, user.uid, "editor");
    store.plantDoc("stations/broken", { invalid: true });
    mount(
      provider,
      <RequireAuth>
        <SignedInHome />
      </RequireAuth>,
    );
    expect(await screen.findByText("Owned lab")).toBeTruthy();
    expect(await screen.findByText("Shared lab")).toBeTruthy();
    expect(screen.getByText(t("stations.role.owner"))).toBeTruthy();
    expect(screen.getByText(t("stations.role.editor"))).toBeTruthy();
    expect(screen.getByText(t("stations.invalid", { count: 1 }))).toBeTruthy();
    expect(screen.queryByText("Private city")).toBeNull();
  });

  it("reads nothing while signed out", async () => {
    const { provider } = fixture();
    const own = vi.spyOn(provider, "listMyStations");
    const shared = vi.spyOn(provider, "listSharedWithMe");
    mount(
      provider,
      <RequireAuth>
        <SignedInHome />
      </RequireAuth>,
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    expect(own).not.toHaveBeenCalled();
    expect(shared).not.toHaveBeenCalled();
  });
  it("shows both empty states for an account with no stations", async () => {
    const { provider } = fixture();
    await provider.createAccount("user@example.test", "password123");
    mount(
      provider,
      <RequireAuth>
        <SignedInHome />
      </RequireAuth>,
    );
    expect(await screen.findByText(t("stations.ownedEmpty"))).toBeTruthy();
    expect(await screen.findByText(t("stations.sharedEmpty"))).toBeTruthy();
  });
  it("shows independent loading/error states and allows a failed list to be retried", async () => {
    const { provider, store } = fixture();
    await provider.createAccount("user@example.test", "password123");
    store.injectFault({ op: "listMyStations", kind: "unavailable" });
    mount(
      provider,
      <RequireAuth>
        <SignedInHome />
      </RequireAuth>,
    );
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", t("error.unavailable"));
    expect(await screen.findByText(t("stations.sharedEmpty"))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: t("state.retry") }));
    expect(await screen.findByText(t("stations.ownedEmpty"))).toBeTruthy();
  });
  it("clears the protected home on sign-out", async () => {
    const { provider } = fixture();
    await provider.createAccount("user@example.test", "password123");
    mount(
      provider,
      <RequireAuth>
        <SignedInHome />
      </RequireAuth>,
    );
    await screen.findByText(t("stations.ownedEmpty"));
    await act(() => provider.signOut());
    expect(screen.queryByText(t("stations.title"))).toBeNull();
  });
});
