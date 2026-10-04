"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Detector, Station } from "@muonhub/shared";
import { Button, Card } from "@muonhub/ui";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../../components/AuthProvider";
import { DetectorRegistrationForm, StationForm } from "../../../components/stations/StationForms";

export default function NewStationPage(): React.ReactElement {
  const { user } = useAuth();
  const [registerFirstDetector, setRegisterFirstDetector] = useState(true);
  const [createdStation, setCreatedStation] = useState<Station | null>(null);
  const [createdDetectors, setCreatedDetectors] = useState<Detector[]>([]);

  if (user == null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <Card title="Loading account" loading />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-8 border-b border-[var(--color-border)] pb-6">
        <Link href="/stations" className="mb-4 inline-flex no-underline">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden="true" />}>
            Back to stations
          </Button>
        </Link>
        <h1 className="m-0 text-[length:var(--text-h1)] font-semibold leading-tight text-[var(--color-text)]">
          Create station
        </h1>
        <p className="mt-3 max-w-[760px] text-base leading-relaxed text-[var(--color-text-secondary)]">
          Create the station profile/site first, then register the physical detector that will send
          data to MuonHub.
        </p>
      </div>

      <div className="grid gap-6">
        <Card title="Onboarding option">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-base text-[var(--color-text)]">
            <input
              className="mt-1"
              type="checkbox"
              checked={registerFirstDetector}
              onChange={(event) => setRegisterFirstDetector(event.target.checked)}
              disabled={createdStation != null}
            />
            <span>
              <span className="block font-medium">Register the first detector immediately</span>
              <span className="mt-2 block text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Recommended for the common single-detector station. You can add more detectors from
                the station detail page later.
              </span>
            </span>
          </label>
        </Card>

        <StationForm
          mode="create"
          ownerUid={user.uid}
          onSaved={(station) => {
            setCreatedStation(station);
            setCreatedDetectors([]);
          }}
        />

        {createdStation != null && registerFirstDetector && (
          <DetectorRegistrationForm
            stationId={createdStation.id}
            existingDetectors={createdDetectors}
            onSaved={(detector) =>
              setCreatedDetectors((current) => {
                return [...current, detector];
              })
            }
          />
        )}

        {createdStation != null && !registerFirstDetector && (
          <Card title="Station ready">
            <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
              The station was saved. Register a detector from the station detail page before
              connecting the agent.
            </p>
            <Link href={`/stations/${createdStation.id}`} className="mt-6 inline-flex no-underline">
              <Button>Open station detail</Button>
            </Link>
          </Card>
        )}

        {createdStation != null && registerFirstDetector && createdDetectors.length > 0 && (
          <Card title="Onboarding saved">
            <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
              The station and first detector are registered. Continue to the station detail page to
              review metadata and detector inventory.
            </p>
            <Link href={`/stations/${createdStation.id}`} className="mt-6 inline-flex no-underline">
              <Button>Open station detail</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
