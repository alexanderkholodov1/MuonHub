# MunHub Lab v6.0 — Backlog (Épicas → Specs → Tareas)

> Depende de: `00`–`03`. Backlog priorizado para la "manada" de agentes.
> Cada Spec se materializa en `/specs/NNNN-slug/spec.md` (plantilla en `03-AGENTS-AND-SDD.md`).
> `[agente]` = rol responsable (ver roster). `Fase` = F1–F8 del plan maestro.
> Marcado: ☐ pendiente · ◐ en curso · ☑ hecho. Todo arranca en ☐.

---

## Orden recomendado (ruta crítica)
`EPIC-0 → EPIC-1 → EPIC-2 → EPIC-3 → EPIC-4/5 (paralelo) → EPIC-6 → EPIC-7 → EPIC-8 → EPIC-9 (transversal) → EPIC-11 → EPIC-10 → EPIC-12 (continuo)`

---

## EPIC-0 — Cimientos de repo y tooling  (Fase F1)  [arquitecto]
**Objetivo:** monorepo operativo y CI base.

- **0001 — Scaffold monorepo** (pnpm + Turborepo)
  - T: estructura `apps/`, `services/`, `packages/`, `specs/`, `docs/`, `infra/`, `.github/`.
  - T: TS estricto, ESLint, Prettier, Vitest base; LICENSE (MIT); `.gitignore` (incluye `private/`, `.env`).
  - CA: `pnpm install && pnpm build && pnpm test` corre verde en todos los paquetes.
  - CA: `private/` y `.env` ignorados; existe `.env.example`.
- **0002 — CI/CD GitHub Actions**
  - T: workflow lint+typecheck+test en PR; deploy a Firebase Hosting/Vercel en merge.
  - CA: PR de prueba ejecuta los 3 checks; merge despliega.

## EPIC-1 — Shared schema + física  (F1)  [arquitecto + físico]
- **0003 — `packages/shared`**: tipos (User, Institution, Detector, MinuteRecord…), esquemas
  `zod`, constantes (campos canónicos, unidades), claves i18n.
  - CA: validación rechaza registros que violen invariantes (sumas, campos faltantes).
  - CA: reconciliación de campos v5 (`d`→`dt`, presión hPa) centralizada aquí.
- **0005 — `packages/physics`**: **corrección de tiempo muerto** (`R/(1−R·τ_DT)`),
  **corrección barométrica con β LOCAL por regresión**, espectro de amplitud (Landau/MPV),
  flujo, rangos "normales" y estadística de Poisson (√N, ventanas de horas, 3σ).
  - CA: tests contra valores de referencia de `docs/research/THEORETICAL-FOUNDATION.md`
    (MIP ~2 MeV, β en rango documentado, corrección de dead-time).
  - Reporte teórico ✅ disponible (`docs/research/THEORETICAL-FOUNDATION.md`).

## EPIC-2 — Capa de datos + migración  (F1)  [dev backend/datos]
- **0004 — Interfaz `DataProvider`** (`packages/data-provider/types.ts`).
  - CA: interfaz cubre lectura/escritura/realtime/CRUD/export/import (ver `01-ARCH §3`).
- **0006 — `FirebaseProvider`** sobre munhub-1; listeners incrementales (no `once('value')`).
  - CA: lee/escribe detectores, minutes, realtime; respeta reglas; sin re-descarga masiva.
- **0007 — Migración v5→v6** (dump → transform → `importAll`).
  - Fuente: **dump frío de ~1GB** `private/munra-1_realtime_database_backup/*_data.json.gz`
    (munra-1 deshabilitada). **Parsear en streaming** (no cargar 1GB en memoria).
  - CA: idempotente, reanudable; reporte de migrados/cuarentena/sin-metadatos.
  - CA: `profiles→Estación` **+ crear un Detector** (con device_token y calibración por defecto);
    `organizations→Institución`; `sharedWith→station_shares`; `d→dt`, presión a hPa.
- **0008 — Config munhub-1**: reemplazar claves Firebase, reglas v6, índices.
  - CA: reglas deny-by-default; detectores public/unlisted legibles; tests de reglas.

## EPIC-3 — Auth y multi-tenant  (F1)  [dev backend + seguridad]
- **0009 — Auth** (Firebase Auth tras `DataProvider`): registro/login, idioma preferido.
- **0010 — Roles, tenancy y permisos** (ver `11`): roles `admin|institution_admin|user|guest`;
  **3 visibilidades** (pública/institución/privada); **permisos por estación** owner/editor/viewer
  (`editor` puede escribir datos); `username` único + compartición por email/username.
  - CA: un usuario solo ve/edita lo permitido; institution_admin gestiona su institución; tests
    negativos por combinación rol×permiso×visibilidad.
