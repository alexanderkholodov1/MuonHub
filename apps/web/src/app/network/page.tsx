import React, { type ReactNode } from "react";
import { NetworkPage } from "@/features/network/NetworkPage";

/** The network page (spec 0091), in the public site's style; it renders its own header and footer. */
export default function Page(): ReactNode {
  return <NetworkPage />;
}
