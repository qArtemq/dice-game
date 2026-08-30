// Простой Service Worker для PWA
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    // В данной версии мы ничего не кэшируем, просто пропускаем запросы,
    // но наличие обработчика fetch необходимо для того, чтобы приложение считалось PWA
});