- **0011 — Crear Estación + onboarding de metadatos + notificación no intrusiva** (compat).
  - CA: alta nueva exige metadatos de **estación** (§3) con **visibilidad obligatoria sin
    default** (D22); estaciones v5 sin metadatos muestran aviso no bloqueante.
- **0012 — Gestión de Detectores (dispositivo) bajo una Estación** [dev backend + frontend]
  - T: registrar Detector(es) con hardware/firmware/hw_version/sipm_count; **device_token**
    autogenerado (no bloquea registro); ajustes avanzados (calibración + reset a defaults).
  - CA: una estación puede tener ≥1 detector; **aviso de consistencia** si llega un
    `device_token` distinto al registrado (recomendar nueva estación/detector).
  - CA: defaults de calibración por `hw_version`; edición avanzada opcional visible en ajustes.

## EPIC-4 — Agente local Tauri  (F2)  [dev agente-local]
- **0013 — Lectura serial multiplataforma**: portar 4 formatos (CosmicWatch/JSON/KV/CSV).
  - CA: detecta los 4 formatos igual que v5 (tests con muestras reales).
- **0014 — Respaldo local SQLite** (capa 1 de redundancia).
  - CA: cada registro se persiste local ANTES de intentar subir.
- **0015 — Cola de sync offline + idempotencia**.
  - CA: sin red, sigue grabando; al reconectar sube lo adelantado sin duplicar (clave
    `(detector, ts)`); reconciliación local↔nube.
- **0016 — Empaquetado/instaladores** (Windows/macOS/Linux), sin scripts manuales de Python.
  - CA: instalador de 1 clic por SO; detecta puerto serial y conecta.
- **0017 — Web Serial (modo DEMO opcional, secundario al Agente)**: atajo sin instalar
  (Chromium) para pruebas rápidas, con **aviso claro** de que no guarda datos sin conexión / con
  la pestaña cerrada; para monitoreo continuo se usa el Agente (camino estándar, EPIC-4).
  - CA: conectar/leer en Chromium y persistir vía `DataProvider`; mostrar el aviso de limitación.

## EPIC-5 — Dashboards y visualización  (F2)  [dev frontend + físico]
- **0018 — Dashboard de estación** (rediseño): grilla de charts configurable; agrega los
  detectores de la estación (en `single` = su único detector, transparente).
- **0019 — Muchos más gráficos/estadísticas**: serie temporal multi-variable, **espectro de
  amplitud (energía depositada)**, histograma de tasa, tasa corregida por presión,
  variación diurna, box/stat summary, rolling stats.
  - CA: escala log y barras de error donde aplique (Plotly).
  - **Charts primarios = relevantes para las partículas** (tasa corregida, espectro, presión).
    El **dead time NO es chart principal** (es salud/fiabilidad del detector, no informa sobre
    las partículas): va como métrica **secundaria/seleccionable**, no ocupando 1/4 de pantalla
    como en v5. Mostrar salud del detector en un panel aparte/compacto.
- **0020 — Comparación y contraste**: comparar varios detectores/sesiones/rangos; overlay y
  diferencia; correlación tasa↔presión.
  - CA: seleccionar ≥2 series y compararlas en un mismo eje temporal.
- **0021 — Etiquetado honesto de partículas** (D9 fase 1): métrica principal = **"Tasa
  integral de partículas cargadas / tipo-MIP"** (NO "muones") en `single`; dominancia muónica
  solo agregada y dependiente de altitud; "muones" con rigor solo en `coincidence`. Tooltips
  con textos de `THEORETICAL-FOUNDATION.md`.
  - CA: ningún evento individual se etiqueta "muón" en detectores `single`; lenguaje aprobado
    por el agente físico.
- **0022 — Export multi-formato** (CSV/JSON/imagen) — portar/expandir de v5.
- **0023 — i18n (es/en/pt-BR)**, tema claro/oscuro, accesibilidad.

## EPIC-6 — Landing pública  (F3)  [dev frontend + documentación]
- **0024 — Mapa de detectores** (MapLibre): **agregación por ciudad** (D20) con burbujas
  escaladas/numeradas según cuántos detectores hay; muestra **cuántos activos ahora**.
  Propósito demostrativo (alcance/recepción), visualmente atractivo aun con 1 detector.
  - CA: burbuja por ciudad cuyo tamaño/número refleja el conteo; estado activo/inactivo; NO
    expone ubicación exacta (solo ciudad).
