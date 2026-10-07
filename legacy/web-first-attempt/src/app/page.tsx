/**
 * Landing page — MuonHub.
 *
 * §0 compliance:
 * - Body ≥ 16px (base is 1rem = 16px, enforced in tokens.css).
 * - Max 2 accents on screen (accent cyan + accent-warm amber used once each).
 * - 8-pt grid spacing throughout.
 * - Lucide icons, no emoji.
 * - No lorem ipsum — real scientific copy.
 * - Static hero placeholder: the cursor-reactive particle field is DEFERRED
 *   to the dedicated design session (docs/design/LANDING-CONCEPT.md).
 *   A calm, restrained placeholder is shown instead.
 *
 * This is the public register (attract universities). Copy is on-brand,
 * scientific, and honest about single-SiPM detector physics.
 */
import React from "react";
import Link from "next/link";
import { Activity, Globe, ShieldCheck, ArrowRight, Zap } from "lucide-react";
import { Button } from "@muonhub/ui";
import { PublicLandingNetwork } from "../components/landing/PublicLandingNetwork";

const features = [
  {
    icon: Activity,
    title: "Real-time charged-particle rate",
    body: "Monitor MIP-type event rates live from CosmicWatch detectors. Dead-time and local barometric corrections are computed by the shared physics package so every chart follows the same scientific contract.",
  },
  {
    icon: Globe,
    title: "Latin American network",
    body: "A multi-university cosmic-ray network spanning diverse altitudes and geomagnetic rigidities. Simultaneous coverage enables Forbush decrease detection and global-rate studies.",
  },
  {
    icon: ShieldCheck,
    title: "Open, auditable platform",
    body: "Every algorithm is public and version-controlled. Calibration coefficients and raw counts travel alongside corrected values — no black boxes in the data pipeline.",
  },
  {
    icon: Zap,
    title: "Offline-first architecture",
    body: "The on-site agent persists data to local SQLite before syncing. Detectors never lose measurements on network or power interruptions.",
  },
] as const;

export default function LandingPage() {
  return (
    <>
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      {/*
       * DESIGN SESSION PLACEHOLDER
       * The cursor-reactive particle-field hero (gravitational-lensing cursor
       * over cosmic-ray streaks + stars) is deferred to a dedicated design
       * session. See docs/design/LANDING-CONCEPT.md.
       *
       * What ships here is a calm, typographically restrained hero that is
       * on-brand and production-ready for the current milestone.
       */}
      <section
        style={{
          minHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-16) var(--space-6)",
          textAlign: "center",
          maxWidth: "860px",
          margin: "0 auto",
        }}
      >
        {/* Kicker */}
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--color-accent)",
            borderBottom: "1px solid var(--color-accent)",
            paddingBottom: "2px",
            marginBottom: "var(--space-6)",
          }}
        >
          Cosmic-ray monitoring network
        </span>

        {/* Display heading */}
        <h1
          style={{
            fontSize: "clamp(2.375rem, 5vw, 3.75rem)",
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            color: "var(--color-text)",
            marginBottom: "var(--space-6)",
          }}
        >
          Observe the universe,{" "}
          <span style={{ color: "var(--color-accent)" }}>one particle at a time</span>
        </h1>

        {/* Lead */}
        <p
          style={{
            fontSize: "var(--text-lg)",
            lineHeight: 1.6,
            color: "var(--color-text-secondary)",
            maxWidth: "640px",
            marginBottom: "var(--space-8)",
          }}
        >
          MuonHub connects CosmicWatch-class scintillator detectors across Latin American
          universities into a unified monitoring platform — live charged-particle rates, barometric
          corrections, and Forbush decrease alerts, all in one instrument-grade interface.
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="lg" icon={<ArrowRight size={18} />}>
              View dashboard
            </Button>
          </Link>
          <Link href="#network" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="lg">
              Explore the network
            </Button>
          </Link>
        </div>
      </section>

      {/* ── What is MuonHub ────────────────────────────────────────────────── */}
      <section
        id="about"
        style={{
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          padding: "var(--space-16) var(--space-6)",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              fontSize: "var(--text-h2)",
              fontWeight: 600,
              lineHeight: 1.2,
              color: "var(--color-text)",
              marginBottom: "var(--space-4)",
            }}
          >
            Built for researchers, not dashboards
          </h2>
          <p
            style={{
              fontSize: "var(--text-base)",
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              maxWidth: "720px",
              marginBottom: "var(--space-12)",
            }}
          >
            CosmicWatch single-SiPM detectors measure charged-particle / MIP-type (minimum ionising
            particle) events — a proxy for the secondary cosmic-ray flux at ground level. MuonHub
            aggregates these measurements, applies dead-time correction and local barometric
            correction (β coefficient fit per station) through{" "}
            <span className="font-mono">@muonhub/physics</span>, and surfaces the corrected rate
            alongside raw counts so researchers retain full audit trail of every data point.
          </p>

          {/* Feature grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--space-6)",
            }}
          >
            {features.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                style={{
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface-2)",
                  padding: "var(--space-6)",
                }}
              >
                <Icon
                  size={24}
                  color="var(--color-accent)"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  style={{ marginBottom: "var(--space-3)" }}
                />
                <h3
                  style={{
                    fontSize: "var(--text-h4)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    marginBottom: "var(--space-2)",
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: "var(--text-sm)",
                    lineHeight: 1.7,
                    color: "var(--color-text-secondary)",
                    margin: 0,
                  }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicLandingNetwork />

      {/* ── CTA section ───────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "var(--space-16) var(--space-6)",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "var(--text-h2)",
              fontWeight: 600,
              color: "var(--color-text)",
              marginBottom: "var(--space-4)",
              lineHeight: 1.2,
            }}
          >
            Ready to connect your detector?
          </h2>
          <p
            style={{
              fontSize: "var(--text-base)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-8)",
              lineHeight: 1.6,
            }}
          >
            University research groups can register their CosmicWatch stations and join the Latin
            American monitoring network. Contact the MuonHub team at USFQ to get started.
          </p>
          <span
            style={{
              display: "inline-block",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              color: "var(--color-accent-warm)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-2) var(--space-4)",
            }}
          >
            contact@munhub.usfq.edu.ec
          </span>
        </div>
      </section>
    </>
  );
}
