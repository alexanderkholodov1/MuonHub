import React from "react";
import { StationDetailClient } from "../../../components/stations/StationDetailClient";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  // Static export needs at least one concrete route shell; real station ids are resolved
  // client-side through DataProvider after navigation from the protected station list.
  return [{ id: "_station" }];
}

export default function StationDetailPage(): React.ReactElement {
  return <StationDetailClient />;
}