- **0025 — Demo en vivo** de un detector público (chart en tiempo real).
- **0026 — Secciones educativas**: qué son rayos cósmicos/muones, cómo funciona, por qué
  Ecuador, cómo unirse; botones de info; acceso a documentación; CTA registro.
  - CA: contenido revisado por físico + documentación; comprensible para no expertos.

## EPIC-7 — APIs externas y correlación  (F4)  [dev backend + físico]
- **0027 — Ingesta NMDB** (monitores de neutrones; Forbush) → `external_events` (ver `07`).
- **0028 — Ingesta NOAA SWPC** (viento solar, Kp, fulguraciones).
- **0029 — Ingesta NASA DONKI** (CME/flares) + **Dst/Kp** (Kyoto/GOES).
- **0030 — Vistas de correlación**: overlay de eventos externos sobre nuestras series;
  detección visual de Forbush; comparación muones↔neutrones.
  - CA: marcar un evento externo y verlo alineado temporalmente sobre el chart del detector.

## EPIC-8 — Consola de administrador  (F5)  [dev backend + dev frontend + seguridad]
- **0031 — Página de admin dedicada** (separada del dashboard normal).
- **0032 — Gestión de bases de datos**: ver stats, cambiar URL/proveedor en runtime.
- **0033 — Herramienta de migración** entre proveedores (usa `exportAll`/`importAll`).
  - CA: migrar de un provider a otro con reporte y validación; reanudable.
- **0034 — Importar DB externa desde archivo** (adaptador → esquema v6).
  - CA: subir archivo, mapear, validar `zod`, cargar; filas inválidas en cuarentena.
- **0035 — Gestión de usuarios/roles/instituciones** (asignar roles, mover detectores).

## EPIC-9 — Redundancia y seguridad  (transversal, foco F5)  [ing. DB + seguridad]
- **0036 — Respaldos fríos a Cloudflare R2** (dumps comprimidos + checksum + rotación).
  - CA: job programado genera dump restaurable; verificación de checksum.
- **0037 — Restauración** desde respaldo frío (`importAll`).
- **0038 — Auditoría de seguridad**: reglas/RLS deny-by-default, secretos fuera del repo,
  revisión de permisos.
- **0039 — Verificación de integridad** periódica (detectar gaps/corrupción).

## EPIC-10 — IA propia  (diseño F0, build F7)  [ing. ML + físico]
- **0044 — `06-AI-DESIGN.md`** (diseño completo; solo planificación ahora).
- **0045 — Pipeline ML** (F7): anomalías, forecasting, detección de Forbush, modelado
  barométrico, insights/"valores normales", self-heal/retraining.
- **0046 — Contrato `ai_insights`** + UI para mostrar insights/explicaciones/predicciones.

## EPIC-11 — Migración a servidor propio  (F6)  [ing. DB + arquitecto]
- **0040 — `SupabaseProvider`** (misma interfaz `DataProvider`).
- **0041 — Esquema Postgres + TimescaleDB** (hypertables, continuous aggregates, retención).
- **0042 — RLS** equivalente a reglas Fase A.
- **0043 — Despliegue Docker en Red Clara** (`infra/`); switch del provider; migración de datos.
  - CA: la app funciona idéntica sobre Supabase; datos migrados verificados.

