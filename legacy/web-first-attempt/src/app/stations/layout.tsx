import React from "react";
import { AuthGate } from "../../components/AuthGate";

interface StationsLayoutProps {
  children: React.ReactNode;
}

export default function StationsLayout({ children }: StationsLayoutProps): React.ReactElement {
  return <AuthGate mode="protected">{children}</AuthGate>;
}
