"use client";

import React from "react";
import { useState, type ReactNode } from "react";
import { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource } from "@/lib/data/useResource";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";
import { useAuth } from "@/features/auth/AuthProvider";
import { Field, SelectField } from "./form-fields";
import { canManageMembers, type StationAccessRole } from "./resolve-role";

/**
 * Profiles are private to their owner (rules: `users/{uid}` is readable by its user and admins), so
 * another member's display name is usually unreadable. That is expected, not an error: the member is
 * then shown with a neutral label. Any other failure still surfaces.
 */
async function readableName(provider: dp.DataProviderV2, uid: string): Promise<string | null> {
  try {
    return (await provider.getUser(uid))?.displayName ?? null;
  } catch (error) {
    if (error instanceof dp.DataProviderError && error.code === "permission-denied") return null;
    throw error;
  }
}

function memberLabel(uid: string): string {
  return t("station.memberUnnamed", { id: uid.slice(0, 6) });
}

async function loadMemberProfiles(
  provider: dp.DataProviderV2,
  members: v2.StationMember[],
): Promise<{ uid: string; role: v2.MemberRole; displayName: string }[]> {
  const rows = await Promise.all(
    members.map(async (member) => ({
      uid: member.uid,
      role: member.role,
      displayName: (await readableName(provider, member.uid)) ?? memberLabel(member.uid),
    })),
  );
  return rows;
}