## EPIC-12 — Documentación y paper  (al FINAL, tras construir v6; foco F8)  [documentación + físico]
> **Idioma (D29):** la documentación técnica y el manual de usuario se escriben **primero en
> inglés** y luego se **traducen** a los idiomas de la plataforma (es, pt-BR).
> **Flujo de entrega:** se produce en **.md** → **Alexander lee y edita** → solo con su
> **aprobación final** se exporta a **PDF** (u otro formato) para el usuario. No generar PDF antes.
- **0047 — Manual de usuario + FAQ** (universidades y público; cómo unir un detector). EN→es/pt.
- **0048 — Documentación técnica**: arquitectura, esquema, despliegue (Firebase y Red Clara). EN→es/pt.
- **0049 — Base del artículo científico** (estructura + fundamento teórico; baja prioridad).
- **0050 — Artefactos académicos/comunidad** (ver `17`): `CITATION.cff`, `AUTHORS.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, versionado semántico + `CHANGELOG.md`, y preparar
  **Zenodo↔GitHub** para DOI de releases. (ORCID/IP = acciones humanas de Alexander.)
- **0051 — `RED-CLARA-RESOURCE-TIERS.md`** (3 tiers; tras cerrar IA/arquitectura).

---

## EPIC-13 — Soporte, notificaciones y email  (F5; notif. in-app desde F2)  [frontend + backend]
- **0052 — Centro de notificaciones** (in-app): detector caído, gaps, anomalías, invitaciones,
  recordatorio de metadatos, cambios de permiso; preferencias por tipo/canal.
- **0053 — Email transaccional** (proveedor free billing-proof; plantillas i18n; SPF/DKIM).
- **0054 — Sistema de tickets** (categorías, metadatos automáticos, hilo, estados) + bandeja admin.
- **0055 — FAQ pública** + (opcional) votación de sugerencias.

## EPIC-14 — Redes de estaciones  (F4/F5)  [frontend + backend + físico]
- **0056 — CRUD de redes + vincular estaciones** (al crear/editar estación o desde panel).
- **0057 — Vista comparativa multi-estación** (overlay, agregados, mapa de red).
- **0058 — Detección de eventos simultáneos en la red** (Forbush en N estaciones = alta confianza;
  criterio validado por el agente físico).

## EPIC-15 — Consola de administración ampliada  (F5)  [backend + frontend + seguridad]
- **0059 — Página admin dedicada** + gestión usuarios/roles/instituciones (crear en nombre de terceros).
- **0060 — Gestión de estaciones/detectores + ciclo de vida de institución** (reasignar dueño,
  permisos, mover de institución; **eliminar/transferir una institución** y reubicar sus
  estaciones y usuarios de forma segura, con respaldo y confirmación destructiva).
- **0061 — Confirmaciones destructivas estilo GitHub** + soft-delete + respaldo previo.
- **0062 — Audit log** (append-only, consultable/exportable).
- **0063 — Anuncios/broadcast + feature flags + ver-como-usuario** (registrado en audit).
- **0064 — Onboarding wizard** (institución→estación→detector→agente; ejecutable en nombre de otro).

## EPIC-16 — Cuenta y plataforma  (F1 base; resto F5+)  [backend + frontend]
- **0065 — Ciclo de vida de cuenta**: verificación de email, reset de contraseña, **borrado de
  cuenta/datos** (GDPR-like), inactividad. `username` único + `directory_opt_in`.
- **0066 — Consentimiento ML** (opt-out por estación + default de usuario; mensaje honesto). Lo
  respeta el pipeline de IA (0045).
- **0067 — Entitlements + metering** (esquema `plans/entitlements/usage_events`; todos en "Open";
  **sin pasarela de pago** — D26). Ver `13`.
- **0068 — API pública de solo-lectura** (datos públicos, con cuota; base para extras futuros).
- **0069 — Citación de datasets** (identificador estable estilo DOI) + Status page.
- **0070 — Importar datos históricos + respaldo ZIP** (preservar de v5): subir CSV/archivo de
  datos pasados a una estación con **deduplicación** (clave `(detector,ts)`); backup/restore ZIP
  (portar `upload-manager.js`/`session-manager.js` de v5). Evita regresión de funcionalidad.
- **0071 — Modo totalmente local del agente** (offline-first): ver/grabar datos localmente sin
  nube (internet caído o sin cuenta aún); sincroniza al reconectar. Refuerza la promesa offline.
- **0072 — Calidad de datos, robustez y concurrencia**: distinguir **gap por detector apagado**
  vs **reporte de cero**; cotas de cordura para timestamps (marcar/rechazar duplicados o
  futuros); **reconciliación de escritores concurrentes** (varios agentes/editores en la misma
  estación → orden por ts, resolución de conflictos); **health score** del detector (fiabilidad).
- **0073 — Localización y difusión**: unidades/locale por idioma (hPa/°C, separador decimal);
  **consentimiento de Términos versionado**; **enlace/embed público** de un chart para difusión
  (outreach). Todo i18n (es/en/pt-BR), con inglés como *source locale* (D28).

## Dependencias clave
- EPIC-1/2/3 son prerrequisito de casi todo.
- EPIC-5 depende de 0003/0005/0006; EPIC-6 depende de EPIC-5; EPIC-7 de EPIC-2.
- EPIC-11 puede hacerse cuando llegue Red Clara, sin reescribir la app (gracias a 0004).
- EPIC-10 build solo tras EPIC-11 (servidor) + datos suficientes.

---

## Spec number mapping (legacy S-numbers → canonical `specs/NNNN-*`)

Spec numbering is unified to the `specs/NNNN-*` folder canon: 0001–0004 match the existing spec
folders, 0005 is the physics spec in flight, and the remaining backlog items are numbered
sequentially in critical-path order (EPIC-0 → 1 → 2 → 3 → 4/5 → 6 → 7 → 8 → 9 → 11 → 10 → 12,
then EPIC-13–16). Legacy S-numbers are retired; they appear only in this table.

| Old | New | Item |
|---|---|---|
| S01 | 0001 | Monorepo scaffold (`specs/0001-monorepo-scaffold`) |
| S02 | 0002 | CI/CD GitHub Actions (`specs/0002-ci-cd`) |
| S03 | 0003 | `packages/shared` (`specs/0003-shared-contracts`) |
| S05 | 0004 | `DataProvider` interface (`specs/0004-data-provider-interface`) |
| S04 | 0005 | `packages/physics` |
| S06 | 0006 | `FirebaseProvider` |
| S07 | 0007 | v5→v6 migration |
| S08 | 0008 | munhub-1 config |
| S09 | 0009 | Auth |
| S10 | 0010 | Roles, tenancy and permissions |
| S11 | 0011 | Station creation + metadata onboarding |
| S50 | 0012 | Detector management under a Station |
| S12 | 0013 | Multiplatform serial reading |
| S13 | 0014 | Local SQLite backup |
| S14 | 0015 | Offline sync queue + idempotency |
| S15 | 0016 | Packaging/installers |
| S16 | 0017 | Web Serial (DEMO mode) |
| S17 | 0018 | Station dashboard |
| S18 | 0019 | More charts/statistics |
| S19 | 0020 | Comparison and contrast |
| S20 | 0021 | Honest particle labeling |
| S21 | 0022 | Multi-format export |
| S22 | 0023 | i18n, theming, accessibility |
| S23 | 0024 | Detector map |
| S24 | 0025 | Live demo |
| S25 | 0026 | Educational sections |
| S26 | 0027 | NMDB ingestion |
| S27 | 0028 | NOAA SWPC ingestion |
| S28 | 0029 | NASA DONKI + Dst/Kp ingestion |
| S29 | 0030 | Correlation views |
| S30 | 0031 | Dedicated admin page |
| S31 | 0032 | Database management |
| S32 | 0033 | Provider migration tool |
| S33 | 0034 | External DB file import |
| S34 | 0035 | User/role/institution management |
| S35 | 0036 | Cold backups to Cloudflare R2 |
| S36 | 0037 | Restore from cold backup |
| S37 | 0038 | Security audit |
| S38 | 0039 | Periodic integrity verification |
| S42 | 0040 | `SupabaseProvider` |
| S43 | 0041 | Postgres + TimescaleDB schema |
| S44 | 0042 | RLS |
| S45 | 0043 | Docker deployment on Red Clara |
| S39 | 0044 | `06-AI-DESIGN.md` |
| S40 | 0045 | ML pipeline |
| S41 | 0046 | `ai_insights` contract + UI |
| S46 | 0047 | User manual + FAQ |
| S47 | 0048 | Technical documentation |
| S48 | 0049 | Scientific article base |
| S73 | 0050 | Academic/community artifacts |
| S49 | 0051 | `RED-CLARA-RESOURCE-TIERS.md` |
| S51 | 0052 | Notification center |
| S52 | 0053 | Transactional email |
| S53 | 0054 | Ticket system |
| S54 | 0055 | Public FAQ |
| S55 | 0056 | Network CRUD + station linking |
| S56 | 0057 | Multi-station comparative view |
| S57 | 0058 | Simultaneous network event detection |
| S58 | 0059 | Extended admin page |
| S59 | 0060 | Station/detector + institution lifecycle management |
| S60 | 0061 | Destructive confirmations |
| S61 | 0062 | Audit log |
| S62 | 0063 | Announcements + feature flags + view-as-user |
| S63 | 0064 | Onboarding wizard |
| S64 | 0065 | Account lifecycle |
| S65 | 0066 | ML consent |
| S66 | 0067 | Entitlements + metering |
| S67 | 0068 | Public read-only API |
| S68 | 0069 | Dataset citation + status page |
| S69 | 0070 | Historical data import + ZIP backup |
| S70 | 0071 | Fully local agent mode |
| S71 | 0072 | Data quality, robustness and concurrency |
| S72 | 0073 | Localization and outreach |
