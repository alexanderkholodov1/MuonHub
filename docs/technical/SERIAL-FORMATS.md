# MuonHub — Formatos serial del detector (referencia canónica)

> Extraído del `public/js/serial-reader.js` de la v5 (lógica probada con hardware real).
> Es la **referencia para el parser del agente Tauri** (ADR-002: portar, no reinventar).
> ⚠️ Hay **ambigüedades de unidades/columnas** marcadas abajo: **verificar con el detector
> físico** la próxima vez que esté disponible y fijar el mapeo definitivo en `packages/shared`.

---

## v6 agent implementation status (spec 0013)

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

Data-integrity invariant for v6 ingestion: per-minute fields are time-averages, never sums. `sm`,
`tp`, `pr`, `dt`, `ec`, and `cc` are averaged over the minute window; `sn` and `sx` keep the
documented amplitude min/max semantics. No parsed event is filtered during aggregation. The Tauri
serial bridge under `apps/agent/src-tauri/` is a thin scaffold for port enumeration and line events;
full Tauri packaging and real serial acquisition are out of CI and must be verified manually with the
physical detector by checking port enumeration, live line streaming, parsed readings, local-first
minute persistence, and reconnect flush.

---

## 0. Investigación: ¿qué detector es realmente? (CosmicWatch v3X-derivado)

**Conclusión:** SÍ es un CosmicWatch (Dennis tiene razón: logo en el LCD, diseño base). Pero
corre **firmware personalizado** ("MuNRa"), derivado de la familia **v3X**, no el v1/v2 clásico
cuya documentación probablemente te pasaron — por eso el formato no coincidía.

**Evidencia:**
- El formato trae **presión (Pa) y flag de coincidencia**, justo lo que añadió el **CosmicWatch
  v3X** (sensor de presión BMP280 + modo coincidencia). El v1/v2 clásico NO tiene presión: su
  salida es `Comp_date Comp_time Event Ardn_time[ms] ADC[0-1023] SiPM[mV] Deadtime[ms] Temp[C]`
  (un solo ADC de 10 bits, sin presión).
- La presión del ejemplo (`76501.6 Pa ≈ 765 hPa`) **coincide con la altitud de Quito** → el
  firmware está configurado para gran altitud y la columna [5] es presión (confirmado).
- El marcador final `COSMIC` y el **orden de columnas son no estándar** (custom): difieren del
  v3X oficial, cuyo orden es `Event, Timestamp[s], Flag(coinc 0/1), ADC[12b], SiPM[mV],
  Deadtime[s] (acumulado), Temp[C], Press[Pa], Accel(XYZ), Gyro(XYZ)` con **un solo ADC de 12
  bits**.

**Lo que NO se puede asegurar sin el hardware:** el significado de las columnas 2 y 3
(`60`, `1881` — ¿ADC + baseline?, ¿dos lecturas?), la unidad real del SiPM (`0.9` es muy bajo
para mV) y del dead time (`46100` — ¿µs?, ¿acumulado en otra unidad?).

**Mejor acción para cerrar el caso (cuando tengas el detector):** capturar (a) la **línea de
encabezado** que imprime al arrancar, y (b) si se puede, el **código del firmware** (sketch
Arduino cargado) o el encabezado del archivo de la microSD. Con eso fijamos el mapeo definitivo
en `packages/shared`, comparando contra el repo oficial `spenceraxani/CosmicWatch-...-v3X`.

**Implicación de producto:** como hay flag de coincidencia, la estación USFQ probablemente es
`type=coincidence` (mejor pureza de muones, ver `THEORETICAL-FOUNDATION §7`) — confirmar con el
encabezado/firmware. Esto **matiza D7** ("mayormente single SiPM"): puede haber coincidencia real.

---

## 1. Los 4 formatos (orden de prioridad del parser v5)

El parser salta primero **encabezados / líneas no-dato**: cualquier línea que empiece con letra,
o contenga `[`, `Event` o `TimeStamp`, o sea muy corta / sin dígitos, se ignora.

| # | Formato | Disparador (heurística) |
|---|---------|--------------------------|
| 1 | **JSON** | la línea empieza con `{` |
| 2 | **MuNRa tab/space (PRIMARIO)** | empieza con ≥3 números separados por espacio/tab, o contiene `COSMIC` |
| 3 | **Key-Value** | contiene `TRG` seguido de número |
| 4 | **CSV** | contiene `,` y empieza con dígito |
| (fallback) | Espacio-separado | empieza con ≥2 números |

