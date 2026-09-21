/* ==========================================================================
   MM CRIMINOLOGIA — chat.js
   Sala de conversa em tempo real (Firestore) com:
   - mensagens de texto e de voz (áudio guardado no próprio Firestore)
   - mensagens que expiram em 3 dias (campo "expiraEm" + política TTL)
   - alertas quando chega mensagem de outro agente (som, vibração,
     título da aba e notificação do sistema)
   - cor da bolha por utilizador
   - banner "Tema em debate" (documento chat_config/tema)
   ========================================================================== */
(function () {
  "use strict";

  const FB_CONFIG = {
    apiKey: "AIzaSyA8wKOVv2OpBWAJeGxt4vwGaGAgeWndFVM",
    authDomain: "mmcriminologia.firebaseapp.com",
    projectId: "mmcriminologia",
    storageBucket: "mmcriminologia.firebasestorage.app",
    messagingSenderId: "738693788238",
    appId: "1:738693788238:web:d37ce10ee31f12402b091f",
  };

  const COLECAO = "chat_mensagens";
  const DIAS_DE_VIDA = 3;
  const MAX_TEXTO = 1000;
  const MAX_AUDIO_SEGUNDOS = 60;
  const MAX_AUDIO_BYTES = 600 * 1024; // base64 cresce ~33%; o limite do Firestore é 1 MiB por documento
  const MAX_MENSAGENS_VISIVEIS = 60;

  const $ = (id) => document.getElementById(id);
  const listaEl = $("lista-mensagens-chat");
  const formEl = $("form-chat");
  const inputTexto = $("chat-texto");

  // ------------------------------------------------------------------ Identidade
  let agente = null;
  try {
    agente = JSON.parse(localStorage.getItem("agente_ativo") || "null");
  } catch (e) {}

  if (!agente || !agente.nome) {
    alert("Faz primeiro a identificação na página inicial.");
    window.location.href = "index.html";
    return;
  }
  const meuNome = String(agente.nome).slice(0, 60);
  const meuUid = String(agente.id || agente.email || agente.nome).toLowerCase();
  $("chat-meu-nome").textContent = meuNome;

  // ------------------------------------------------------------------ Firebase
  if (typeof firebase === "undefined" || typeof firebase.firestore !== "function") {
    console.error(
      "SDK do Firebase incompleto. Em chat.html têm de existir, por esta ordem: " +
      "firebase-app-compat.js, firebase-firestore-compat.js, firebase-auth-compat.js."
    );
    listaEl.innerHTML = "";
    listaEl.appendChild(
      criarAviso("Não foi possível carregar o Firebase (faltam scripts em chat.html) ou estás sem internet.")
    );
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
  const db = firebase.firestore();
  const Timestamp = firebase.firestore.Timestamp;
  const FieldValue = firebase.firestore.FieldValue;
  const auth = typeof firebase.auth === "function" ? firebase.auth() : null;
  let authUid = null; // identidade anónima deste aparelho: só ela pode editar/apagar as suas mensagens

  function autenticar() {
    if (!auth) return Promise.reject(new Error("auth-indisponivel"));
    return new Promise((resolve, reject) => {
      const parar = auth.onAuthStateChanged((u) => {
        parar();
        if (u) return resolve(u);
        auth.signInAnonymously().then((c) => resolve(c.user), reject);
      });
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // ------------------------------------------------------------------ Utilitários
  function criarAviso(texto) {
    const p = document.createElement("p");
    p.className = "chat-vazio";
    p.textContent = texto;
    return p;
  }

  function corValida(c) {
    return /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#1e3a8a";
  }

  // Escolhe texto claro ou escuro conforme a cor de fundo da bolha
  function corDoTexto(hex) {
    const n = parseInt(corValida(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#0f172a" : "#ffffff";
  }

  function formatarHora(ms) {
    const d = new Date(ms);
    const hora = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date().toDateString()) return hora;
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) + " " + hora;
  }

  function formatarDuracao(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    return Math.floor(seg / 60) + ":" + String(seg % 60).padStart(2, "0");
  }

  // ------------------------------------------------------------------ Cor da bolha
  const inputCor = $("chat-cor-usuario");
  let minhaCor = corValida(localStorage.getItem("chat_cor") || "#1e3a8a");
  inputCor.value = minhaCor;
  inputCor.addEventListener("input", () => {
    minhaCor = corValida(inputCor.value);
    localStorage.setItem("chat_cor", minhaCor);
  });

  // ------------------------------------------------------------------ Enviar
  function mensagemBase(tipo) {
    const base = {
      uid: meuUid,
      nome: meuNome,
      cor: minhaCor,
      tipo: tipo,
      dataEnvio: FieldValue.serverTimestamp(),
      // O Firestore apaga o documento quando esta data passa (política TTL)
      expiraEm: Timestamp.fromMillis(Date.now() + DIAS_DE_VIDA * 24 * 60 * 60 * 1000),
    };
    // Com sessão anónima, a mensagem fica "assinada" e o autor pode editá-la/apagá-la.
    // Sem sessão anónima o chat funciona na mesma, só não há editar/apagar.
    if (authUid) base.uidAuth = authUid;
    return base;
  }

  function enviar(doc) {
    return db.collection(COLECAO).add(doc).catch((erro) => {
      console.error("Erro ao enviar mensagem:", erro);
      alert("Não foi possível enviar a mensagem. Verifica a ligação e tenta de novo.");
    });
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = inputTexto.value.trim().slice(0, MAX_TEXTO);
    if (!texto) return;
    const doc = mensagemBase("texto");
    doc.texto = texto;
    inputTexto.value = "";
    inputTexto.focus();
    enviar(doc);
  });

  // ------------------------------------------------------------------ Desenhar mensagens
  function criarBolha(id, d) {
    const minha = d.uid === meuUid;
    const cor = corValida(d.cor);

    const bolha = document.createElement("div");
    bolha.className = "chat-bubble" + (minha ? " chat-bubble-minha" : "");
    bolha.dataset.id = id;
    bolha.style.backgroundColor = cor;
    bolha.style.color = corDoTexto(cor);

    const autor = document.createElement("span");
    autor.className = "chat-autor";
    autor.textContent = d.nome || "Agente";
    bolha.appendChild(autor);

    if (d.tipo === "audio" && d.audio) {
      const linha = document.createElement("div");
      linha.className = "chat-audio";
      const player = document.createElement("audio");
      player.controls = true;
      player.preload = "metadata";
      player.src = "data:" + (d.audioMime || "audio/webm") + ";base64," + d.audio;
      linha.appendChild(player);
      const dur = document.createElement("span");
      dur.className = "chat-audio-dur";
      dur.textContent = "🎤 " + formatarDuracao(d.duracao);
      linha.appendChild(dur);
      bolha.appendChild(linha);
    } else {
      const p = document.createElement("p");
      p.className = "chat-texto";
      p.textContent = d.texto || "";
      bolha.appendChild(p);
    }

    const hora = document.createElement("span");
    hora.className = "chat-hora";
    hora.textContent = textoHora(d);
    bolha.appendChild(hora);

    // Só o autor (mesma identidade anónima) vê editar / apagar
    if (authUid && d.uidAuth === authUid) {
      const acoes = document.createElement("span");
      acoes.className = "chat-acoes";
      if (d.tipo !== "audio") {
        const bEditar = document.createElement("button");
        bEditar.type = "button";
        bEditar.title = "Editar";
        bEditar.textContent = "✏️";
        bEditar.addEventListener("click", () => iniciarEdicao(bolha, id));
        acoes.appendChild(bEditar);
      }
      const bApagar = document.createElement("button");
      bApagar.type = "button";
      bApagar.title = "Apagar";
      bApagar.textContent = "🗑️";
      bApagar.addEventListener("click", () => apagarMensagem(id));
      acoes.appendChild(bApagar);
      bolha.insertBefore(acoes, autor.nextSibling);
    }
    return bolha;
  }

  function textoHora(d) {
    const base = formatarHora(d.dataEnvio ? d.dataEnvio.toMillis() : Date.now());
    return d.editada ? base + " · editada" : base;
  }

  // Atualiza uma bolha existente (hora confirmada pelo servidor, texto editado)
  function atualizarBolha(id, d) {
    const bolha = listaEl.querySelector('.chat-bubble[data-id="' + id + '"]');
    if (!bolha) return;
    const hora = bolha.querySelector(".chat-hora");
    if (hora) hora.textContent = textoHora(d);
    const p = bolha.querySelector(".chat-texto");
    if (p && d.tipo !== "audio" && !bolha.classList.contains("editando")) p.textContent = d.texto || "";
  }

  function apagarMensagem(id) {
    if (!confirm("Apagar esta mensagem para todos?")) return;
    db.collection(COLECAO).doc(id).delete().catch((erro) => {
      console.error("Erro ao apagar:", erro);
      alert("Não foi possível apagar a mensagem.");
    });
  }

  function iniciarEdicao(bolha, id) {
    const p = bolha.querySelector(".chat-texto");
    if (!p || bolha.classList.contains("editando")) return;
    bolha.classList.add("editando");
    const original = p.textContent;

    const area = document.createElement("textarea");
    area.className = "chat-edit-area";
    area.value = original;
    area.maxLength = MAX_TEXTO;

    const barra = document.createElement("div");
    barra.className = "chat-edit-barra";
    const bCancelar = document.createElement("button");
    bCancelar.type = "button";
    bCancelar.textContent = "Cancelar";
    const bSalvar = document.createElement("button");
    bSalvar.type = "button";
    bSalvar.textContent = "Guardar";
    barra.append(bCancelar, bSalvar);

    p.style.display = "none";
    p.after(area, barra);
    area.focus();

    function fechar() {
      area.remove();
      barra.remove();
      p.style.display = "";
      bolha.classList.remove("editando");
    }
    bCancelar.addEventListener("click", fechar);
    bSalvar.addEventListener("click", () => {
      const novo = area.value.trim().slice(0, MAX_TEXTO);
      if (!novo) return;
      if (novo === original) return fechar();
      bSalvar.disabled = true;
      db.collection(COLECAO)
        .doc(id)
        .update({ texto: novo, editada: true, editadaEm: FieldValue.serverTimestamp() })
        .then(() => {
          p.textContent = novo;
          fechar();
        })
        .catch((erro) => {
          console.error("Erro ao editar:", erro);
          alert("Não foi possível guardar a edição.");
          bSalvar.disabled = false;
        });
    });
  }

  // ------------------------------------------------------------------ Alertas
  let contextoAudio = null;
  let naoLidas = 0;
  const tituloOriginal = document.title;

  // Os navegadores só deixam tocar som depois de um toque do utilizador
  ["pointerdown", "keydown"].forEach((ev) =>
    window.addEventListener(ev, () => {
      try {
        if (!contextoAudio) contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
        if (contextoAudio.state === "suspended") contextoAudio.resume();
      } catch (e) {}
    }, { once: false, passive: true })
  );

  function tocarBip() {
    if (!contextoAudio) return;
    try {
      const t = contextoAudio.currentTime;
      [880, 1175].forEach((freq, i) => {
        const osc = contextoAudio.createOscillator();
        const gain = contextoAudio.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.2);
        osc.connect(gain).connect(contextoAudio.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.22);
      });
    } catch (e) {}
  }

  function alertarNovaMensagem(d) {
    tocarBip();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);

    if (document.hidden) {
      naoLidas++;
      document.title = "(" + naoLidas + ") Nova mensagem — MM Criminologia";

      if ("Notification" in window && Notification.permission === "granted") {
        const titulo = (d.nome || "Agente") + " · MM Criminologia";
        const corpo = d.tipo === "audio" ? "🎤 Mensagem de voz" : String(d.texto || "").slice(0, 100);
        const opcoes = { body: corpo, icon: "icon-192.png", tag: "chat-mm", renotify: true, data: { url: "chat.html" } };
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready
            .then((reg) => reg.showNotification(titulo, opcoes))
            .catch(() => { try { new Notification(titulo, opcoes); } catch (e) {} });
        } else {
          try { new Notification(titulo, opcoes); } catch (e) {}
        }
      }
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      naoLidas = 0;
      document.title = tituloOriginal;
    }
  });

  const btnAlertas = $("btn-alertas");
  if ("Notification" in window && Notification.permission === "default") {
    btnAlertas.classList.remove("hidden");
    btnAlertas.addEventListener("click", () => {
      Notification.requestPermission().then((p) => {
        if (p !== "default") btnAlertas.classList.add("hidden");
      });
    });
  }

  // ------------------------------------------------------------------ Escutar mensagens
  let primeiroCarregamento = true;

  function iniciarEscuta() {

  db.collection(COLECAO)
    .where("expiraEm", ">", Timestamp.now())
    .orderBy("expiraEm", "asc")
    .limitToLast(MAX_MENSAGENS_VISIVEIS)
    .onSnapshot(
      (snap) => {
        $("status-chat-ativo").classList.remove("hidden");

        snap.docChanges().forEach((ch) => {
          const d = ch.doc.data({ serverTimestamps: "estimate" });

          if (ch.type === "added") {
            const vazio = listaEl.querySelector(".chat-vazio");
            if (vazio) vazio.remove();

            const bolha = criarBolha(ch.doc.id, d);
            const existentes = listaEl.querySelectorAll(".chat-bubble");
            listaEl.insertBefore(bolha, existentes[ch.newIndex] || null);

            const dePoisDoArranque = !primeiroCarregamento;
            if (dePoisDoArranque && d.uid !== meuUid && !ch.doc.metadata.hasPendingWrites) {
              alertarNovaMensagem(d);
            }
            if (d.uid === meuUid || !dePoisDoArranque) {
              // Ao abrir, ou quando eu envio, desce até ao fim
              listaEl.scrollTop = listaEl.scrollHeight;
            }
          } else if (ch.type === "modified") {
            atualizarBolha(ch.doc.id, d);
          } else if (ch.type === "removed") {
            const el = listaEl.querySelector('.chat-bubble[data-id="' + ch.doc.id + '"]');
            if (el) el.remove();
          }
        });

        // Só considera o arranque terminado depois de uma resposta vinda do servidor
        if (!snap.metadata.fromCache) primeiroCarregamento = false;

        if (!listaEl.querySelector(".chat-bubble")) {
          let vazio = listaEl.querySelector(".chat-vazio");
          if (!vazio) {
            vazio = criarAviso("");
            listaEl.appendChild(vazio);
          }
          vazio.textContent = "Ainda não há mensagens. Lança o primeiro debate!";
        }

        // Se estava perto do fim, acompanha as mensagens novas
        const perto = listaEl.scrollHeight - listaEl.scrollTop - listaEl.clientHeight < 120;
        if (perto) listaEl.scrollTop = listaEl.scrollHeight;
      },
      (erro) => {
        console.error("Erro ao ouvir o chat:", erro);
        listaEl.innerHTML = "";
        listaEl.appendChild(
          criarAviso(erro.code === "permission-denied"
            ? "Sem permissão para ler a conversa (verifica as regras do Firestore)."
            : "Não foi possível ligar à conversa.")
        );
      }
    );

  }

  // A leitura do chat NÃO depende de login: tenta a sessão anónima (máx. 4 s) e arranca de qualquer forma.
  Promise.race([
    autenticar(),
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("timeout-auth")), 4000)),
  ])
    .then((u) => {
      authUid = u.uid;
    })
    .catch((erro) => {
      console.warn("Sessão anónima não iniciada — o chat funciona, mas sem editar/apagar:", erro);
      const banner = document.querySelector(".chat-user-banner");
      if (banner) {
        const aviso = document.createElement("span");
        aviso.className = "chat-aviso";
        aviso.textContent = "· editar/apagar indisponíveis (sessão anónima não ativa)";
        banner.appendChild(aviso);
      }
    })
    .finally(iniciarEscuta);

  // ------------------------------------------------------------------ Tema do debate
  db.collection("chat_config").doc("tema").onSnapshot(
    (doc) => {
      const box = $("chat-tema");
      const d = doc.exists ? doc.data() : null;
      if (!d || !d.titulo) return box.classList.add("hidden");
      $("chat-tema-titulo").textContent = d.titulo;
      $("chat-tema-texto").textContent = d.texto || "";
      box.classList.remove("hidden");
    },
    () => {}
  );

  // ------------------------------------------------------------------ Mensagens de voz
  const btnMic = $("btn-mic");
  const barraGravacao = $("chat-gravacao");
  let gravador = null, pedacos = [], streamMic = null, inicioGravacao = 0, relogio = null, cancelado = false;

  function escolherFormato() {
    if (typeof MediaRecorder === "undefined") return "";
    const opcoes = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
    return opcoes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  }

  function mostrarGravacao(sim) {
    barraGravacao.classList.toggle("hidden", !sim);
    formEl.classList.toggle("hidden", sim);
  }

  async function iniciarGravacao() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      alert("Este navegador não suporta gravação de áudio.");
      return;
    }
    try {
      streamMic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert("Permite o acesso ao microfone para enviares mensagens de voz.");
      return;
    }

    const formato = escolherFormato();
    const opcoes = { audioBitsPerSecond: 24000 };
    if (formato) opcoes.mimeType = formato;

    pedacos = [];
    cancelado = false;
    gravador = new MediaRecorder(streamMic, opcoes);
    gravador.ondataavailable = (e) => { if (e.data && e.data.size) pedacos.push(e.data); };
    gravador.onstop = aoTerminarGravacao;
    gravador.start();

    inicioGravacao = Date.now();
    $("chat-rec-tempo").textContent = "0:00";
    mostrarGravacao(true);
    relogio = setInterval(() => {
      const seg = (Date.now() - inicioGravacao) / 1000;
      $("chat-rec-tempo").textContent = formatarDuracao(seg) + " / " + formatarDuracao(MAX_AUDIO_SEGUNDOS);
      if (seg >= MAX_AUDIO_SEGUNDOS) pararGravacao(false);
    }, 250);
  }

  function pararGravacao(descartar) {
    cancelado = !!descartar;
    clearInterval(relogio);
    if (gravador && gravador.state !== "inactive") gravador.stop();
    else aoTerminarGravacao();
  }

  function aoTerminarGravacao() {
    if (streamMic) streamMic.getTracks().forEach((t) => t.stop());
    streamMic = null;
    mostrarGravacao(false);

    const duracao = (Date.now() - inicioGravacao) / 1000;
    const mime = (gravador && gravador.mimeType) || "audio/webm";
    gravador = null;
    if (cancelado || !pedacos.length) return;
    if (duracao < 1) return; // toque acidental

    const blob = new Blob(pedacos, { type: mime });
    pedacos = [];
    if (blob.size > MAX_AUDIO_BYTES) {
      alert("O áudio ficou demasiado grande. Grava uma mensagem mais curta.");
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => {
      const doc = mensagemBase("audio");
      doc.audio = String(leitor.result).split(",")[1];
      doc.audioMime = mime.split(";")[0];
      doc.duracao = Math.round(duracao);
      enviar(doc);
    };
    leitor.readAsDataURL(blob);
  }

  btnMic.addEventListener("click", iniciarGravacao);
  $("btn-rec-cancelar").addEventListener("click", () => pararGravacao(true));
  $("btn-rec-enviar").addEventListener("click", () => pararGravacao(false));
})();
