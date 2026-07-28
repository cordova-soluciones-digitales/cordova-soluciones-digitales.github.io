// Nombre de caché — súbelo (v2, v3...) cada vez que cambies index.html
// para forzar que los usuarios reciban la versión nueva.
const CACHE_NAME = 'escaner-nutrimental-v1';

// App shell: lo esencial para que la interfaz cargue offline.
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

// ─── Instalación: precachea el app shell ───
// Usamos cache.add() uno por uno (en vez de cache.addAll) para que, si un
// solo archivo falla (ícono faltante, ruta incorrecta, etc.), no tumbe la
// instalación completa del service worker. Cada fallo se reporta en consola
// para poder diagnosticarlo sin romper el resto del precacheo.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                APP_SHELL.map((url) =>
                    cache.add(url).catch((err) =>
                        console.warn('[SW] No se pudo precachear:', url, err)
                    )
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ─── Activación: borra cachés de versiones viejas ───
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ─── Fetch: estrategia mixta ───
// - Para el motor de Tesseract.js (CDN, .wasm, .traineddata, fuentes, Font Awesome):
//   cache-first. Son archivos pesados que no cambian; una vez descargados, se
//   sirven desde disco y no vuelven a pedirse por red.
// - Para el propio documento HTML (navegación): network-first, con fallback a
//   caché si no hay conexión, así el usuario siempre ve la versión más nueva
//   cuando hay internet.
self.addEventListener('fetch', (event) => {
    const {request} = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const esNavegacion = request.mode === 'navigate';

    if (esNavegacion) {
        event.respondWith(
            fetch(request)
                .then((respuesta) => {
                    const copia = respuesta.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
                    return respuesta;
                })
                .catch(() => caches.match(request).then((r) => r || caches.match('./index.html')))
        );
        return;
    }

    // Todo lo demás (assets propios y CDN externas: Tesseract, fuentes, Font Awesome)
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((respuesta) => {
                // Solo cachea respuestas válidas (evita cachear errores o respuestas opacas rotas)
                if (respuesta && respuesta.status === 200) {
                    const copia = respuesta.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
                }
                return respuesta;
            }).catch(() => {
                // Si falla y era una imagen/ícono, no hay mucho que hacer offline sin haberlo cacheado antes.
                return cached;
            });
        })
    );
});