**Líneas concatenadas:** a veces llegan dos eventos pegados (`...0 COSMIC488 1059953...`).
El parser los separa en el límite `COSMIC`+dígito (`split(/(?<=COSMIC)(?=\d)/)`). Portar esto.

---

## 2. Formato PRIMARIO MuNRa (tab/espacio)

Encabezado que emite el detector:
```
Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C] DeadTime[us] Coincident COSMIC
```
Ejemplo:
```
270  111753  60  1881  0.9  76501.6  27.1  46100  0  COSMIC
```

Mapeo de columnas (según `parseTabSeparatedLine`, separador = tabs o múltiples espacios):

| Idx | Campo | Ejemplo | Unidad | Notas |
|-----|-------|---------|--------|-------|
| 0 | Event ID/contador | 270 | — | |
| 1 | Timestamp interno | 111753 | ms | reloj del detector; **v5 usa `Date.now()` para la DB**, no este |
| 2 | ADC1 | 60 | crudo | canal 1 |
| 3 | ADC2 | 1881 | crudo | canal 2 (¡doble canal!) |
| 4 | SiPM | 0.9 | mV (⚠️) | **ambiguo**: valores <1 sugieren V, no mV; verificar |
| 5 | Pressure | 76501.6 | Pa | (en hPa serían ~765 → coherente con altitud de Quito) |
| 6 | Temp | 27.1 | °C | |
| 7 | DeadTime | 46100 | µs (⚠️) | ver §4 (se guarda como "dt" pero está en µs, no %) |
| 8 | Coincident | 0 | 0/1 | flag de coincidencia |
| 9 | `COSMIC` | — | — | marcador, se ignora |

> ⚠️ **Conflicto en el propio código v5:** un comentario describe la columna [4] como
> `voltage_V` y otro como `SiPM[mV]`. El mapeo de arriba es el que **usa el parser activo**.
> Requiere mínimo 7 columnas; si hay menos, descarta la línea.

---

## 3. Otros formatos

**Key-Value** (`parseKeyValueLine`): pares `CLAVE valor` separados por espacios.
- `TRG`→trg · `ADC`→sipm = ADC×0.5 (conversión asumida) · `SIPM`/`MV`→sipm(mV) ·
  `TEMP`/`T`→°C · `PRES`/`P`→Pa · `DT`/`DEADTIME`→deadtime · `COIN`/`COINCIDENT`→0/1 ·
  `TIME`/`TS`→timestamp.

**CSV** (`parseCSVLine`): `trg,sipm,temp,pressure,deadtime,coincident,timestamp`.

**JSON**: objeto tal cual; se confía en sus claves.

---

## 4. Agregación → registro por minuto (mapeo a campos de la DB)

`aggregateData` acumula por evento; `saveMinuteData` emite el registro del minuto:

| Campo DB | Cálculo v5 | Tipo |
|----------|-----------|------|
| `ec` | nº de eventos en el minuto (`eventCount`) | conteo/min (= tasa) |
| `cc` | nº de eventos con `coincident==1` | conteo/min |
| `sm` | **promedio** de SiPM mV | mV |
| `sn` / `sx` | mínimo / máximo de SiPM | mV |
| `tp` | **promedio** de temperatura | °C |
| `pr` | **promedio** de presión | Pa (v5) → **hPa en v6** |
| `dt` | **promedio** de dead time | µs (v5, ⚠️) → aclarar a % o live-time en v6 |

- **Invariante respetado:** `sm/tp/pr/dt` son **promedios**; `ec/cc` son conteos por minuto
  (= tasa), no sumas de magnitudes. Sin filtrado de eventos.
- **Minutos parciales** (el primero y el último) se **descartan**: solo se guardan minutos completos.

---

## 5. Acciones para v6 (agente Tauri — spec S12)

1. **Portar** la detección de los 4 formatos + el split de líneas concatenadas (lógica probada).
2. **Verificar con hardware** y fijar en `packages/shared`: unidad real de SiPM (mV vs V), de
   dead time (µs vs %), significado de ADC1/ADC2, y si el flag `Coincident` implica `type=coincidence`.
3. **Reconciliar unidades v6:** presión → hPa; dead time → definir representación canónica para
   la corrección `R/(1−R·τ_DT)` (`THEORETICAL-FOUNDATION.md §4`).
4. **Auto-detección de versión/hardware** desde el encabezado (CosmicWatch v2/v3X vs MuNRa).
5. Mantener "promedios nunca sumas" y el descarte de minutos parciales.
