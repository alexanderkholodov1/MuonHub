/**
 * Spanish UI strings (decision D17: English source, Spanish and Brazilian Portuguese translations).
 * The public pages are translated first; any key missing here falls back to English.
 */
import type { MessageKey } from "./en";

export const es: Partial<Record<MessageKey, string>> = {
  "app.tagline": "Ciencia abierta para detectores de rayos cósmicos",
  "nav.signIn": "Iniciar sesión",
  "nav.signUp": "Crear cuenta",
  "nav.signOut": "Cerrar sesión",
  "nav.myStations": "Mis estaciones",
  "nav.account": "Cuenta",
  "nav.skipToContent": "Saltar al contenido",
  "nav.home": "Inicio",
  "nav.live": "Datos en vivo",
  "nav.detectors": "Detectores",
  "nav.main": "Principal",
  "nav.footer": "Páginas del sitio",
  "nav.network": "Red",
  "nav.otherLanguage": "English",
  "nav.otherLanguageLabel": "View this page in English",
  "notFound.title": "Página no encontrada",
  "notFound.body": "La dirección no corresponde a ninguna página de MuonHub.",
  "notFound.back": "Ir a la página de inicio",
  "state.loading": "Cargando…",
  "state.retry": "Reintentar",
  "network.title": "Red",
  "network.intro":
    "Cada estación pública de MuonHub y si está enviando datos ahora. Cada dueño elige con qué precisión se muestra la ubicación; las estaciones sin punto público se listan, pero no aparecen en el mapa.",
  "network.stats.stations": "Estaciones públicas",
  "network.stats.sending": "Enviando datos ahora",
  "network.watchLive": "Verla en vivo",
  "network.bridgeNote":
    "Leído del perfil público v5 del detector hasta que el nuevo agente de MuonHub funcione en el laboratorio.",
  "network.join":
    "¿Tienes un detector? Crea una cuenta para registrar tu estación y elegir qué compartir.",
  "network.mapNote":
    "Los círculos marcan ubicaciones aproximadas (unos 11 km); los puntos, exactas, cuando el dueño así lo eligió.",
  "network.mapLabel": "Mapa de estaciones públicas",
  "network.listTitle": "Estaciones públicas",
  "network.active": "Tiene un dispositivo activo",
  "network.idle": "Sin dispositivo activo",
  "network.devices": "Dispositivos: {count}",
  "network.approximate": "Ubicación aproximada (unos 11 km)",
  "network.hidden": "Ubicación oculta",
  "network.notOnMap": "Fuera del mapa por decisión del dueño",
  "network.hero.title": "Todos los detectores, en un planeta",
  "network.hero.lead":
    "Los detectores de munhub-lab hoy, y cada estación registrada en MuonHub a medida que la red crece. Arrastra el planeta para girarlo.",
  "network.stations.title": "Estaciones registradas en MuonHub",
  "network.stations.intro":
    "Estaciones que sus dueños hicieron públicas, con la precisión que cada uno eligió; el detector del laboratorio LEOPARD aparece mientras se instala el nuevo agente.",
  "landing.status.connecting": "Conectando con el detector…",
  "landing.status.live": "En vivo desde {place}",
  "landing.status.quiet": "El detector no ha enviado nada desde las {time} (hora de Quito)",
  "landing.status.quietNever": "El detector no ha enviado nada en los últimos minutos",
  "landing.status.unavailable": "No se pueden obtener los datos en vivo en este momento",
  "landing.hero.title": "Rayos cósmicos, contados en vivo.",
  "landing.hero.titleStart": "Rayos cósmicos,",
  "landing.hero.titleEnd": "contados en vivo.",
  "landing.hero.lead":
    "MuonHub es una red abierta de detectores de rayos cósmicos. Cada partícula que ves caer sobre Quito es real: la contó hace segundos el detector de la USFQ.",
  "landing.hero.cta.lastHour": "Ver los datos en vivo",
  "landing.hero.cta.detectors": "Todos los detectores",
  "landing.live.count": "partículas en lo que va del minuto de las {time} (Quito)",
  "landing.live.countWaiting": "esperando las primeras partículas…",
  "landing.live.lastMinute": "Último minuto",
  "landing.live.sipm": "SiPM promedio",
  "landing.live.temperature": "Temperatura",
  "landing.live.pressure": "Presión",
  "landing.live.source":
    "Desde munhub-lab · LEOPARD-TEST · último minuto hasta las {time} · conteos sin corregir",
  "landing.globe.label": "USFQ · Quito, Ecuador",
  "landing.globe.sublabel": "{count} detectores · {live} enviando ahora",
  "landing.globe.caption":
    "Arrastra para girar el planeta. Cada partícula es una detección real, repetida segundos después; su dirección es ilustrativa.",
  "landing.hour.eyebrow": "Datos en vivo",
  "landing.stream.title": "Cada partícula de {name}, en el momento en que llega",
  "landing.panel.eyebrow": "Detectores reales",
  "landing.panel.title": "Como los muestra munhub-lab",
  "landing.panel.intro":
    "Elige un detector. Cada número y cada gráfica salen de lo que ese detector registró en munhub-lab; nada es simulado.",
  "landing.panel.choose": "Detector",
  "landing.panel.open": "Abrir en munhub-lab",
  "landing.panel.recordedDay": "Su último día registrado, hasta el {date}",
  "landing.panel.loading": "Cargando los datos de este detector desde munhub-lab…",
  "landing.panel.noData": "munhub-lab no tiene minutos registrados para este detector.",
  "landing.panel.events": "Eventos/min",
  "landing.panel.sipmAvg": "SiPM prom.",
  "landing.panel.temp": "Temp.",
  "landing.panel.pressure": "Presión",
  "landing.panel.deadTime": "Tiempo muerto",
  "landing.panel.lastUpdate": "Última actualización",
  "landing.panel.profile": "Perfil",
  "landing.stream.intro":
    "Cada barra es una partícula, en el momento en que cruza el detector. Su altura es el tamaño de su pulso de luz.",
  "landing.stream.small": "pulso pequeño",
  "landing.stream.medium": "mediano",
  "landing.stream.large": "grande",
  "landing.stream.label":
    "Las partículas del último minuto como barras; la más reciente, a la derecha.",
  "landing.stream.ago": "hace {seconds} s",
  "landing.stream.now": "ahora",
  "landing.charts.range": "Intervalo de tiempo",
  "landing.charts.rate": "Tasa de eventos (partículas cargadas por minuto)",
  "landing.charts.deadTime": "Tiempo muerto (%, como lo reporta munhub-lab)",
  "landing.charts.perMinute": "por minuto",
  "landing.charts.sipm": "Señal del SiPM (pulso promedio)",
  "landing.charts.sipmMax": "máx. {value} mV",
  "landing.panel.range": "{count} minutos registrados",
  "landing.charts.temperature": "Temperatura",
  "landing.charts.pressure": "Presión",
  "landing.spectrum.title": "Tamaño de cada pulso de luz",
  "landing.spectrum.unit": "mV · escala logarítmica",
  "landing.spectrum.label":
    "Histograma del tamaño de los pulsos del SiPM de las últimas 1000 partículas, en ejes logarítmicos.",
  "landing.spectrum.caption":
    "Las últimas 1000 partículas, según el tamaño de su pulso de luz (la lectura del SiPM tal como la registra munhub-lab). La mayoría de los pulsos son pequeños, con una cola larga de pulsos mayores.",
  "landing.spectrum.loading": "Cargando los últimos pulsos…",
  "landing.timeline.title": "Cuándo registró datos cada detector en {year}",
  "landing.detectors.liveBadge": "EN VIVO",
  "landing.how.diagramLabel":
    "Diagrama: un rayo cósmico choca con la atmósfera, su cascada de partículas llega al detector, el agente envía el conteo a MuonHub y cualquiera puede verlo.",
  "landing.how.atmosphere": "atmósfera",
  "landing.how.primary": "rayo cósmico del espacio",
  "landing.how.you": "tú",
  "landing.equator.maximum": "el más alto de la Tierra (sudeste asiático)",
  "landing.equator.barsNote":
    "Cuanto más larga la barra, más energía necesita un rayo cósmico para atravesar ahí el escudo magnético de la Tierra.",
  "landing.hour.lowest": "Minuto más bajo",
  "landing.hour.highest": "Minuto más alto",
  "landing.detectors.eyebrow": "La red",
  "landing.detectors.title": "Todos los detectores de MunHub",
  "landing.detectors.intro":
    "Los detectores públicos de munhub-lab, la plataforma de la que nace MuonHub. Uno está enviando datos ahora; los demás registraron sesiones antes.",
  "landing.detectors.live": "Enviando datos ahora",
  "landing.detectors.lastData": "Último dato: {date}",
  "landing.detectors.noData": "Aún sin datos registrados",
  "landing.detectors.sessions": "Sesiones de registro: {count}",
  "landing.detectors.loading": "Cargando los detectores…",
  "landing.detectors.unavailable": "No se puede cargar la lista de detectores en este momento.",
  "landing.detectors.where":
    "MunHub v5 no guarda dónde está cada detector, así que el planeta los muestra a todos en la USFQ, donde funciona MunHub, hasta que sus dueños los ubiquen en MuonHub.",
  "landing.how.eyebrow": "Cómo funciona",
  "landing.equator.eyebrow": "La ciencia",
  "landing.network.eyebrow": "Únete",
  "landing.hour.chartLabel":
    "Partículas cargadas por minuto en la última hora: {count} minutos registrados, de {min} a {max}, promedio {mean}.",
  "landing.hour.loading": "Cargando la última hora…",
  "landing.hour.unavailable": "No se puede cargar la última hora en este momento.",
  "landing.hour.average": "Promedio por minuto",
  "landing.hour.recorded": "Minutos registrados",
  "landing.hour.recordedValue": "{count} de 60",
  "landing.hour.whyTitle": "Por qué los puntos oscilan",
  "landing.hour.why":
    "Las partículas llegan al azar. Un minuto que promedia {mean} conteos suele caer a unos ±{spread} de ese valor: eso es azar, no un cambio en el cielo. Los cambios reales del flujo de rayos cósmicos son de alrededor del uno por ciento; solo aparecen tras horas de conteo, una vez corregidas la presión y la temperatura.",
  "landing.hour.honest":
    "Conteos tal como se registraron: sin corregir por tiempo muerto, presión ni temperatura. Un detector de un solo sensor cuenta partículas cargadas de todo tipo (y algunos rayos gamma); los muones dominan los cambios del total, pero ningún conteo individual se identifica como un muón.",
  "landing.how.title": "De un destello de luz a datos abiertos",
  "landing.how.detector.title": "Un detector",
  "landing.how.detector.body":
    "Un bloque de plástico centellador emite un pequeño destello cuando lo cruza una partícula cargada. Un sensor de luz, un SiPM, convierte cada destello en un pulso eléctrico.",
  "landing.how.agent.title": "Un agente",
  "landing.how.agent.body":
    "Un pequeño programa en la computadora junto al detector cuenta los pulsos y envía un registro por minuto a MuonHub, junto con la presión del aire y la temperatura.",
  "landing.how.open.title": "Datos abiertos",
  "landing.how.open.body":
    "Cada dueño decide qué es público y con qué precisión se muestra la ubicación de su estación. Cualquiera puede ver en vivo una estación pública, como la de esta página.",
  "landing.equator.title": "Por qué medir en el ecuador",
  "landing.equator.body1":
    "El campo magnético de la Tierra desvía los rayos cósmicos cargados, y protege más el ecuador. En los Andes ecuatorianos solo pasan los rayos cósmicos con una rigidez mayor a unos 12–13 GV, uno de los umbrales más altos de la Tierra; cerca de los polos es de alrededor de 1 GV.",
  "landing.equator.body2":
    "Por eso los detectores de aquí registran una señal de la que se filtraron las partículas de baja energía: una visión más limpia de los rayos cósmicos de la galaxia, que las redes del hemisferio norte rara vez ofrecen. A 2400 m sobre el nivel del mar, además, llega al suelo una parte mayor de cada cascada.",
  "landing.equator.cutoff": "rigidez de corte en los Andes ecuatorianos",
  "landing.equator.poles": "cerca de los polos",
  "landing.equator.altitude": "altitud del detector de la USFQ",
  "landing.network.title": "Trae tu detector al planeta.",
  "landing.network.body":
    "MuonHub se construye para que cualquier universidad, colegio o aficionado pueda conectar un detector: registrar una estación, instalar el agente y elegir qué compartir.",
  "landing.network.stationKind":
    "Plástico centellador con un SiPM · conteos por minuto, presión, temperatura",
  "landing.network.live": "Enviando datos ahora",
  "landing.network.quiet": "Sin enviar datos en este momento",
  "landing.network.cta.map": "Ver el mapa de la red",
  "landing.network.cta.join": "Crear una cuenta",
  "landing.footer.about": "MuonHub — ciencia abierta para detectores de rayos cósmicos.",
  "landing.footer.origin":
    "Nació en el laboratorio LEOPARD de la Universidad San Francisco de Quito (USFQ). Creado por Alexander Kholodov.",
  "landing.footer.source": "Código fuente en GitHub",
  "landing.footer.dataNote":
    "Los datos en vivo de esta página se leen, solo lectura, de munhub-lab (MunHub v5) hasta que el nuevo agente de MuonHub funcione en el laboratorio.",
};
