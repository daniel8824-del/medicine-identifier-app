const CACHE_NAME = 'medicine-cache-v1';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/db.js'
];

// Service Worker 설치
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(URLS_TO_CACHE);
            })
            .catch(error => {
                console.error('Cache addAll error:', error);
            })
    );
});

// 네트워크 우선, 캐시 폴백 전략
self.addEventListener('fetch', event => {
    // API 요청인 경우 네트워크만 사용
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => response)
                .catch(error => {
                    console.error('API 요청 실패:', error);
                    return new Response(JSON.stringify({
                        error: '네트워크 오류가 발생했습니다.'
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
    } else {
        // 정적 리소스는 캐시 우선 전략 사용
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request);
                })
        );
    }
}); 