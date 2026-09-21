/* ==========================================================================
   MM CRIMINOLOGIA — servicos-firebase.js
   Liga as páginas ao Firestore para que o administrador veja, de QUALQUER
   dispositivo:
     - sugestões enviadas pelos utilizadores      (coleção "sugestoes")
     - quem entrou e quem saiu                    (coleção "acessos")
     - quem está online agora                     (coleção "presenca")
   Deve ser carregado DEPOIS dos SDKs do Firebase e ANTES do app.js.
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

  const INTERVALO_BATIMENTO_MS = 60 * 1000;
  const DIAS_GUARDAR_ACESSOS = 30;

  if (typeof firebase === "undefined" || typeof firebase.firestore !== "function") {
    console.error(
      "SDK do Firebase incompleto nesta página. Precisa, por esta ordem, de: " +
      "firebase-app-compat.js, firebase-firestore-compat.js e firebase-auth-compat.js."
    );
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);

  const db = firebase.firestore();
  const auth = typeof firebase.auth === "function" ? firebase.auth() : null;
  const Timestamp = firebase.firestore.Timestamp;
  const FieldValue = firebase.firestore.FieldValue;

  // ---------------------------------------------------------------- Identidade (Autenticação Anónima)
  // Cada aparelho recebe um uid anónimo. É ele que permite editar/apagar só o que é seu.
  function garantirAuth() {
    if (!auth) return Promise.reject(new Error("auth-indisponivel"));
    return new Promise((resolve, reject) => {
      const parar = auth.onAuthStateChanged((u) => {
        parar();
        if (u) return resolve(u);
        auth.signInAnonymously().then((c) => resolve(c.user), reject);
      });
    });
  }

  // ---------------------------------------------------------------- Utilitários
  function comTimeout(promessa, ms) {
    return Promise.race([
      promessa,
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("timeout")), ms)),
    ]);
  }

  function ms(ts) {
    return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
  }

  function normalizarAgente(a) {
    if (!a || !a.nome || !a.email) return null;
    const email = String(a.email).toLowerCase().slice(0, 120);
    return {
      uid: String(a.id || email).toLowerCase().slice(0, 120),
      nome: String(a.nome).slice(0, 60),
      email: email,
    };
  }

  function agenteAtual() {
    try {
      return normalizarAgente(JSON.parse(localStorage.getItem("agente_ativo") || "null"));
    } catch (e) {
      return null;
    }
  }

  function eventoAcesso(ag, tipo) {
    return {
      uid: ag.uid,
      nome: ag.nome,
      email: ag.email,
      tipo: tipo, // "entrada" | "saida"
      data: FieldValue.serverTimestamp(),
      expiraEm: Timestamp.fromMillis(Date.now() + DIAS_GUARDAR_ACESSOS * 24 * 60 * 60 * 1000),
    };
  }

  // ---------------------------------------------------------------- Sugestões
  window.mmEnviarSugestao = function (nome, texto) {
    return comTimeout(
      // Tenta assinar com a sessão anónima; se não estiver ativa, envia na mesma (sem poder editar/apagar depois)
      comTimeout(garantirAuth(), 4000)
        .catch(() => null)
        .then((u) => {
          const doc = {
            autor: String(nome).slice(0, 60),
            texto: String(texto).slice(0, 2000),
            data: FieldValue.serverTimestamp(),
          };
          if (u) doc.uidAuth = u.uid;
          return db.collection("sugestoes").add(doc);
        }),
      10000,
    );
  };

  // Sugestões do próprio utilizador (para ele editar / apagar)
  window.mmMinhasSugestoes = function (aoAtualizar, aoErro) {
    let cancelar = () => {};
    let cancelado = false;
    garantirAuth()
      .then((u) => {
        if (cancelado) return;
        cancelar = db
          .collection("sugestoes")
          .where("uidAuth", "==", u.uid)
          .onSnapshot((snap) => {
            const lista = snap.docs.map((d) => {
              const x = d.data({ serverTimestamps: "estimate" });
              return {
                id: d.id,
                autor: x.autor,
                texto: x.texto,
                editada: !!x.editadaEm,
                dataMs: ms(x.data),
                data: x.data ? x.data.toDate().toLocaleString("pt-PT") : "",
              };
            });
            lista.sort((p, q) => q.dataMs - p.dataMs);
            aoAtualizar(lista);
          }, aoErro || console.error);
      })
      .catch(aoErro || console.error);
    return () => {
      cancelado = true;
      cancelar();
    };
  };

  window.mmEditarSugestao = function (id, texto) {
    return comTimeout(
      db.collection("sugestoes").doc(id).update({
        texto: String(texto).slice(0, 2000),
        editadaEm: FieldValue.serverTimestamp(),
      }),
      10000,
    );
  };

  window.mmApagarSugestao = function (id) {
    return comTimeout(db.collection("sugestoes").doc(id).delete(), 10000);
  };

  window.mmEscutarSugestoes = function (aoAtualizar, aoErro) {
    return db
      .collection("sugestoes")
      .orderBy("data", "desc")
      .limit(200)
      .onSnapshot((snap) => {
        aoAtualizar(
          snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: "estimate" });
            return {
              id: d.id,
              autor: x.autor,
              texto: x.texto,
              editada: !!x.editadaEm,
              dataMs: ms(x.data),
              data: x.data ? x.data.toDate().toLocaleString("pt-PT") : "",
            };
          }),
        );
      }, aoErro || console.error);
  };

  // ---------------------------------------------------------------- Entradas / saídas
  window.mmRegistarEntrada = function (agenteBruto) {
    const ag = normalizarAgente(agenteBruto);
    if (!ag) return Promise.resolve();
    const lote = db.batch();
    lote.set(db.collection("acessos").doc(), eventoAcesso(ag, "entrada"));
    lote.set(
      db.collection("presenca").doc(ag.uid),
      {
        nome: ag.nome,
        email: ag.email,
        online: true,
        entrouEm: FieldValue.serverTimestamp(),
        saiuEm: FieldValue.delete(),
        ultimoSinal: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return lote.commit();
  };

  function registarSaida(ag) {
    const lote = db.batch();
    lote.set(db.collection("acessos").doc(), eventoAcesso(ag, "saida"));
    lote.set(
      db.collection("presenca").doc(ag.uid),
      {
        nome: ag.nome,
        email: ag.email,
        online: false,
        saiuEm: FieldValue.serverTimestamp(),
        ultimoSinal: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return lote.commit();
  }

  // Botão "Terminar sessão": regista a saída, limpa o agente e volta ao início
  let aSair = false;
  window.mmSair = function (destino) {
    const ir = () => {
      localStorage.removeItem("agente_ativo");
      window.location.href = destino || "index.html";
    };
    const ag = agenteAtual();
    if (!ag) return ir();
    aSair = true;
    comTimeout(registarSaida(ag), 2500).then(ir, ir);
  };

  // Sinal de vida: enquanto a página está aberta e visível, avisa que o agente está online.
  // (Uma aba fechada ou um telemóvel sem rede não conseguem avisar que saíram; por isso
  //  o painel considera "offline" quem deixa de dar sinal há mais de ~2 minutos.)
  function batimento() {
    const ag = agenteAtual();
    if (!ag || aSair || document.hidden) return;
    db.collection("presenca")
      .doc(ag.uid)
      .set(
        { nome: ag.nome, email: ag.email, online: true, ultimoSinal: FieldValue.serverTimestamp() },
        { merge: true },
      )
      .catch(() => {});
  }
  setInterval(batimento, INTERVALO_BATIMENTO_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) batimento();
  });
  batimento();

  // ---------------------------------------------------------------- Leitura para o painel admin
  window.mmEscutarPresenca = function (aoAtualizar, aoErro) {
    return db
      .collection("presenca")
      .orderBy("ultimoSinal", "desc")
      .limit(200)
      .onSnapshot((snap) => {
        aoAtualizar(
          snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: "estimate" });
            return {
              id: d.id,
              nome: x.nome,
              email: x.email,
              online: !!x.online,
              ultimoSinalMs: ms(x.ultimoSinal),
              entrouEmMs: ms(x.entrouEm),
              saiuEmMs: ms(x.saiuEm),
            };
          }),
        );
      }, aoErro || console.error);
  };

  window.mmEscutarAcessos = function (aoAtualizar, aoErro) {
    return db
      .collection("acessos")
      .orderBy("data", "desc")
      .limit(100)
      .onSnapshot((snap) => {
        aoAtualizar(
          snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: "estimate" });
            return { id: d.id, nome: x.nome, email: x.email, tipo: x.tipo, dataMs: ms(x.data) };
          }),
        );
      }, aoErro || console.error);
  };

  // ---------------------------------------------------------------- Login do administrador
  // O painel só abre para quem entrar com e-mail + senha (Firebase Authentication)
  // E tiver permissão nas regras do Firestore (função ehAdmin()). O e-mail do
  // administrador fica APENAS nas regras — não há senha nem e-mail neste ficheiro.
  function verificarAdmin() {
    // Tentativa de leitura de uma coleção que só o administrador pode ler
    return db
      .collection("presenca")
      .limit(1)
      .get()
      .catch((erro) => {
        if (auth) auth.signOut();
        throw new Error(erro && erro.code === "permission-denied" ? "sem-permissao" : "falha-leitura");
      });
  }

  window.mmAdminEntrar = function (email, senha) {
    if (!auth) return Promise.reject(new Error("auth-indisponivel"));
    return auth.signInWithEmailAndPassword(String(email).trim(), senha).then(verificarAdmin);
  };

  window.mmAdminRecuperar = function (email) {
    if (!auth) return Promise.reject(new Error("auth-indisponivel"));
    return auth.sendPasswordResetEmail(String(email).trim());
  };

  // Chama aoMudar(true) quando há um administrador autenticado (também ao reabrir a página)
  window.mmAdminObservar = function (aoMudar) {
    if (!auth) return false;
    auth.onAuthStateChanged((u) => {
      if (!u || u.isAnonymous) return aoMudar(false);
      verificarAdmin().then(() => aoMudar(true), () => aoMudar(false));
    });
    return true;
  };

  window.mmAdminSair = function () {
    return auth ? auth.signOut() : Promise.resolve();
  };
})();
