# MuonHub — Detector serial formats (canonical reference)

> **Status note (2026-10-03).** This is the format reference carried over from v5, now translated
> to English; its body is historical and keeps every original caveat. Facts checked in the
> 2026-10-02/03 audit (`docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md` §4.3), verified by reading
> the code:
> - **On the official CosmicWatch firmware the dead-time column is cumulative**, not instantaneous:
>   the official v3X order documents `Deadtime[s] (cumulative)` (§0). On the custom MuNRa firmware
>   its meaning and unit are **unverified** — check on a raw capture whether the column only
>   increases. (The example line in §2 — 46,100 at 111.75 s, event 270 — fits a cumulative count of
>   ≈ 171 µs per event; read as a per-event value it would imply ≈ 11 % dead time.) The first-attempt v6 parser
>   (`apps/agent/src/parsers/cosmicwatch.ts`) converted the raw value into an instantaneous
>   percentage, which is wrong; a live-time fraction has to come from the difference between
>   consecutive lines. The unit used by the MuNRa firmware is still unverified (⚠️ §2).
> - **Event-count semantics differ across formats.** v5 counts one event per parsed line
>   (`minuteData.eventCount++`). The first-attempt v6 parsers instead sum a per-reading count taken
>   from `trg` (CSV, key-value) or from the JSON keys `event`/`eventId`/`event_id`, so a device that
>   streams a running event id would be summed into an inflated count. A count of events and an
>   event id are different quantities.
> - **From M1 on, each Device type declares its own format** (column map, units, time source,
>   counter and dead-time semantics) instead of relying on the shared per-line heuristics of §1
>   (ADR-004). Readings from a Device feed its Stream, and the raw lines are kept unaltered. Formats
>   of new Devices are discovered with the agent's capture tool and its raw-line tee (ADR-007). The
>   heuristics below remain the reference for the CosmicWatch/MuNRa Device type.

> Extracted from v5's `public/js/serial-reader.js` (branch `v5-production`; logic proven with real
> hardware).
> It is the **reference for the agent's parser** (port proven logic, don't reinvent; the agent runtime
> is a headless daemon per [ADR-007](../decisions/adr/007-agent-runtime-headless-daemon.md)).
> ⚠️ There are **unit/column ambiguities** marked below: **verify with the physical detector** the
> next time it is available and pin the definitive mapping in `packages/shared`.

---

## v6 agent implementation status (spec 0013) — first-attempt state, replaced in M1

The TypeScript acquisition core in `apps/agent/src/parsers/` now implements the four documented
wire formats with the v5 priority order:

1. JSON lines starting with `{`.
2. CosmicWatch/MuNRa tab-or-space lines with the `COSMIC` marker or at least three leading numeric
   columns.
3. Key-value lines containing `TRG <number>`.
4. CSV lines in the documented `trg,sipm,temp,pressure,deadtime,coincident,timestamp` order.

Malformed, partial, header, or unrecognized lines are skipped with a warning and never defaulted
into a record. The v5 `COSMIC`+digit concatenation split is preserved before parsing. The normalized
raw reading carries agent time, trigger/rate value, SiPM mV, temperature C, pressure Pa, dead-time
percent, and coincidence fields as available. Per-minute aggregation converts pressure Pa to the v6
canonical hPa field and validates the resulting `MinuteRecord` with `MinuteRecordSchema`.

*(Superseded by ADR-006 rule 8: `dt` is stored as increments of the cumulative counter, `ec`/`cc`
as counts per interval with their covered live time.)* First-attempt data-integrity invariant for v6
ingestion: per-minute fields are time-averages, never sums. `sm`,
`tp`, `pr`, `dt`, `ec`, and `cc` are averaged over the minute window; `sn` and `sx` keep the
documented amplitude min/max semantics. No parsed event is filtered during aggregation. *(First-attempt
state, replaced in M1:)* the Tauri serial bridge under `apps/agent/src-tauri/` is a thin scaffold for port enumeration and line events;
full Tauri packaging and real serial acquisition are out of CI and must be verified manually with the
physical detector by checking port enumeration, live line streaming, parsed readings, local-first
minute persistence, and reconnect flush.

