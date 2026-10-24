// 나와봄 v4.25 — 동일한 앱 주소에 붙는 ?v=... 링크의 중복 캐시 방지
const CACHE="nawabom-v4.25-public-beta-diagnostics";
const CORE=["./","./index.html","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png"];
const scope=new URL(self.registration.scope);
const corePaths=new Set(CORE.map(p=>new URL(p,scope).pathname));
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("nawabom-")&&k!==CACHE).map(k=>caches.delete(k)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const navigation=request.mode==="navigate";
 if(!navigation&&!corePaths.has(url.pathname))return;
 const cacheKey=new Request(url.origin+url.pathname);
 event.respondWith(
  fetch(request).then(response=>{
   if(response.ok){
    const copy=response.clone();
    event.waitUntil(caches.open(CACHE).then(cache=>cache.put(cacheKey,copy)));
   }
   return response;
  }).catch(async()=>{
   const cache=await caches.open(CACHE);
   return (await cache.match(cacheKey))||(navigation?await cache.match(new URL("./index.html",scope)):null)||Response.error();
  })
 );
});