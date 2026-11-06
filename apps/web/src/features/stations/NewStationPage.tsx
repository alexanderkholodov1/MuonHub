"use client";

import React from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StationForm } from "@/features/stations/StationForm";
import { t } from "@/i18n/t";

export function NewStationPage(): ReactNode {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold">{t("station.newTitle")}</h1>
        <Link className="underline" href="/app">
          {t("station.backHome")}
        </Link>
      </div>
      <StationForm mode="create" />
    </div>
  );
}