---

## 0. Investigation: which detector is it really? (CosmicWatch v3X-derived)

**Conclusion:** YES, it is a CosmicWatch (Dennis is right: logo on the LCD, base design). But it
runs **custom firmware** ("MuNRa"), derived from the **v3X** family, not the classic v1/v2 whose
documentation you were probably given — that is why the format did not match.

**Evidence:**
- The format carries **pressure (Pa) and a coincidence flag**, exactly what the **CosmicWatch
  v3X** added (BMP280 pressure sensor + coincidence mode). The classic v1/v2 has NO pressure: its
  output is `Comp_date Comp_time Event Ardn_time[ms] ADC[0-1023] SiPM[mV] Deadtime[ms] Temp[C]`
  (a single 10-bit ADC, no pressure).
- The pressure in the example (`76501.6 Pa ≈ 765 hPa`) **matches Quito's altitude** → the
  firmware is configured for high altitude and column [5] is pressure (confirmed). *(Note
  2026-10-03: ≈ 765 hPa matches the USFQ station in Cumbayá, ≈ 2.4 km; central Quito is ≈ 730 hPa.)*
- The trailing `COSMIC` marker and the **column order are non-standard** (custom): they differ
  from the official v3X, whose order is `Event, Timestamp[s], Flag(coinc 0/1), ADC[12b],
  SiPM[mV], Deadtime[s] (cumulative), Temp[C], Press[Pa], Accel(XYZ), Gyro(XYZ)` with **a single
  12-bit ADC**.

**What cannot be asserted without the hardware:** the meaning of columns 2 and 3
(`60`, `1881` — ADC + baseline? two readings?), the real unit of the SiPM value (`0.9` is very low
for mV) and of the dead time (`46100` — µs? cumulative in another unit?).

**Best action to close the case (when you have the detector):** capture (a) the **header line** it
prints at startup, and (b) if possible, the **firmware code** (the loaded Arduino sketch) or the
header of the microSD file. With that we pin the definitive mapping in `packages/shared`,
comparing against the official repo `spenceraxani/CosmicWatch-...-v3X`.

**Product implication:** since there is a coincidence flag, the USFQ station is probably
`type=coincidence` (better muon purity, see `THEORETICAL-FOUNDATION §7`,
[THEORETICAL-FOUNDATION.md](THEORETICAL-FOUNDATION.md)) — confirm with the header/firmware. This
**qualifies D7** ("mostly single SiPM"): there may be real coincidence.

---

## 1. The 4 formats (v5 parser priority order)

The parser first skips **headers / non-data lines**: any line that starts with a letter, or
contains `[`, `Event`, or `TimeStamp`, or is very short / has no digits, is ignored.

| # | Format | Trigger (heuristic) |
|---|--------|---------------------|
| 1 | **JSON** | the line starts with `{` |
| 2 | **MuNRa tab/space (PRIMARY)** | starts with ≥3 numbers separated by space/tab, or contains `COSMIC` |
| 3 | **Key-Value** | contains `TRG` followed by a number |
| 4 | **CSV** | contains `,` and starts with a digit |
| (fallback) | Space-separated | starts with ≥2 numbers |

**Concatenated lines:** sometimes two events arrive glued together (`...0 COSMIC488 1059953...`).
The parser splits them at the `COSMIC`+digit boundary (`split(/(?<=COSMIC)(?=\d)/)`). Port this.

---

## 2. PRIMARY MuNRa format (tab/space)

Header emitted by the detector:
```
Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C] DeadTime[us] Coincident COSMIC
```
Example:
```
270  111753  60  1881  0.9  76501.6  27.1  46100  0  COSMIC
```

Column mapping (according to `parseTabSeparatedLine`, separator = tabs or multiple spaces):

