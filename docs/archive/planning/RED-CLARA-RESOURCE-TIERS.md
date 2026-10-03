# MunHub Lab v6.0 — Resource Tiers to Request from Red Clara

> Depends on: `00`–`07`. Input for the **infrastructure request** to Red Clara.
> Scope: the server hosts **web + DB + AI + backups** (maintainer decision).
> Sizing philosophy: **edge processing** (detector PCs perform aggregation/transformation)
> ⇒ the server carries less load than typical. **Generous margin** for additional scientific
> experimentation ("enough + a little more").

---

## 1. Load assumptions

- **Today:** 1 detector (USFQ). **Interest:** ~8 universities (unconfirmed). Designed to
  scale to **dozens** of detectors stably.
- **Data volume (core):** 1 record/minute per detector = 1,440/day.
  - 50 detectors ≈ 26 M rows/year; 200 detectors ≈ 105 M rows/year.
  - With TimescaleDB (hypertables + ~10× compression): **~1–8 GB/year** of time series.
    This is small. Storage is dominated by **backups, AI models, and experimental datasets**,
    not the series itself.
- **Compute load:** the web (Next.js SSR) and Postgres are modest; the real peak is
  **batch ML jobs**. Heavy ingestion is done at the edge (agent), not on the server.

---

## 2. Tier comparison

| Resource | 🟢 Conservative | 🔵 Recommended | 🟣 Ambitious |
|---|---|---|---|
| **Scenario** | MVP / few universities | Regional network + margin | Broad network + DL experimentation |
| **vCPU** | 4 | 8 | 16 |
| **RAM** | 8 GB | 32 GB | 64 GB |
| **Disk (NVMe/SSD)** | 100 GB | 500 GB | 1 TB |
| **GPU** | — | — | 1× GPU (e.g. NVIDIA T4/A10/RTX, ≥16 GB VRAM) |
| **Comfortable detectors** | ~10–15 | ~50–80 (+margin) | 150+ |
| **Database** | Postgres+TimescaleDB | + continuous aggregates | + **replica** (high availability) |
| **Cold backups** | to Cloudflare R2 (external) | R2 + disk snapshots | R2 + snapshots + replica |
| **AI** | Classical ML (CPU) | Classical ML with headroom | Classical ML + **deep learning** (GPU) |
| **Network** | Public IP, ~50 Mbps | Public IP, ~100 Mbps | Public IP, ~200+ Mbps |
| **Uptime target** | best-effort | high | high + redundancy |

> All time-series figures fit comfortably even in the conservative tier; the jump between
> tiers is mainly about **compute/AI margin, availability, and experimentation**, not
> lack of space for detector data.

---

## 3. What each tier enables

- **🟢 Conservative** — Operate v6.0 with the current network and a few universities. Basic
  classical ML (baselines, barometric correction, anomalies). Backups to R2. No DB redundancy.
  Sufficient to **launch and demonstrate**.
- **🔵 Recommended** *(suggested baseline choice)* — Regional network (dozens of detectors)
  with headroom. Full classical ML (forecasting, Forbush, correlations) running comfortably.
  Continuous aggregates for fast charts over long ranges. Margin for datasets and tests.
  **Cost/capacity balance for a serious deployment.**
- **🟣 Ambitious** — Broad network + **additional scientific experimentation**: deep learning
  with GPU, DB replica for high availability, more space for datasets/parallel experiments.
  Request this tier if Red Clara can provide it, because it **gives the "a little more" for
  research without requiring subsequent expansion requests**.

---

## 4. Software / platform (identical across all tiers)

- OS: Linux LTS (Ubuntu Server LTS or equivalent).
- Containers: Docker + Docker Compose (all configuration in `infra/`).
- DB: PostgreSQL (16+) + **TimescaleDB** extension.
- App: Node.js (Next.js) + services; Python for `services/ai`.
- Object storage for backups: Cloudflare R2 (external) or S3-compatible bucket.
- Access: public IP + domain + TLS (Let's Encrypt); ports 80/443 (+ 22 SSH restricted).
- Disk/VM snapshots if the platform provides them (reinforces the backup layer).

---

## 5. Recommendation for the request

Request the **🔵 Recommended as the baseline** and, if Red Clara has availability, **also
request the 🟣 Ambitious** by arguing the scientific value of the equatorial node (unique
cutoff rigidity, scarce data in the Southern Hemisphere) and the need for margin for
**AI/DL experiments** and multi-university network growth. The 🟢 Conservative is the
acceptable minimum to avoid blocking the launch.

> **Pending action for ML engineer:** refine AI compute/storage figures once the actual
> detector volume and DL experiment scope are confirmed.
