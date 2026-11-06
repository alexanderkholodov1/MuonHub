"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { StationView } from "@/features/stations/StationView";

export function StationQueryPage(): ReactNode {
  const params = useSearchParams();
  return <StationView stationId={params.get("id")} />;
}
