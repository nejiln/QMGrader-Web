const CACHE='qm-cham-qmgrader-web-v16';
const OWNED_CACHE_PREFIX='qm-cham-qmgrader-web-';
const FILES=['./','./index.html','./theme-init.js','./style.css?v=16','./app.mjs?v=16','./core.mjs','./imports.mjs','./manifest.webmanifest','./vendor/fflate.js','./vendor/pdf.mjs','./vendor/pdf.worker.min.mjs','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key==='qm-cham-v1'||key.startsWith(OWNED_CACHE_PREFIX))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok&&new URL(event.request.url).origin===self.location.origin)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
    return response;
  }).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});
