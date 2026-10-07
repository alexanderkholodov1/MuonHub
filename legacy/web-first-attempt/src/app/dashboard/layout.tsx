"use client";

import React from "react";
import { AuthGate } from "../../components/AuthGate";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps): React.ReactElement {
  return <AuthGate mode="protected">{children}</AuthGate>;
}
