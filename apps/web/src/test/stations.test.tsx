import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import type { ReactNode } from "react";
import { DataProviderRoot } from "@/lib/data/DataProviderContext";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { StationForm } from "@/features/stations/StationForm";
import { StationView } from "@/features/stations/StationView";
import { NewDeviceForm } from "@/features/devices/NewDeviceForm";
import { NewStreamForm } from "@/features/streams/NewStreamForm";
import { SignedInHome } from "@/features/home/SignedInHome";
import { t } from "@/i18n/t";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/app",
  query: "",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.replace }),
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

async function createAccountWithProfile(
  provider: dp.DataProviderV2,
  email: string,
  username: string,
  displayName: string,
) {
  const user = await provider.createAccount(email, "password123");
  await provider.createUserProfile({
    schemaVersion: 2,
    uid: user.uid,
    email,
    username,
    displayName,
    createdAt: Date.now(),
  });
  return user;
}

async function seedDeviceTypes(provider: dp.DataProviderV2) {
  for (const type of v2.BUILTIN_DEVICE_TYPES) {
    await provider.publishDeviceType(type);
  }
}

function stationSeed(ownerUid: string, id: string): v2.Station {
  return {
    schemaVersion: 2,
    id,
    ownerUid,
    name: "Test lab",
    location: {
      lat: -0.123456,
      lon: -78.654321,
      altitudeM: 2800,
      city: "Secret city",
      countryCode: "EC",
    },
    publicPrecision: "hidden",
    visibility: "private",
    timezone: "America/Guayaquil",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function fillStationForm(
  user: ReturnType<typeof userEvent.setup>,
  visibility?: v2.Visibility,
) {
  await user.type(screen.getByLabelText(t("station.field.name")), "USFQ roof");
  if (visibility !== undefined) {
    await user.click(screen.getByLabelText(t(`station.visibility.${visibility}`)));
  }
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.query = "";
  navigation.pathname = "/app";
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("station create flow (CA1)", () => {
  it("refuses to submit without an explicit visibility choice", async () => {
    const { provider } = fixture();
    await createAccountWithProfile(provider, "owner@example.test", "owner_lab", "Owner");
    mount(
      provider,
      <RequireAuth>
        <StationForm mode="create" />
      </RequireAuth>,
    );
    const user = userEvent.setup();
    await fillStationForm(user);
    const submit = screen.getByRole("button", { name: t("station.createSubmit") });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.submit(submit.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      t("station.visibilityRequired"),
    );
  });

  it("creates a station, device and stream through the forms", async () => {
    const { provider } = fixture();
    const owner = await createAccountWithProfile(
      provider,
      "owner@example.test",
      "owner_lab",
      "Owner",
    );
    await seedDeviceTypes(provider);
    const user = userEvent.setup();

    mount(
      provider,
      <RequireAuth>
        <StationForm mode="create" />
      </RequireAuth>,
    );
    await fillStationForm(user, "private");
    await user.click(screen.getByRole("button", { name: t("station.createSubmit") }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    const stationId = decodeURIComponent(
      navigation.replace.mock.calls.at(-1)![0].split("id=")[1] ?? "",
    );
    const station = await provider.getStation(stationId);
    expect(station?.name).toBe("USFQ roof");

    navigation.query = `station=${stationId}`;
    navigation.pathname = "/app/device/new";
    mount(
      provider,
      <RequireAuth>
        <NewDeviceForm />
      </RequireAuth>,
    );
    await user.type(await screen.findByLabelText(t("devices.field.label")), "CW-1");
    await user.selectOptions(screen.getByLabelText(t("devices.field.type")), "cosmicwatch-v2:1");
    await user.click(screen.getByRole("button", { name: t("devices.createSubmit") }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(`/app/station?id=${stationId}`),
    );
    const devices = await provider.listDevices(stationId);
    expect(devices.items).toHaveLength(1);

    navigation.query = `station=${stationId}`;
    mount(
      provider,
      <RequireAuth>
        <NewStreamForm />
      </RequireAuth>,
    );
    await user.selectOptions(
      await screen.findByLabelText(t("streams.field.device")),
      devices.items[0]!.id,
    );
    await user.click(screen.getByRole("button", { name: t("streams.createSubmit") }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(`/app/station?id=${stationId}`),
    );
    const streams = await provider.listStreams(stationId);
    expect(streams.items).toHaveLength(1);
    expect(streams.items[0]?.ownerUid).toBe(owner.uid);
  });
});

describe("role-based controls (CA2)", () => {
  async function setupStationRoles() {
    const { provider } = fixture();
    const owner = await createAccountWithProfile(provider, "o@example.test", "owner_x", "Owner");
    const editor = await createAccountWithProfile(provider, "e@example.test", "editor_x", "Editor");
    const viewer = await createAccountWithProfile(provider, "v@example.test", "viewer_x", "Viewer");
    const id = dp.newStationId();
    await provider.createStation(stationSeed(owner.uid, id));
    await provider.addMember(id, editor.uid, "editor");
    await provider.addMember(id, viewer.uid, "viewer");
    return { provider, id, owner, editor, viewer };
  }

  it("shows owner, editor and viewer controls appropriately", async () => {
    const { provider, id, owner, editor } = await setupStationRoles();

    await provider.signOut();
    await provider.signInWithEmail("v@example.test", "password123");
    navigation.query = `id=${id}`;
    mount(
      provider,
      <RequireAuth>
        <StationView stationId={id} />
      </RequireAuth>,
    );
    await screen.findByRole("heading", { name: "Test lab" });
    expect(screen.queryByRole("button", { name: t("station.edit") })).toBeNull();
    expect(screen.queryByRole("link", { name: t("devices.add") })).toBeNull();
    expect(screen.queryByRole("link", { name: t("streams.add") })).toBeNull();
    expect(screen.queryByText(t("station.addMember"))).toBeNull();

    cleanup();
    await provider.signOut();
    await provider.signInWithEmail("e@example.test", "password123");
    mount(
      provider,
      <RequireAuth>
        <StationView stationId={id} />
      </RequireAuth>,
    );
    await screen.findByRole("heading", { name: "Test lab" });
    expect(screen.queryByRole("button", { name: t("station.edit") })).toBeNull();
    expect(await screen.findByRole("link", { name: t("devices.add") })).toBeTruthy();
    expect(screen.getByRole("link", { name: t("streams.add") })).toBeTruthy();
    expect(screen.queryByText(t("station.transferTitle"))).toBeNull();

    cleanup();
    await provider.signOut();
    await provider.signInWithEmail("o@example.test", "password123");
    mount(
      provider,
      <RequireAuth>
        <StationView stationId={id} />
      </RequireAuth>,
    );
    await screen.findByRole("heading", { name: "Test lab" });
    expect(screen.getByRole("button", { name: t("station.edit") })).toBeTruthy();
    expect(screen.getByText(t("station.transferTitle"))).toBeTruthy();
    expect(owner.uid).not.toBe(editor.uid);
  });
});

describe("members (CA3)", () => {
  it("resolves usernames, adds members and supports role changes and removal", async () => {
    const { provider } = fixture();
    const owner = await createAccountWithProfile(provider, "o@example.test", "owner_x", "Owner");
    await provider.signOut();
    await createAccountWithProfile(provider, "c@example.test", "colleague", "Colleague");
    await provider.signOut();
    await provider.signInWithEmail("o@example.test", "password123");
    const id = dp.newStationId();
    await provider.createStation(stationSeed(owner.uid, id));
    navigation.query = `id=${id}`;
    const user = userEvent.setup();
    mount(
      provider,
      <RequireAuth>
        <StationView stationId={id} />
      </RequireAuth>,
    );
    await screen.findByRole("heading", { name: "Test lab" });
    await user.type(screen.getByLabelText(t("auth.username")), "unknown_person");
    await user.click(screen.getByRole("button", { name: t("station.lookupMember") }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      t("station.memberUnknown"),
    );

    await user.clear(screen.getByLabelText(t("auth.username")));
    await user.type(screen.getByLabelText(t("auth.username")), "colleague");
    await user.click(screen.getByRole("button", { name: t("station.lookupMember") }));
    expect(await screen.findByText(t("station.memberConfirm", { name: "Colleague" }))).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t("station.addMemberSubmit") }));
    await waitFor(async () => {
      expect((await provider.listMembers(id)).items).toHaveLength(1);
    });

    const memberUid = (await provider.listMembers(id)).items[0]!.uid;
    await user.selectOptions(document.getElementById(`member-role-${memberUid}`)!, "editor");
    await waitFor(async () => {
      expect((await provider.listMembers(id)).items[0]?.role).toBe("editor");
    });

    await user.click(screen.getByRole("button", { name: t("station.removeMember") }));
    await user.click(screen.getByRole("button", { name: t("station.confirmRemove") }));
    await waitFor(async () => {
      expect(
        (await provider.listMembers(id)).items.find((m) => m.uid === memberUid),
      ).toBeUndefined();
    });
  });
});

describe("ownership transfer (CA4)", () => {
  it("shows a dismissible notice to the new owner on the home page", async () => {
    const { provider } = fixture();
    const owner = await createAccountWithProfile(provider, "o@example.test", "owner_x", "Owner");
    await provider.signOut();
    const colleague = await createAccountWithProfile(
      provider,
      "c@example.test",
      "colleague",
      "Colleague",
    );
    await provider.signOut();
    await provider.signInWithEmail("o@example.test", "password123");
    const id = dp.newStationId();
    const station = stationSeed(owner.uid, id);
    station.name = "Transferred lab";
    await provider.createStation(station);
    await provider.addMember(id, colleague.uid, "editor");
    await provider.transferOwnership(id, colleague.uid);

    await provider.signOut();
    await provider.signInWithEmail("c@example.test", "password123");
    mount(
      provider,
      <RequireAuth>
        <SignedInHome />
      </RequireAuth>,
    );
    expect(
      await screen.findByText(t("station.transferNotice", { name: "Transferred lab" })),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: t("station.transferDismiss") }));
    await waitFor(() =>
      expect(
        screen.queryByText(t("station.transferNotice", { name: "Transferred lab" })),
      ).toBeNull(),
    );
  });
});

describe("location privacy (CA5)", () => {
  it("hides exact coordinates from a non-member", async () => {
    const { provider } = fixture();
    const owner = await createAccountWithProfile(provider, "o@example.test", "owner_x", "Owner");
    await createAccountWithProfile(provider, "s@example.test", "stranger", "Stranger");
    const id = dp.newStationId();
    await provider.createStation(stationSeed(owner.uid, id));

    await provider.signOut();
    await provider.signInWithEmail("s@example.test", "password123");
    navigation.query = `id=${id}`;
    mount(
      provider,
      <RequireAuth>
        <StationView stationId={id} />
      </RequireAuth>,
    );
    await screen.findByRole("heading", { name: "Test lab" });
    expect(screen.getByText("Secret city, EC")).toBeTruthy();
    expect(screen.queryByText("-0.123456")).toBeNull();
    expect(screen.queryByText("-78.654321")).toBeNull();
    expect(screen.queryByText("2800")).toBeNull();
  });
});