export function MembersSection({
  stationId,
  role,
}: {
  stationId: string;
  role: StationAccessRole;
}): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<v2.MemberRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  const key = provider !== null && user !== null ? `${stationId}:${user.uid}:members` : null;
  const members = useResource(key, async () => {
    if (provider === null || user === null) throw new dp.DataProviderError("unauthenticated");
    const list = await provider.listMembers(stationId);
    return {
      rows: await loadMemberProfiles(provider, list.items),
      invalid: list.quarantine.count,
    };
  });

  if (!canManageMembers(role) && role !== "editor" && role !== "viewer") return null;

  async function lookupUsername(): Promise<void> {
    if (provider === null || busy) return;
    setUsernameError(null);
    setPendingName(null);
    setPendingUid(null);
    const trimmed = username.trim();
    if (!/^[a-z0-9_]{3,30}$/.test(trimmed)) {
      setUsernameError(t("auth.usernameInvalid"));
      return;
    }
    setBusy(true);
    try {
      const uid = await provider.findUidByUsername(trimmed);
      if (uid === null) {
        setUsernameError(t("station.memberUnknown"));
        return;
      }
      setPendingUid(uid);
      setPendingName((await readableName(provider, uid)) ?? trimmed);
    } catch (cause) {
      setUsernameError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAdd(): Promise<void> {
    if (provider === null || pendingUid === null || busy) return;
    setError(null);
    setBusy(true);
    try {
      await provider.addMember(stationId, pendingUid, addRole);
      setUsername("");
      setPendingName(null);
      setPendingUid(null);
      members.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(uid: string, nextRole: v2.MemberRole): Promise<void> {
    if (provider === null || busy) return;
    setError(null);
    setBusy(true);
    try {
      await provider.changeMemberRole(stationId, uid, nextRole);
      members.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(uid: string): Promise<void> {
    if (provider === null || busy) return;
    setError(null);
    setBusy(true);
    try {
      await provider.removeMember(stationId, uid);
      setConfirmRemoveUid(null);
      members.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function leave(): Promise<void> {
    if (provider === null || busy) return;
    setError(null);
    setBusy(true);
    try {
      await provider.leaveStation(stationId);
      window.location.assign("/app");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const canLeave = role === "editor" || role === "viewer";

  return (
    <section
      aria-label={t("station.membersTitle")}
      className="space-y-4 rounded-md border border-border bg-surface p-6"
    >
      <h2 className="text-2xl font-semibold">{t("station.membersTitle")}</h2>
      {error && <p role="alert">{error}</p>}
      {members.status === "loading" && <p role="status">{t("state.loading")}</p>}
      {members.status === "error" && (
        <>
          <p role="alert">{members.error}</p>
          <Button size="lg" variant="secondary" onClick={members.reload}>
            {t("state.retry")}
          </Button>
        </>
      )}
      {members.status === "ready" && (
        <>
          {members.data.invalid > 0 && (
            <p role="alert">{t("station.membersInvalid", { count: members.data.invalid })}</p>
          )}
          {members.data.rows.length === 0 ? (
            <p className="text-secondary">{t("station.membersEmpty")}</p>
          ) : (
            <ul className="space-y-4">
              {members.data.rows.map((member) => (
                <li key={member.uid} className="flex flex-wrap items-center justify-between gap-4">
                  <span>
                    {member.displayName}{" "}
                    <span className="text-secondary">
                      {t("station.memberRoleLine", { role: t(`stations.role.${member.role}`) })}
                    </span>
                  </span>
                  {canManageMembers(role) && member.uid !== user?.uid && (
                    <div className="flex flex-wrap items-center gap-3">
                      <SelectField
                        id={`member-role-${member.uid}`}
                        label={t("station.memberRole")}
                        value={member.role}
                        onChange={(event) =>
                          changeRole(member.uid, event.target.value as v2.MemberRole)
                        }
                      >
                        <option value="editor">{t("stations.role.editor")}</option>
                        <option value="viewer">{t("stations.role.viewer")}</option>
                      </SelectField>
                      {confirmRemoveUid === member.uid ? (
                        <>
                          <Button
                            size="lg"
                            variant="secondary"
                            type="button"
                            onClick={() => setConfirmRemoveUid(null)}
                          >
                            {t("station.cancel")}
                          </Button>
                          <Button
                            size="lg"
                            variant="secondary"
                            type="button"
                            onClick={() => removeMember(member.uid)}
                          >
                            {t("station.confirmRemove")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="lg"
                          variant="secondary"
                          type="button"
                          onClick={() => setConfirmRemoveUid(member.uid)}
                        >
                          {t("station.removeMember")}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {canManageMembers(role) && (
        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="text-xl font-semibold">{t("station.addMember")}</h3>
          <Field
            id="member-username"
            label={t("auth.username")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={usernameError}
          />
          <Button
            size="lg"
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={lookupUsername}
          >
            {t("station.lookupMember")}
          </Button>
          {pendingName !== null && pendingUid !== null && (
            <div className="space-y-4 rounded-md border border-border p-4">
              <p>{t("station.memberConfirm", { name: pendingName })}</p>
              <SelectField
                id="member-add-role"
                label={t("station.memberRole")}
                value={addRole}
                onChange={(event) => setAddRole(event.target.value as v2.MemberRole)}
              >
                <option value="editor">{t("stations.role.editor")}</option>
                <option value="viewer">{t("stations.role.viewer")}</option>
              </SelectField>
              <Button size="lg" type="button" disabled={busy} onClick={confirmAdd}>
                {t("station.addMemberSubmit")}
              </Button>
            </div>
          )}
        </div>
      )}
      {canLeave && (
        <Button size="lg" variant="secondary" type="button" disabled={busy} onClick={leave}>
          {t("station.leave")}
        </Button>
      )}
    </section>
  );
}

export function TransferSection({
  stationId,
  role,
}: {
  stationId: string;
  role: StationAccessRole;
}): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const [selectedUid, setSelectedUid] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = provider !== null && canManageMembers(role) ? `${stationId}:transfer` : null;
  const members = useResource(key, async () => {
    if (provider === null) throw new dp.DataProviderError("unauthenticated");
    const list = await provider.listMembers(stationId);
    return loadMemberProfiles(provider, list.items);
  });

  if (!canManageMembers(role)) return null;

  async function transfer(): Promise<void> {
    if (provider === null || selectedUid === "" || busy) return;
    setError(null);
    setBusy(true);
    try {
      await provider.transferOwnership(stationId, selectedUid);
      window.location.assign("/app");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={t("station.transferTitle")}
      className="space-y-4 rounded-md border border-border bg-surface p-6"
    >
      <h2 className="text-2xl font-semibold">{t("station.transferTitle")}</h2>
      <p className="text-secondary">{t("station.transferHelp")}</p>
      {error && <p role="alert">{error}</p>}
      {members.status === "loading" && <p role="status">{t("state.loading")}</p>}
      {members.status === "error" && (
        <>
          <p role="alert">{members.error}</p>
          <Button size="lg" variant="secondary" onClick={members.reload}>
            {t("state.retry")}
          </Button>
        </>
      )}
      {members.status === "ready" && (
        <>
          {members.data.length === 0 ? (
            <p className="text-secondary">{t("station.transferNoMembers")}</p>
          ) : (
            <SelectField
              id="transfer-recipient"
              label={t("station.transferRecipient")}
              value={selectedUid}
              onChange={(event) => setSelectedUid(event.target.value)}
            >
              <option value="">{t("station.transferChoose")}</option>
              {members.data
                .filter((m) => m.uid !== user?.uid)
                .map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {member.displayName}
                  </option>
                ))}
            </SelectField>
          )}
          {confirming ? (
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                variant="secondary"
                type="button"
                onClick={() => setConfirming(false)}
              >
                {t("station.cancel")}
              </Button>
              <Button
                size="lg"
                type="button"
                disabled={busy || selectedUid === ""}
                onClick={transfer}
              >
                {t("station.transferConfirm")}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              variant="secondary"
              type="button"
              disabled={selectedUid === ""}
              onClick={() => setConfirming(true)}
            >
              {t("station.transferStart")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