| Idx | Field | Example | Unit | Notes |
|-----|-------|---------|------|-------|
| 0 | Event ID/counter | 270 | — | |
| 1 | Internal timestamp | 111753 | ms | detector clock; **v5 uses `Date.now()` for the DB**, not this |
| 2 | ADC1 | 60 | raw | channel 1 |
| 3 | ADC2 | 1881 | raw | channel 2 (dual channel!) |
| 4 | SiPM | 0.9 | mV (⚠️) | **ambiguous**: values <1 suggest V, not mV; verify |
| 5 | Pressure | 76501.6 | Pa | (in hPa it would be ~765 → consistent with the USFQ station's altitude, ≈ 2.4 km; central Quito ≈ 730 hPa) |
| 6 | Temp | 27.1 | °C | |
| 7 | DeadTime | 46100 | µs (⚠️) | see §4 (stored as "dt" but it is in µs, not %) |
| 8 | Coincident | 0 | 0/1 | coincidence flag |
| 9 | `COSMIC` | — | — | marker, ignored |

> ⚠️ **Conflict inside the v5 code itself:** one comment describes column [4] as
> `voltage_V` and another as `SiPM[mV]`. The mapping above is the one **used by the active
> parser**. It requires at least 7 columns; if there are fewer, the line is discarded.

---

## 3. Other formats

**Key-Value** (`parseKeyValueLine`): `KEY value` pairs separated by spaces.
- `TRG`→trg · `ADC`→sipm = ADC×0.5 (assumed conversion) · `SIPM`/`MV`→sipm(mV) ·
  `TEMP`/`T`→°C · `PRES`/`P`→Pa · `DT`/`DEADTIME`→deadtime · `COIN`/`COINCIDENT`→0/1 ·
  `TIME`/`TS`→timestamp.

**CSV** (`parseCSVLine`): `trg,sipm,temp,pressure,deadtime,coincident,timestamp`.

**JSON**: the object as-is; its keys are trusted.

---

## 4. Aggregation → per-minute record (mapping to DB fields)

`aggregateData` accumulates per event; `saveMinuteData` emits the minute's record:

| DB field | v5 computation | Type |
|----------|----------------|------|
| `ec` | number of events in the minute (`eventCount`) | count/min (= rate) |
| `cc` | number of events with `coincident==1` | count/min |
| `sm` | **average** of SiPM mV | mV |
| `sn` / `sx` | minimum / maximum of SiPM | mV |
| `tp` | **average** temperature | °C |
| `pr` | **average** pressure | Pa (v5) → **hPa in v6** |
| `dt` | **average** dead time | µs (v5, ⚠️) → clarify as % or live-time in v6 |

- **Invariant respected (v5):** `sm/tp/pr/dt` are **averages**; `ec/cc` are counts per minute
  (= rate), not sums of magnitudes. No event filtering. *(v6: superseded by ADR-006 rule 8 —
  averaging a cumulative dead-time counter is meaningless; it is stored as increments.)*
- **Partial minutes** (the first and the last) are **discarded**: only complete minutes are saved.

---

## 5. Actions for v6 (agent, milestone M1)

1. **Port** the detection of the 4 formats + the split of concatenated lines (proven logic).
2. **Verify with hardware** and pin in `packages/shared`: the real unit of SiPM (mV vs V), of dead
   time (µs vs %), the meaning of ADC1/ADC2, and whether the `Coincident` flag implies
   `type=coincidence`.
3. **Reconcile v6 units:** pressure → hPa; dead time → define the canonical representation for
   the correction `R/(1−R·τ_DT)` (`THEORETICAL-FOUNDATION.md §4`).
4. **Auto-detection of version/hardware** from the header (CosmicWatch v2/v3X vs MuNRa).
5. Keep "averages, never sums" (stated precisely in ADR-006 rule 8) and **mark partial minutes as
   partial** instead of discarding them (ADR-006 rule 7).
