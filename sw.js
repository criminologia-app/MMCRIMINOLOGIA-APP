// Estratégia "rede primeiro": tenta sempre a versão mais recente do site e só usa a cópia
// guardada quando estás offline. Assim uma atualização nunca fica presa numa versão antiga.
// Mesmo assim, sobe este número quando alterares ficheiros, para limpar caches antigos.
const CACHE_NAME = "m-criminologia-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./treino.html",
  "./admin.html",
  "./pontuacoes.html",
  "./sugestoes.html",
  "./chat.html",
  "./styles.css",
  "./chat-extra.css",
  "./app.js",
  "./chat.js",
  "./servicos-firebase.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  // Guarda cada ficheiro individualmente: se um faltar, os outros continuam a ser guardados
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Só trata pedidos GET do próprio site; Firebase e outros domínios vão direto à rede.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resposta) => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(req).then((guardada) => guardada || caches.match("./index.html"))),
  );
});

// Ao tocar na notificação, abre (ou traz para a frente) o chat
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || "chat.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.includes("chat.html") && "focus" in j) return j.focus();
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
