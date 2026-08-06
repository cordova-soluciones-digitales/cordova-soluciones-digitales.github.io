/* Service worker de la PWA.
 * - Precachea el app shell (con cache.add() individual + .catch(), para que
 *   un solo archivo faltante no tumbe todo el precacheo).
 * - Documento HTML (navegación): network-first con fallback a caché.
 * - Catálogo (dataSourceUrl de Google Apps Script): también network-first,
 *   pero SIN caer a index.html si falla — cae al último JSON bueno que
 *   haya en caché. Importante: NO puede ir por cache-first, porque el JS
 *   ya tiene su propia caché con vencimiento (60 min, ver CACHE_DURATION_MS
 *   en index.html) que decide cuándo pedir datos frescos; si el service
 *   worker sirviera esa respuesta desde caché primero, esa lógica de
 *   vencimiento dejaría de tener efecto y el catálogo quedaría pegado a la
 *   primera respuesta para siempre.
 * - Todo lo demás (CSS/JS/íconos/fuentes/CDN): cache-first.
 * - Limpia cachés de versiones anteriores en "activate".
 */

const CACHE_VERSION = 'v13';
const CACHE_NAME = `tienda-app-shell-${CACHE_VERSION}`;

// App shell local
const SPLASH_SCREENS = [
    'iphone-1290x2796.png', 'iphone-1179x2556.png', 'iphone-1284x2778.png',
    'iphone-1170x2532.png', 'iphone-1125x2436.png', 'iphone-1242x2688.png',
    'iphone-828x1792.png', 'iphone-1242x2208.png', 'iphone-750x1334.png',
    'iphone-640x1136.png', 'ipad-2048x2732.png', 'ipad-1668x2388.png',
    'ipad-1640x2360.png', 'ipad-1620x2160.png', 'ipad-1488x2266.png'
].map((f) => `./icons/splash/${f}`);

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
    ...SPLASH_SCREENS,

    // CDNs externas usadas por el HTML (Bootstrap CSS/JS, Font Awesome CSS,
    // y Lottie para la animación del loader fullscreen del catálogo).
    // Todas sirven con CORS habilitado, así que cache.add() obtiene una
    // respuesta normal (no opaca) y puede cachearla sin problema.
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // cache.add() individual por archivo: si uno falla (404, offline,
            // CORS, etc.) no revienta el precacheo de los demás.
            return Promise.all(
                APP_SHELL.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[SW] No se pudo precachear:', url, err);
                    })
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => {
                            console.log('[SW] Eliminando caché vieja:', key);
                            return caches.delete(key);
                        })
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const {request} = event;

    // Ignora esquemas que no sean http/https — por ejemplo "chrome-extension://",
    // que Chrome dispara para recursos inyectados por extensiones del
    // navegador (React/Vue DevTools, bloqueadores de anuncios, etc.). La
    // Cache API no soporta esos esquemas: si se intenta cachear uno,
    // cache.put() tira "Failed to execute 'put' on 'Cache': Request scheme
    // ... is unsupported". Con este return, esas peticiones ni siquiera
    // pasan por el service worker (las maneja el navegador normalmente).
    if (!request.url.startsWith('http')) return;

    // Solo interceptamos GET; el resto (POST, etc.) pasa directo a la red.
    if (request.method !== 'GET') return;

    const isDocumentNavigation =
        request.mode === 'navigate' || request.destination === 'document';

    // El catálogo se sirve desde un Google Apps Script (dataSourceUrl en
    // BUSINESS). Se detecta por dominio, sin depender de la URL exacta de
    // este negocio, para que esta regla siga funcionando si el whitelabel
    // se reutiliza con otro dataSourceUrl.
    const isDataSource = /(^|\.)script\.google(usercontent)?\.com$/.test(
        new URL(request.url).hostname
    );

    if (isDocumentNavigation) {
        event.respondWith(networkFirst(request));
    } else if (isDataSource) {
        event.respondWith(networkFirstData(request));
    } else {
        event.respondWith(cacheFirst(request));
    }
});

// ---- Navegación del documento HTML: siempre intenta traer lo más nuevo,
// y si no hay internet, cae a la versión cacheada. ----
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached =
            (await cache.match(request)) || (await cache.match('./index.html'));
        if (cached) return cached;
        throw err;
    }
}

// ---- Catálogo (dataSourceUrl): misma idea que networkFirst, pero sin el
// fallback a index.html (no tendría sentido para una respuesta JSON). Si
// no hay red, cae al último JSON de productos que se haya guardado. ----
async function networkFirstData(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
    }
}

// ---- Todo lo demás (CSS, JS, íconos, fuentes, CDNs): si ya está en
// caché se sirve al instante; si no, se pide a la red y se guarda para
// la próxima vez. ----
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        // Se cachean también respuestas "opacas" (recursos cross-origin sin
        // CORS), ya que igual son válidas para servirse, solo no se pueden
        // inspeccionar sus datos.
        if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        throw err;
    }
}

