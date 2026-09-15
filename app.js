// --------------------------------------------------------------------------
// ESTADO DA APLICAÇÃO
// --------------------------------------------------------------------------

let estadoGlobal = {
  utilizador: {
    nome: "",
    email: "",
  },
  pontuacaoTotal: 0,
  respostasCertasTotais: 0,
  respostasErradasTotais: 0,
  disciplinasConcluidas: 0,
};

let quizAtual = {
  modulo: null,
  disciplina: null,
  questaoIndex: 0,
  pontuacaoSessao: 0,
  acertosSessao: 0,
  errosSessao: 0,
  tempoInicio: null,
  timerInterval: null,
  dicaUsada: false,
};
// Cole isto no teu app.js (ou num <script> no início do body, antes do app.js)

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");

  // Quando um novo service worker assume o controlo (nova versão publicada),
  // recarrega a página automaticamente para os utilizadores verem a atualização.
  let jaRecarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (jaRecarregou) return;
    jaRecarregou = true;
    window.location.reload();
  });
}
// Instância diferida do Contexto de Áudio
let audioCtx = null;

function obterContextoAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}
// Dentro da tua função de login/submissão:
const inputNome = document.getElementById("nome-usuario");
if (inputNome) {
  const nomeAgente = inputNome.value.trim();

  // Salva o nome na chave 'agente_ativo' do navegador
  localStorage.setItem("agente_ativo", JSON.stringify({ nome: nomeAgente }));
}
// --------------------------------------------------------------------------
// INICIALIZAÇÃO
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  renderizarModulos();
  configurarEventos();
  carregarHistoricoAgentes();

  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", processarLogin);
  }
});

// Renderiza Módulos e Disciplinas no Ecrã Principal
function renderizarModulos() {
  const container = document.getElementById("modules-container");
  if (!container) return;
  container.innerHTML = "";

  BANCO_DE_DADOS.forEach((modulo) => {
    const cardModulo = document.createElement("div");
    cardModulo.className = "module-card";

    const header = document.createElement("div");
    header.className = "module-header";
    header.innerHTML = `<span>${modulo.titulo}</span><span>${modulo.disciplinas.length} Disciplinas</span>`;

    const gridDisciplinas = document.createElement("div");
    gridDisciplinas.className = "disciplines-grid";

    modulo.disciplinas.forEach((disciplina) => {
      const btn = document.createElement("button");
      btn.className = "discipline-btn";
      btn.innerHTML = `<span>${disciplina.nome}</span> <small style="color:var(--blue-primary)">${disciplina.questoes.length} Qs</small>`;
      btn.onclick = () => {
        tocarSomClique();
        iniciarQuiz(modulo, disciplina);
      };
      gridDisciplinas.appendChild(btn);
    });

    cardModulo.appendChild(header);
    cardModulo.appendChild(gridDisciplinas);
    container.appendChild(cardModulo);
  });
}

// --------------------------------------------------------------------------
// LÓGICA DO QUIZ
// --------------------------------------------------------------------------
function iniciarQuiz(modulo, disciplina) {
  if (!validarInformacoesUtilizador()) return;

  // Limpa timer anterior se existir para evitar vazamento de memória
  if (quizAtual.timerInterval) {
    clearInterval(quizAtual.timerInterval);
  }

  quizAtual = {
    modulo: modulo,
    disciplina: disciplina,
    questaoIndex: 0,
    pontuacaoSessao: 0,
    acertosSessao: 0,
    errosSessao: 0,
    tempoInicio: Date.now(),
    timerInterval: setInterval(atualizarTimer, 1000),
    dicaUsada: false,
  };

  document.getElementById("quiz-module-name").textContent = modulo.titulo;
  document.getElementById("quiz-subject-name").textContent = disciplina.nome;

  mudarEcra("quiz-screen");
  carregarQuestao();
}

function carregarQuestao() {
  const q = quizAtual.disciplina.questoes[quizAtual.questaoIndex];
  quizAtual.dicaUsada = false;

  const progresso =
    (quizAtual.questaoIndex / quizAtual.disciplina.questoes.length) * 100;
  document.getElementById("progress-bar").style.width = `${progresso}%`;

  document.getElementById("question-number").textContent =
    `Questão ${quizAtual.questaoIndex + 1} de ${quizAtual.disciplina.questoes.length}`;
  document.getElementById("question-text").textContent = q.pergunta;

  document.getElementById("hint-box").classList.add("hidden");
  document.getElementById("feedback-box").classList.add("hidden");
  document.getElementById("btn-hint").disabled = false;

  const btnNext = document.getElementById("btn-next");
  if (btnNext) btnNext.disabled = true;

  const containerOpcoes = document.getElementById("options-container");
  containerOpcoes.innerHTML = "";

  q.opcoes.forEach((opcaoText, index) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = `${String.fromCharCode(65 + index)}) ${opcaoText}`;
    btn.onclick = () => verificarResposta(index);
    containerOpcoes.appendChild(btn);
  });
}

function verificarResposta(indiceSelecionado) {
  const q = quizAtual.disciplina.questoes[quizAtual.questaoIndex];
  const botoes = document.querySelectorAll(".option-btn");

  botoes.forEach((b) => (b.disabled = true));

  const statusBox = document.getElementById("feedback-status");
  const feedbackBox = document.getElementById("feedback-box");
  const rationaleText = document.getElementById("rationale-text");

  if (indiceSelecionado === q.respostaCorreta) {
    tocarSomAcerto();
    botoes[indiceSelecionado].classList.add("correct");
    statusBox.textContent = "✓ RESPOSTA CORRETA";
    statusBox.className = "feedback-status success";

    let pontosGanhos = 100 - (quizAtual.dicaUsada ? 50 : 0);
    quizAtual.pontuacaoSessao += pontosGanhos;
    quizAtual.acertosSessao++;
  } else {
    tocarSomErro();
    botoes[indiceSelecionado].classList.add("wrong");
    botoes[q.respostaCorreta].classList.add("correct");
    statusBox.textContent = "✕ RESPOSTA INCORRETA";
    statusBox.className = "feedback-status error";

    quizAtual.errosSessao++;
  }

  rationaleText.textContent = q.justificativa;
  feedbackBox.classList.remove("hidden");

  const btnNext = document.getElementById("btn-next");
  if (btnNext) btnNext.disabled = false;
}

// --------------------------------------------------------------------------
// DICA, TIMER E EVENTOS
// --------------------------------------------------------------------------
function configurarEventos() {
  const btnHint = document.getElementById("btn-hint");
  if (btnHint) {
    btnHint.onclick = () => {
      tocarSomClique();
      const q = quizAtual.disciplina.questoes[quizAtual.questaoIndex];
      document.getElementById("hint-text").textContent = q.dica;
      document.getElementById("hint-box").classList.remove("hidden");
      document.getElementById("btn-hint").disabled = true;
      quizAtual.dicaUsada = true;
    };
  }

  const btnNext = document.getElementById("btn-next");
  if (btnNext) {
    btnNext.onclick = () => {
      tocarSomClique();
      quizAtual.questaoIndex++;
      if (quizAtual.questaoIndex < quizAtual.disciplina.questoes.length) {
        carregarQuestao();
      } else {
        finalizarQuiz();
      }
    };
  }

  const btnBack = document.getElementById("btn-back");
  if (btnBack) {
    btnBack.onclick = () => {
      tocarSomClique();
      clearInterval(quizAtual.timerInterval);
      mudarEcra("selection-screen");
    };
  }

  const btnRestart = document.getElementById("btn-restart");
  if (btnRestart) {
    btnRestart.onclick = () => {
      tocarSomClique();
      mudarEcra("selection-screen");
    };
  }
}

function atualizarTimer() {
  const decorrido = Math.floor((Date.now() - quizAtual.tempoInicio) / 1000);
  const min = String(Math.floor(decorrido / 60)).padStart(2, "0");
  const seg = String(decorrido % 60).padStart(2, "0");
  const timerDisplay = document.getElementById("timer-display");
  if (timerDisplay) timerDisplay.textContent = `${min}:${seg}`;
}

function finalizarQuiz() {
  clearInterval(quizAtual.timerInterval);

  estadoGlobal.pontuacaoTotal += quizAtual.pontuacaoSessao;
  estadoGlobal.respostasCertasTotais += quizAtual.acertosSessao;
  estadoGlobal.respostasErradasTotais += quizAtual.errosSessao;
  estadoGlobal.disciplinasConcluidas++;

  document.getElementById("score-display").textContent =
    estadoGlobal.pontuacaoTotal;
  document.getElementById("completed-display").textContent =
    estadoGlobal.disciplinasConcluidas;

  const totalRespostas =
    estadoGlobal.respostasCertasTotais + estadoGlobal.respostasErradasTotais;
  const precisao =
    totalRespostas > 0
      ? Math.round((estadoGlobal.respostasCertasTotais / totalRespostas) * 100)
      : 0;
  document.getElementById("accuracy-display").textContent = `${precisao}%`;

  document.getElementById("result-subject-title").textContent =
    quizAtual.disciplina.nome;
  document.getElementById("res-score").textContent = quizAtual.pontuacaoSessao;
  document.getElementById("res-correct").textContent =
    `${quizAtual.acertosSessao} / ${quizAtual.disciplina.questoes.length}`;
  document.getElementById("res-wrong").textContent = quizAtual.errosSessao;
  document.getElementById("res-time").textContent =
    document.getElementById("timer-display").textContent;

  // Grava automaticamente a pontuação desta disciplina no ranking geral,
  // para que a página de Pontuações reflita o resultado imediatamente.
  const agenteSessao = JSON.parse(localStorage.getItem("agente_ativo"));
  if (agenteSessao && agenteSessao.id) {
    atualizarProgresso(
      agenteSessao.id,
      agenteSessao.nome,
      quizAtual.pontuacaoSessao,
      quizAtual.disciplina.nome,
    );
  }

  mudarEcra("result-screen");
}

function mudarEcra(idEcra) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  const ecraAlvo = document.getElementById(idEcra);
  if (ecraAlvo) ecraAlvo.classList.add("active");
}

// Service Worker PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then(() => console.log("App pronto para uso offline."))
    .catch((err) => console.error("Erro ao registar Service Worker:", err));
}

// --------------------------------------------------------------------------
// SINTETIZADOR DE ÁUDIO (Web Audio API)
// --------------------------------------------------------------------------
function tocarSomClique() {
  const ctx = obterContextoAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

function tocarSomAcerto() {
  const ctx = obterContextoAudio();
  const agora = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(523.25, agora);
  osc.frequency.setValueAtTime(659.25, agora + 0.1);

  gain.gain.setValueAtTime(0.3, agora);
  gain.gain.exponentialRampToValueAtTime(0.01, agora + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(agora + 0.3);
}

function tocarSomErro() {
  // Som suave de "resposta errada": duas notas curtas e baixas em onda
  // triangular (sem o timbre áspero do sawtooth), a um volume discreto.
  const ctx = obterContextoAudio();
  const agora = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(392.0, agora); // Nota G4
  osc.frequency.setValueAtTime(311.13, agora + 0.12); // Nota Eb4 (descida suave)

  gain.gain.setValueAtTime(0.16, agora);
  gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.28);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(agora + 0.28);
}

// --------------------------------------------------------------------------
// MÓDULO P2P
// --------------------------------------------------------------------------
class P2PTransfer {
  constructor() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.dataChannel = null;
  }

  async criarConexao() {
    this.dataChannel =
      this.peerConnection.createDataChannel("transferenciaApp");
    this.configurarCanal();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    return JSON.stringify(this.peerConnection.localDescription);
  }

  async responderConexao(dadosOferta) {
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.configurarCanal();
    };

    const offer = new RTCSessionDescription(JSON.parse(dadosOferta));
    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return JSON.stringify(this.peerConnection.localDescription);
  }

  configurarCanal() {
    this.dataChannel.onopen = () => console.log("Conexão P2P Estabelecida!");
    this.dataChannel.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.tipo === "SYNC_BD") {
        console.log("Banco de Dados Recebido:", payload.conteudo);
      }
    };
  }

  enviarDados(dados) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(
        JSON.stringify({ tipo: "SYNC_BD", conteudo: dados }),
      );
    }
  }
}

// --------------------------------------------------------------------------
// VALIDAÇÃO E FLUXO DE UTILIZADOR
// --------------------------------------------------------------------------
function validarInformacoesUtilizador() {
  // 1. Tenta recuperar agente guardado na sessão (LocalStorage)
  const agenteSessao = JSON.parse(localStorage.getItem("agente_ativo"));

  if (agenteSessao && agenteSessao.nome) {
    estadoGlobal.utilizador.nome = agenteSessao.nome;
    estadoGlobal.utilizador.email = agenteSessao.email || "";
    return true;
  }

  // 2. Se não houver sessão, procura pelos inputs na página atual (Login)
  const inputNome =
    document.getElementById("nome-usuario") ||
    document.getElementById("user-name");
  const inputEmail =
    document.getElementById("email-usuario") ||
    document.getElementById("user-email");

  if (inputNome && inputNome.value.trim() !== "") {
    estadoGlobal.utilizador.nome = inputNome.value.trim();
    if (inputEmail) estadoGlobal.utilizador.email = inputEmail.value.trim();
    return true;
  }

  // 3. Se estiver na página de Treino e não houver dados preenchidos/salvos:
  alert("Por favor, preencha a sua identificação antes de iniciar o treino!");
  window.location.href = "index.html"; // Redireciona para a página de login
  return false;
}

const SENHA_MESTRE = "212100";

// --------------------------------------------------------------------------
// AUTENTICAÇÃO E NAVEGAÇÃO ADMIN
// --------------------------------------------------------------------------
function validarAcessoAdmin() {
  const inputSenha = document.getElementById("senha-admin").value;
  const elementoErro = document.getElementById("erro-senha");

  if (inputSenha === SENHA_MESTRE) {
    if (elementoErro) elementoErro.style.display = "none";

    document.getElementById("modal-auth").classList.add("hidden");
    document.getElementById("conteudo-painel").classList.remove("hidden");

    carregarDadosAdm();
  } else {
    if (elementoErro) elementoErro.style.display = "block";
  }
}

// --------------------------------------------------------------------------
// GERENCIAMENTO DO INDEXEDDB
// --------------------------------------------------------------------------
function submeterEGravarAgente(event) {
  event.preventDefault();

  const inputNome = document.getElementById("nome-usuario");
  const inputEmail = document.getElementById("email-usuario");

  const nome = inputNome ? inputNome.value.trim() : "";
  const email = inputEmail ? inputEmail.value.trim() : "";

  // 1. Validação dos campos
  if (!nome || !email) {
    alert(
      "Por favor, preencha todos os campos obrigatórios antes de continuar!",
    );
    if (!nome && inputNome) inputNome.focus();
    else if (!email && inputEmail) inputEmail.focus();
    return;
  }

  if (!email.includes("@") || !email.includes(".")) {
    alert("Por favor, introduza um e-mail válido!");
    if (inputEmail) inputEmail.focus();
    return;
  }

  // Objeto do agente a registrar
  const novoAgente = {
    nome: nome,
    email: email,
    dataAcesso: new Date().toLocaleString("pt-PT"),
  };

  // 2. Gravação no IndexedDB
  const reqDB = indexedDB.open("CriminologiaDB", 2);

  reqDB.onupgradeneeded = function (evt) {
    const db = evt.target.result;
    if (!db.objectStoreNames.contains("usuarios")) {
      db.createObjectStore("usuarios", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("sugestoes")) {
      db.createObjectStore("sugestoes", { keyPath: "id", autoIncrement: true });
    }
  };

  reqDB.onsuccess = function (evt) {
    const db = evt.target.result;
    const tx = db.transaction(["usuarios"], "readwrite");
    const store = tx.objectStore("usuarios");

    const addRequest = store.add(novoAgente);

    addRequest.onsuccess = function () {
      // 3. Persistência na Sessão Ativa e LocalStorage
      localStorage.setItem("agente_ativo", JSON.stringify(novoAgente));

      let agentesRegistados =
        JSON.parse(localStorage.getItem("agentes_registados")) || [];
      agentesRegistados.push(novoAgente);
      localStorage.setItem(
        "agentes_registados",
        JSON.stringify(agentesRegistados),
      );

      // 4. Redirecionamento Automático para treino.html
      window.location.href = "treino.html";
    };

    addRequest.onerror = function (e) {
      console.error("Erro ao gravar no IndexedDB:", e.target.error);
      alert("Ocorreu um erro ao registar os dados. Tente novamente.");
    };
  };

  reqDB.onerror = function (evt) {
    console.error("Erro ao abrir a base de dados:", evt.target.error);
    alert("Erro ao aceder à base de dados do sistema.");
  };
}

// --------------------------------------------------------------------------
// AUTENTICAÇÃO E HISTÓRICO LOCAL
// --------------------------------------------------------------------------
function processarLogin(event) {
  event.preventDefault();

  const nomeInput = document.getElementById("nome-usuario").value.trim();
  const emailInput = document.getElementById("email-usuario").value.trim();

  if (!nomeInput || !emailInput) {
    alert("Por favor, preencha todos os campos obrigatórios.");
    return;
  }

  // O "id" é derivado do e-mail (estável), e não de Date.now(), para que
  // o mesmo agente, ao voltar a entrar, continue a somar pontos na MESMA
  // linha do ranking, em vez de criar um registo novo a cada login.
  const idEstavel = emailInput.toLowerCase();

  const novoAgente = {
    id: idEstavel,
    nome: nomeInput,
    email: emailInput,
    dataAcesso: new Date().toLocaleString("pt-PT"),
  };

  // O histórico de acessos (para o painel admin) regista TODOS os logins,
  // incluindo repetidos — serve como registo de atividade, não de ranking.
  let agentesRegistados =
    JSON.parse(localStorage.getItem("agentes_registados")) || [];
  agentesRegistados.push(novoAgente);
  localStorage.setItem("agentes_registados", JSON.stringify(agentesRegistados));
  localStorage.setItem("agente_ativo", JSON.stringify(novoAgente));

  window.location.href = "treino.html";
}

function carregarHistoricoAgentes(termo = "") {
  const tabelaBody = document.getElementById("tabela-agentes-body");
  if (!tabelaBody) return;

  let agentes = JSON.parse(localStorage.getItem("agentes_registados")) || [];

  if (termo) {
    const t = termo.toLowerCase();
    agentes = agentes.filter(
      (a) =>
        (a.nome || "").toLowerCase().includes(t) ||
        (a.email || "").toLowerCase().includes(t),
    );
  }

  if (agentes.length === 0) {
    tabelaBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: #888; padding: 15px;">
          ${termo ? "Nenhum agente corresponde à pesquisa." : "Nenhum agente registrado no histórico até o momento."}
        </td>
      </tr>
    `;
    return;
  }

  tabelaBody.innerHTML = agentes
    .map((agente, index) => {
      const idExibicao = agente.id ? String(agente.id).slice(-4) : index + 1;

      return `
      <tr>
        <td><strong>#${idExibicao}</strong></td>
        <td>${escaparHTML(agente.nome)}</td>
        <td>${escaparHTML(agente.email)}</td>
        <td>${agente.dataAcesso || "Data não registrada"}</td>
      </tr>
    `;
    })
    .join("");
}

function escaparHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// --------------------------------------------------------------------------
// GERENCIAMENTO E EXIBIÇÃO DE SUGESTÕES (ENVIAR E CARREGAR)
// --------------------------------------------------------------------------

// 1. Ouvinte para capturar o envio do formulário em sugestoes.html
document.addEventListener("DOMContentLoaded", () => {
  const formSugestao = document.getElementById("form-sugestao");
  if (formSugestao) {
    formSugestao.addEventListener("submit", processarEnvioSugestao);
  }
});

// 2. Função para salvar a sugestão no localStorage e IndexedDB
function processarEnvioSugestao(event) {
  event.preventDefault();

  const nomeInput = document.getElementById("sug-nome");
  const textoInput = document.getElementById("sug-texto");

  const nome = nomeInput ? nomeInput.value.trim() : "";
  const texto = textoInput ? textoInput.value.trim() : "";

  if (!nome || !texto) {
    alert("Por favor, preencha todos os campos da sugestão.");
    return;
  }

  const novaSugestao = {
    id: Date.now(),
    autor: nome,
    texto: texto,
    data: new Date().toLocaleString("pt-PT"),
  };

  // Salva no localStorage para carregamento rápido
  let sugestoesSalvas =
    JSON.parse(localStorage.getItem("sugestoes_registadas")) || [];
  sugestoesSalvas.push(novaSugestao);
  localStorage.setItem("sugestoes_registadas", JSON.stringify(sugestoesSalvas));

  // Tenta salvar também no IndexedDB (se a store existir)
  const reqDB = indexedDB.open("CriminologiaDB", 2);
  reqDB.onsuccess = function (evt) {
    const db = evt.target.result;
    if (db.objectStoreNames.contains("sugestoes")) {
      const tx = db.transaction(["sugestoes"], "readwrite");
      tx.objectStore("sugestoes").add(novaSugestao);
    }
  };

  alert("Sugestão enviada com sucesso! Obrigado pela colaboração.");
  formSugestao.reset();
}

// 3. Função para carregar TUDO no Painel do Administrador
//    (histórico de agentes, sugestões e ranking de pontuações), já com
//    suporte a pesquisa/filtro em cada tabela.
function carregarDadosAdm() {
  carregarHistoricoAgentes();
  carregarTabelaSugestoes();
  carregarRankingAdmin();
  configurarFiltrosAdmin();
}

// 4. Renderização da Tabela de Sugestões no HTML do Painel Admin
function carregarTabelaSugestoes(termo = "") {
  const tabelaBody = document.getElementById("lista-sugestoes");
  if (!tabelaBody) return;

  let sugestoes =
    JSON.parse(localStorage.getItem("sugestoes_registadas")) || [];

  if (termo) {
    const t = termo.toLowerCase();
    sugestoes = sugestoes.filter(
      (s) =>
        (s.autor || "").toLowerCase().includes(t) ||
        (s.texto || "").toLowerCase().includes(t),
    );
  }

  if (sugestoes.length === 0) {
    tabelaBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: #888; padding: 15px;">
          ${termo ? "Nenhuma sugestão corresponde à pesquisa." : "Nenhuma sugestão recebida até o momento."}
        </td>
      </tr>
    `;
    return;
  }

  tabelaBody.innerHTML = sugestoes
    .map((sug, index) => {
      const idExibicao = sug.id ? String(sug.id).slice(-4) : index + 1;

      return `
      <tr>
        <td><strong>#${idExibicao}</strong></td>
        <td>${escaparHTML(sug.autor)}</td>
        <td>${escaparHTML(sug.texto)}</td>
        <td>${sug.data || "Data não registrada"}</td>
      </tr>
    `;
    })
    .join("");
}

// 5. Renderização do RANKING dentro do Painel Admin (com filtro por nome)
function carregarRankingAdmin(termo = "") {
  const tabelaBody = document.getElementById("tabela-ranking-admin");
  if (!tabelaBody) return;

  let agentes = JSON.parse(localStorage.getItem("ranking_agentes")) || [];

  if (termo) {
    const t = termo.toLowerCase();
    agentes = agentes.filter((a) => (a.nome || "").toLowerCase().includes(t));
  }

  agentes.sort((a, b) => b.pontos - a.pontos);

  if (agentes.length === 0) {
    tabelaBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: #888; padding: 15px;">
          ${termo ? "Nenhum agente corresponde à pesquisa." : "Ainda não há pontuações registadas."}
        </td>
      </tr>
    `;
    return;
  }

  tabelaBody.innerHTML = agentes
    .map(
      (agente, index) => `
      <tr>
        <td><strong>#${index + 1}</strong></td>
        <td>${escaparHTML(agente.nome)}</td>
        <td>${agente.pontos}</td>
        <td>${escaparHTML((agente.cadeiras || []).join(", "))}</td>
      </tr>
    `,
    )
    .join("");
}

// 6. Liga os campos de pesquisa de cada tabela do painel admin (se existirem)
function configurarFiltrosAdmin() {
  const filtroAgentes = document.getElementById("filtro-agentes");
  if (filtroAgentes && !filtroAgentes.dataset.ligado) {
    filtroAgentes.dataset.ligado = "1";
    filtroAgentes.addEventListener("input", (e) =>
      carregarHistoricoAgentes(e.target.value),
    );
  }

  const filtroSugestoes = document.getElementById("filtro-sugestoes");
  if (filtroSugestoes && !filtroSugestoes.dataset.ligado) {
    filtroSugestoes.dataset.ligado = "1";
    filtroSugestoes.addEventListener("input", (e) =>
      carregarTabelaSugestoes(e.target.value),
    );
  }

  const filtroRanking = document.getElementById("filtro-ranking");
  if (filtroRanking && !filtroRanking.dataset.ligado) {
    filtroRanking.dataset.ligado = "1";
    filtroRanking.addEventListener("input", (e) =>
      carregarRankingAdmin(e.target.value),
    );
  }
}

// --------------------------------------------------------------------------
// PÁGINA DE PONTUAÇÕES (pontuacoes.html) — leitura, filtro e atualização
// automática enquanto a página estiver aberta.
// --------------------------------------------------------------------------

// Calcula um "Nível Geral" simples a partir da pontuação acumulada.
function calcularNivelGeral(pontos) {
  if (pontos >= 3000) return "🥇 Avançado";
  if (pontos >= 1200) return "🥈 Intermédio";
  if (pontos > 0) return "🥉 Iniciante";
  return "—";
}

function carregarDados(termo = "") {
  let agentes = JSON.parse(localStorage.getItem("ranking_agentes")) || [];
  const tbody = document.getElementById("tabela-pontuacoes");

  if (!tbody) return; // Se não estiver na página de pontuações, ignora

  if (termo) {
    const t = termo.toLowerCase();
    agentes = agentes.filter((a) => (a.nome || "").toLowerCase().includes(t));
  }

  agentes.sort((a, b) => b.pontos - a.pontos);

  if (agentes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#888; padding:15px;">
          ${termo ? "Nenhum agente corresponde à pesquisa." : "Ainda não há pontuações registadas. Conclui uma disciplina em Treino para apareceres aqui."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = agentes
    .map(
      (agente, index) => `
      <tr>
        <td>${index + 1}º</td>
        <td>${escaparHTML(agente.nome)}</td>
        <td>${escaparHTML((agente.cadeiras || []).join(", "))}</td>
        <td>${agente.pontos}</td>
        <td>${calcularNivelGeral(agente.pontos)}</td>
      </tr>
    `,
    )
    .join("");
}

// Mantém a página de Pontuações "ao vivo".
// Duas camadas de sincronização:
//   1) localStorage + evento "storage" -> sincroniza abas/sessões dentro
//      do MESMO dispositivo (funciona mesmo sem internet).
//   2) Firebase Firestore (ver firebase-config.js) -> sincroniza o
//      ranking em TEMPO REAL entre telemóveis/computadores DIFERENTES,
//      porque os dados passam a viver num servidor e não apenas no
//      localStorage do dispositivo onde foram criados.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("tabela-pontuacoes")) return;

  // Mostra imediatamente o que já está em cache local (resposta instantânea,
  // mesmo offline), enquanto o Firebase carrega os dados atualizados.
  carregarDados(filtroPontuacoesAtual());

  window.addEventListener("storage", (e) => {
    if (e.key === "ranking_agentes") carregarDados(filtroPontuacoesAtual());
  });
  setInterval(() => carregarDados(filtroPontuacoesAtual()), 3000);

  const inputFiltroPontuacoes = document.getElementById("filtro-pontuacoes");
  if (inputFiltroPontuacoes) {
    inputFiltroPontuacoes.addEventListener("input", (e) =>
      carregarDados(e.target.value),
    );
  }

  // --- LIGAÇÃO AO FIREBASE (tempo real, entre qualquer dispositivo) ---
  // window.firebaseEscutarRanking é exposto por firebase-config.js
  // (carregado como <script type="module"> nas páginas relevantes).
  if (typeof window.firebaseEscutarRanking === "function") {
    window.firebaseEscutarRanking((listaDoFirebase) => {
      // Atualiza o cache local para que a página funcione offline também
      localStorage.setItem("ranking_agentes", JSON.stringify(listaDoFirebase));
      carregarDados(filtroPontuacoesAtual());
    });
  } else {
    console.warn(
      "Firebase não está disponível nesta página — a tabela de pontuações está a usar apenas o localStorage (não sincroniza entre dispositivos diferentes).",
    );
  }
});

function filtroPontuacoesAtual() {
  const input = document.getElementById("filtro-pontuacoes");
  return input ? input.value : "";
}

// --- FUNÇÃO PARA ATUALIZAR PONTUAÇÃO (chamada automaticamente em finalizarQuiz) ---
function atualizarProgresso(id, nome, pontosGanhos, cadeiraConcluida) {
  let agentes = JSON.parse(localStorage.getItem("ranking_agentes")) || [];
  let index = agentes.findIndex((u) => u.id === id);

  if (index !== -1) {
    agentes[index].pontos += pontosGanhos;
    agentes[index].nome = nome; // mantém o nome sempre atualizado
    if (!agentes[index].cadeiras.includes(cadeiraConcluida)) {
      agentes[index].cadeiras.push(cadeiraConcluida);
    }
  } else {
    agentes.push({
      id: id,
      nome: nome,
      pontos: pontosGanhos,
      cadeiras: [cadeiraConcluida],
    });
  }

  localStorage.setItem("ranking_agentes", JSON.stringify(agentes));
  carregarDados();

  // --- LIGAÇÃO AO FIREBASE (grava também no servidor, para todos os dispositivos) ---
  // window.firebaseAtualizarProgresso é exposto por firebase-config.js
  // (carregado como <script type="module"> em treino.html).
  if (typeof window.firebaseAtualizarProgresso === "function") {
    window.firebaseAtualizarProgresso(id, nome, pontosGanhos, cadeiraConcluida);
  } else {
    console.warn(
      "Firebase não está disponível nesta página — a pontuação só foi gravada no localStorage (não sincroniza entre dispositivos diferentes).",
    );
  }
} // ==========================================================================
// 1. GESTÃO DE PONTOS E PERSISTÊNCIA LOCAL (LocalStorage + JavaScript)
// ==========================================================================

// Estado global mantido na memória da página

// Carrega o estado salvo no navegador ao abrir qualquer página
function carregarEstadoSalvo() {
  const dadosSalvos = localStorage.getItem("estado_agente_atual");
  if (dadosSalvos) {
    estadoGlobal = JSON.parse(dadosSalvos);
    atualizarInterfaceSessao();
  }
}

// Guarda o estado no LocalStorage sempre que o utilizador ganha pontos
function salvarEstadoAtual() {
  localStorage.setItem("estado_agente_atual", JSON.stringify(estadoGlobal));
  sincronizarComRankingLocal();
}

// Atualiza o ranking de utilizadores guardado no dispositivo
function sincronizarComRankingLocal() {
  const agenteAtivo = JSON.parse(localStorage.getItem("agente_ativo")) || {
    id: "agente_local",
    nome: "Agente",
  };
  let ranking = JSON.parse(localStorage.getItem("ranking_agentes")) || [];

  const indice = ranking.findIndex((item) => item.id === agenteAtivo.id);
  const dadosAgente = {
    id: agenteAtivo.id,
    nome: agenteAtivo.nome || "Agente",
    pontos: estadoGlobal.pontuacaoTotal,
    concluidas: estadoGlobal.disciplinasConcluidas,
    dataAtualizacao: new Date().toISOString(),
  };

  if (indice !== -1) {
    ranking[indice] = dadosAgente;
  } else {
    ranking.push(dadosAgente);
  }

  // Ordena do maior para o menor resultado
  ranking.sort((a, b) => b.pontos - a.pontos);
  localStorage.setItem("ranking_agentes", JSON.stringify(ranking));
}

// Atualiza os elementos visuais da interface
function atualizarInterfaceSessao() {
  const elemScore = document.getElementById("score-display");
  const elemCompleted = document.getElementById("completed-display");
  const elemAccuracy = document.getElementById("accuracy-display");

  if (elemScore) elemScore.textContent = estadoGlobal.pontuacaoTotal;
  if (elemCompleted)
    elemCompleted.textContent = estadoGlobal.disciplinasConcluidas;

  if (elemAccuracy) {
    const total =
      estadoGlobal.respostasCertasTotais + estadoGlobal.respostasErradasTotais;
    const precisao =
      total > 0
        ? Math.round((estadoGlobal.respostasCertasTotais / total) * 100)
        : 0;
    elemAccuracy.textContent = `${precisao}%`;
  }
}

// ==========================================================================
// 2. APAGAR PONTUAÇÃO (Apenas por ação direta e manual do utilizador)
// ==========================================================================

function apagarMinhaPontuacao() {
  const confirmacao = confirm(
    "Tens a certeza de que desejas apagar todo o teu progresso? Esta ação não pode ser desfeita.",
  );

  if (confirmacao) {
    // Limpa a memória local
    estadoGlobal = {
      pontuacaoTotal: 0,
      respostasCertasTotais: 0,
      respostasErradasTotais: 0,
      disciplinasConcluidas: 0,
    };

    // Remove do armazenamento permanente
    localStorage.removeItem("estado_agente_atual");

    // Remove o registo do ranking local
    const agenteAtivo = JSON.parse(localStorage.getItem("agente_ativo"));
    if (agenteAtivo && agenteAtivo.id) {
      let ranking = JSON.parse(localStorage.getItem("ranking_agentes")) || [];
      ranking = ranking.filter((item) => item.id !== agenteAtivo.id);
      localStorage.setItem("ranking_agentes", JSON.stringify(ranking));
    }

    atualizarInterfaceSessao();
    alert("O teu progresso foi eliminado com sucesso.");
    location.reload();
  }
}


// ==========================================================================
// 4. INICIALIZAÇÃO DA PÁGINA
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  carregarEstadoSalvo();

  // Atualiza automaticamente o ecrã se o utilizador tiver a aba do ranking aberta
  window.addEventListener("storage", (e) => {
    if (e.key === "estado_agente_atual" || e.key === "ranking_agentes") {
      carregarEstadoSalvo();
    }
  });
});
// Exemplo: O utilizador acabou de fazer a disciplina 'criminologia_1' e fez 8 pontos de 10
const idDaDisciplinaAtual = "criminologia_geral";
const nomeDaDisciplina = "Criminologia Geral";
const pontosObtidos = 8;
const totalQuestoes = 10;

// Esta linha garante que a pontuação antiga é substituída se for a mesma disciplina,
// mas mantida intacta se for outra disciplina!
salvarPontuacaoDisciplina(
  idDaDisciplinaAtual,
  nomeDaDisciplina,
  pontosObtidos,
  totalQuestoes,
);

// ==========================================================================
// PERSISTÊNCIA INTELIGENTE POR DISCIPLINA (Sem perder pontos ao sair)
// ==========================================================================

// 1. Função para guardar a pontuação quando o utilizador termina uma disciplina
function salvarPontuacaoDisciplina(
  idDisciplina,
  nomeDisciplina,
  novaPontuacao,
  totalPerguntas,
) {
  // Busca o histórico existente ou cria um objeto novo se não existir
  let historicoDisciplinas =
    JSON.parse(localStorage.getItem("historico_pontuacoes")) || {};

  // Sobrescreve (ou cria) APENAS a pontuação desta disciplina específica
  historicoDisciplinas[idDisciplina] = {
    nome: nomeDisciplina,
    pontos: novaPontuacao,
    total: totalPerguntas,
    percentual: Math.round((novaPontuacao / totalPerguntas) * 100),
    data: new Date().toLocaleDateString("pt-PT"),
  };

  // Salva de volta no armazenamento permanente do navegador
  localStorage.setItem(
    "historico_pontuacoes",
    JSON.stringify(historicoDisciplinas),
  );
}

// 2. Função para carregar a pontuação de uma disciplina específica na página de treino
function obterUltimaPontuacao(idDisciplina) {
  const historico =
    JSON.parse(localStorage.getItem("historico_pontuacoes")) || {};
  return historico[idDisciplina] || null; // Retorna os dados ou null se nunca fez
}

// 3. Função para renderizar a lista de pontuações na página "pontuacoes.html"
function exibirTodasAsPontuacoes() {
  const container = document.getElementById("lista-pontuacoes");
  if (!container) return;

  const historico =
    JSON.parse(localStorage.getItem("historico_pontuacoes")) || {};
  const chaves = Object.keys(historico);

  if (chaves.length === 0) {
    container.innerHTML = "<p>Ainda não concluíste nenhuma disciplina.</p>";
    return;
  }

  let html = "<ul>";
  chaves.forEach((id) => {
    const item = historico[id];
    html += `
      <li>
        <strong>${item.nome}:</strong> ${item.pontos}/${item.total} pts (${item.percentual}%) 
        <small>- Última tentativa: ${item.data}</small>
      </li>
    `;
  });
  html += "</ul>";

  container.innerHTML = html;
}

// Carregar automaticamente as pontuações ao abrir a página de histórico
document.addEventListener("DOMContentLoaded", () => {
  exibirTodasAsPontuacoes();
});
// --- AO FAZER LOGIN COM SUCESSO ---
function aoFazerLogin(dadosDoUsuario) {
  // Salva na base local do navegador
  localStorage.setItem("usuario_logado", JSON.stringify(dadosDoUsuario));

  // Redireciona para o painel principal
  window.location.href = "dashboard.html";
}

// --- AO ABRIR O APP OU PÁGINA DE LOGIN ---
document.addEventListener("DOMContentLoaded", () => {
  const usuarioSalvo = localStorage.getItem("usuario_logado");

  // Se já existirem dados salvos, pula a tela de login
  if (usuarioSalvo) {
    window.location.href = "dashboard.html";
  }
});

/* ==========================================================================
   M-CRIMINOLOGIA - ESTRUTURA DE DADOS E LÓGICA DO SISTEMA (CORRIGIDO)
   ========================================================================== */

const BANCO_DE_DADOS = [
  {
    id: "mod-1",
    titulo: "Nível 1: Fundamentos",
    disciplinas: [
      // 1. INTRODUÇÃO À CRIMINOLOGIA
      {
        id: "intro-criminologia",
        nome: "Introdução à Criminologia",
        questoes: [
          {
            id: 1,
            pergunta: "Qual é o objeto de estudo da Criminologia moderna?",
            opcoes: [
              "O crime, a pena, o criminoso e o tribunal.",
              "A lei penal, o processo penal, a polícia e a prisão.",
              "O crime, o delinquente, a vítima e o controlo social.",
              "A conduta desviante, a motivação, a prova e a sentença.",
            ],
            respostaCorreta: 2,
            dica: "Pense nos elementos que vão além do infrator e da norma escrita.",
            justificativa:
              "A Criminologia moderna expandiu o seu objeto tradicional para abranger não apenas o delito e o criminoso, mas também a vítima e os mecanismos de controlo social.",
          },
          {
            id: 2,
            pergunta:
              "A Criminologia é classificada metodologicamente como uma ciência:",
            opcoes: [
              "Empírica e interdisciplinar.",
              "Normativa e dogmática.",
              "Especulativa e abstrata.",
              "Exclusivamente dedutiva.",
            ],
            respostaCorreta: 0,
            dica: "Baseia-se na observação da realidade e no diálogo com várias áreas do saber.",
            justificativa:
              "A Criminologia é uma ciência do 'ser' (empírica), baseada na observação da realidade social, e interdisciplinar por integrar conhecimentos da sociologia, psicologia e direito.",
          },
          {
            id: 3,
            pergunta:
              "O conceito de 'Cifra Negra' na Criminologia refere-se a:",
            opcoes: [
              "Crimes praticados no ambiente digital ou cibernético.",
              "A percentagem de crimes violentos com pena de prisão efetiva.",
              "Crimes cometidos por organizações criminosas de grande porte.",
              "A diferença entre a criminalidade real e a criminalidade registada pelas autoridades.",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se com infrações que nunca chegam ao conhecimento estatístico oficial.",
            justificativa:
              "Cifra Negra representa o volume de infrações penais efetivamente cometidas que não chegam ao conhecimento oficial do Estado.",
          },
          {
            id: 4,
            pergunta:
              "Qual é a principal função da prevenção primária do delito?",
            opcoes: [
              "Atuar no momento em que a infração está prestes a ocorrer.",
              "Atuar nas causas estruturais do crime (educação, habitação, emprego).",
              "Reabilitar o recluso para evitar a reincidência.",
              "Aumentar o efetivo policial nos centros urbanos.",
            ],
            respostaCorreta: 1,
            dica: "Foca-se nas origens sociais e na base da comunidade.",
            justificativa:
              "A prevenção primária foca-se na raiz do problema, aplicando políticas sociais, educativas e económicas para criar condições que desestimulem a criminalidade.",
          },
          {
            id: 5,
            pergunta:
              "A prevenção secundária da criminalidade atua diretamente sobre:",
            opcoes: [
              "Grupos de risco e zonas urbanas de alta vulnerabilidade.",
              "A população prisional já condenada.",
              "A criação de novas leis penais mais severas.",
              "As vítimas de crimes violentos após o trauma.",
            ],
            respostaCorreta: 0,
            dica: "Atua quando e onde o risco de criminalidade é iminente ou focalizado.",
            justificativa:
              "A prevenção secundária orienta-se para setores específicos, grupos vulneráveis ou locais onde o crime se manifesta com maior frequência.",
          },
          {
            id: 6,
            pergunta: "O modelo de controlo social informal é exercido por:",
            opcoes: [
              "Polícia, Ministério Público e Tribunais.",
              "Sistema penitenciário e agentes de execução.",
              "Família, escola, igreja e comunidade.",
              "Leis e regulamentos administrativos.",
            ],
            respostaCorreta: 2,
            dica: "Instituições socioculturais sem poder de sanção penal formal.",
            justificativa:
              "O controlo social informal é desempenhado pelas instâncias da sociedade civil que transmitem valores, normas e padrões de conduta.",
          },
          {
            id: 7,
            pergunta: "A Vitimologia emergiu como campo autónomo para estudar:",
            opcoes: [
              "Apenas a indemnização financeira às vítimas.",
              "Os métodos de interrogatório de testemunhas.",
              "A responsabilidade civil exclusiva do infrator.",
              "A personalidade, o papel sociológico e a vitimização do indivíduo afetado.",
            ],
            respostaCorreta: 3,
            dica: "Centra-se na pessoa que sofre o impacto direto ou indireto do delito.",
            justificativa:
              "A Vitimologia analisa o papel da vítima na génese do delito, os seus direitos, o processo de vitimização e a sua recuperação.",
          },
          {
            id: 8,
            pergunta:
              "A 'vitimização secundária' (ou redivitimização) ocorre quando:",
            opcoes: [
              "A vítima sofre um segundo crime do mesmo autor.",
              "A vítima é submetida a sofrimento adicional pelas instâncias formais de controlo (ex: interrogatórios insensíveis).",
              "A família da vítima sofre impactos financeiros.",
              "A comunidade rejeita o regresso da vítima.",
            ],
            respostaCorreta: 1,
            dica: "Resulta do mau atendimento ou desgaste no próprio sistema de justiça.",
            justificativa:
              "A vitimização secundária resulta do tratamento inadequado ou burocrático infligido às vítimas pelas instituições de aplicação da lei e pela justiça.",
          },
          {
            id: 9,
            pergunta:
              "O princípio da interdisciplinaridade implica que a Criminologia:",
            opcoes: [
              "Combine métodos da Sociologia, Psicologia, Medicina Legal e Direito.",
              "Substitua o Direito Penal na definição de crimes.",
              "Dependa exclusivamente de estatísticas policiais.",
              "Seja uma subdisciplina do Direito Processual Penal.",
            ],
            respostaCorreta: 0,
            dica: "Integração de múltiplos saberes científicos.",
            justificativa:
              "A Criminologia coordena conhecimentos de diversas áreas para obter um diagnóstico integral do fenómeno criminal.",
          },
          {
            id: 10,
            pergunta:
              "Diferente do Direito Penal, a Criminologia orienta-se pelo método:",
            opcoes: [
              "Dedutivo e normativo.",
              "Lógico-abstrato.",
              "Indutivo e empírico.",
              "Dogmático e formal.",
            ],
            respostaCorreta: 2,
            dica: "Parte dos factos e dados da realidade para formular teorias.",
            justificativa:
              "Enquanto o Direito Penal opera com regras abstratas e dedução (dever-ser), a Criminologia analisa os factos concretos através da indução e observação (ser).",
          },
          {
            id: 11,
            pergunta:
              "A Teoria da Anomia de Robert Merton explica a conduta desviante como resultado de:",
            opcoes: [
              "Anomalias genéticas do indivíduo.",
              "Discrepância entre metas culturais e os meios legítimos para alcançá-las.",
              "Falta de policiamento nas áreas urbanas.",
              "Processos de aprendizagem em subculturas.",
            ],
            respostaCorreta: 1,
            dica: "Tensão entre o sucesso desejado e as oportunidades reais.",
            justificativa:
              "Merton argumenta que a anomia surge quando a estrutura social exige o sucesso, mas limita o acesso aos meios legítimos para a maioria das pessoas.",
          },
          {
            id: 12,
            pergunta:
              "A Teoria da Associação Diferencial de Edwin Sutherland defende que o comportamento criminoso é:",
            opcoes: [
              "Hereditário e biologicamente determinado.",
              "Um reflexo involuntário de perturbações mentais.",
              "Causado unicamente pela pobreza.",
              "Aprendido em interação com outros através de processos de comunicação.",
            ],
            respostaCorreta: 3,
            dica: "O crime aprende-se tal como qualquer outra conduta social.",
            justificativa:
              "Sutherland afirma que a conduta criminosa é assimilada mediante contacto com valores e modelos de comportamento delinquentes.",
          },
          {
            id: 13,
            pergunta:
              "A Teoria da Etiquetagem (Labeling Approach) foca-se essencialmente:",
            opcoes: [
              "Nos processos de reação social e na definição do indivíduo como 'desviante'.",
              "Nas características biológicas do criminoso.",
              "Na melhoria das penas privativas de liberdade.",
              "No cálculo de custo-benefício efetuado pelo criminoso.",
            ],
            respostaCorreta: 0,
            dica: "Analisa o impacto do rótulo atribuído pelo sistema de justiça.",
            justificativa:
              "O Labeling Approach sustenta que o desvio não é uma qualidade intrínseca do ato, mas uma etiqueta atribuída pelo controlo social.",
          },
          {
            id: 14,
            pergunta: "O modelo de Justiça Restaurativa prioriza:",
            opcoes: [
              "A punição severa do infrator para dar exemplo à sociedade.",
              "O aumento da capacidade das prisões.",
              "A reparação dos danos à vítima e a restauração da harmonia comunitária.",
              "A aceleração dos processos judiciais sem ouvir a vítima.",
            ],
            respostaCorreta: 2,
            dica: "Solução focada na mediação, diálogo e reparação.",
            justificativa:
              "A Justiça Restaurativa procura resolver o conflito envolvendo vítima, infrator e comunidade na procura de reparação e reconciliação.",
          },
          {
            id: 15,
            pergunta: "A prevenção terciária destina-se a:",
            opcoes: [
              "Evitar que jovens entrem na marginalidade.",
              "Evitar a reincidência e promover a reintegração social do condenado.",
              "Aumentar a iluminação pública em locais escuros.",
              "Criar campanhas educativas nos meios de comunicação.",
            ],
            respostaCorreta: 1,
            dica: "Fase pós-delito voltada para o indivíduo que já cumpriu ou cumpre pena.",
            justificativa:
              "A prevenção terciária atua diretamente sobre o recluso/egresso do sistema prisional para evitar o seu regresso ao crime.",
          },
        ],
      },

      // 2. HISTÓRIA DA CRIMINOLOGIA
      {
        id: "historia-criminologia",
        nome: "História da Criminologia",
        questoes: [
          {
            id: 1,
            pergunta:
              "Quem é considerado o pai da Escola Clássica do Direito Penal e Criminologia?",
            opcoes: [
              "Cesare Beccaria.",
              "Cesare Lombroso.",
              "Enrico Ferri.",
              "Raffaele Garofalo.",
            ],
            respostaCorreta: 0,
            dica: "Autor da célebre obra 'Dos Delitos e das Penas' (1764).",
            justificativa:
              "Cesare Beccaria estruturou o pensamento clássico focado na legalidade, proporcionalidade e livre-arbítrio.",
          },
          {
            id: 2,
            pergunta:
              "A Escola Positiva italiana teve como principal expoente biológico:",
            opcoes: [
              "Cesare Beccaria.",
              "Jeremy Bentham.",
              "Cesare Lombroso.",
              "Franz von Liszt.",
            ],
            respostaCorreta: 2,
            dica: "Autor de 'L'Uomo Delinquente' e defensor do atavismo.",
            justificativa:
              "Cesare Lombroso liderou a vertente antropométrica/biológica da Escola Positiva no século XIX.",
          },
          {
            id: 3,
            pergunta:
              "O conceito de 'atavismo' na teoria de Lombroso refere-se a:",
            opcoes: [
              "Uma escolha racional de cometer o crime.",
              "Um regresso ou regressão a estágios evolutivos anteriores da espécie humana.",
              "Um distúrbio de aprendizagem decorrente do meio social.",
              "A influência do clima e da geografia sobre a conduta.",
            ],
            respostaCorreta: 1,
            dica: "Ideia de um indivíduo que nasce com traços primitivos.",
            justificativa:
              "Lombroso acreditava que o 'criminoso nato' representava um atavismo, um ser primitivo e não totalmente desenvolvido.",
          },
          {
            id: 4,
            pergunta:
              "Enrico Ferri destacou-se na Escola Positiva por introduzir com força os fatores:",
            opcoes: [
              "Exclusivamente genéticos.",
              "Religiosos e morais.",
              "Digitais e tecnológicos.",
              "Sociais, económicos e ambientais (Sociologia Criminal).",
            ],
            respostaCorreta: 3,
            dica: "Expande a visão de Lombroso para além do corpo do indivíduo.",
            justificativa:
              "Ferri sistematizou os fatores determinantes do crime em individuais, físicos e sociais, fundando a Sociologia Criminal.",
          },
          {
            id: 5,
            pergunta:
              "Raffaele Garofalo formulou a teoria do 'Crime Natural', baseada na violação de sentimentos de:",
            opcoes: [
              "Piedade e probidade.",
              "Honra e propriedade.",
              "Patriotismo e lealdade.",
              "Religião e família.",
            ],
            respostaCorreta: 0,
            dica: "Sentimentos éticos básicos presentes nas sociedades civilizadas.",
            justificativa:
              "Garofalo definiu o crime natural como a ofensa aos sentimentos altruístas fundamentais de piedade e probidade.",
          },
          {
            id: 6,
            pergunta:
              "O Panóptico, conceito de arquitetura prisional e controlo social, foi desenhado por:",
            opcoes: [
              "Cesare Beccaria.",
              "Michel Foucault.",
              "Jeremy Bentham.",
              "Auguste Comte.",
            ],
            respostaCorreta: 2,
            dica: "Filósofo utilitarista inglês.",
            justificativa:
              "Jeremy Bentham concebeu o Panóptico, estrutura circular que permite a observação contínua de todos os reclusos a partir de um ponto central.",
          },
          {
            id: 7,
            pergunta:
              "Qual das alternativas sintetiza a premissa da Escola Clássica sobre o criminoso?",
            opcoes: [
              "O criminoso é um doente determinado pela sua biologia.",
              "O indivíduo comete crimes devido ao seu livre-arbítrio e cálculo utilitário.",
              "O crime é consequência direta do capitalismo.",
              "A criminalidade resulta de perturbações do inconsciente.",
            ],
            respostaCorreta: 1,
            dica: "Pressupõe a liberdade moral de escolha do ser humano.",
            justificativa:
              "A Escola Clássica assenta na ideia do livre-arbítrio: o ser humano escolhe o crime se o ganho parecer superior ao custo da pena.",
          },
          {
            id: 8,
            pergunta:
              "Diferente da Escola Clássica, a Escola Positiva substituiu o conceito de responsabilidade moral por:",
            opcoes: [
              "Isenção total de pena.",
              "Julgamento exclusivamente religioso.",
              "Indemnização automática à vítima.",
              "Perigosidade social e responsabilidade social.",
            ],
            respostaCorreta: 3,
            dica: "Mede o grau de risco que o indivíduo representa para a sociedade.",
            justificativa:
              "Os positivistas viam o criminoso como determinado; logo, a sanção visava conter a sua perigosidade social.",
          },
          {
            id: 9,
            pergunta:
              "A Escola de Chicago (anos 1920-1930) inovou no estudo da Criminologia ao utilizar:",
            opcoes: [
              "Estudos ecológicos e sociologia urbana para analisar áreas de desorganização social.",
              "Experiências de laboratório com animais.",
              "Análise de DNA e genética populacional.",
              "Interrogatórios sob hipnose.",
            ],
            respostaCorreta: 0,
            dica: "Focou-se na estrutura e crescimento das cidades.",
            justificativa:
              "A Escola de Chicago mapeou a expansão urbana e identificou zonas ecológicas com elevados índices de desorganização social.",
          },
          {
            id: 10,
            pergunta:
              "A Criminologia Crítica (ou Radical), surgida nos anos 1960/70, fundamenta a sua análise no:",
            opcoes: [
              "Estudo dos traços faciais do criminoso.",
              "Aumento da severidade das penas corporais.",
              "Materialismo histórico e nas desigualdades de poder e classe do capitalismo.",
              "Determinismo biológico avançado.",
            ],
            respostaCorreta: 2,
            dica: "Analisa quem faz as leis e a quem serve o sistema penal.",
            justificativa:
              "A Criminologia Crítica questiona o próprio direito penal, vendo-o como instrumento de manutenção de poder das classes dominantes.",
          },
          {
            id: 11,
            pergunta:
              "Qual das seguintes obras é considerada o marco fundacional da Criminologia Positiva?",
            opcoes: [
              "Dos Delitos e das Penas (Beccaria).",
              "O Homem Delinquente (Lombroso).",
              "Vigiar e Punir (Foucault).",
              "O Espírito das Leis (Montesquieu).",
            ],
            respostaCorreta: 1,
            dica: "Publicada em 1876, focou-se nos estigmas físicos.",
            justificativa:
              "'L'Uomo Delinquente' de Lombroso (1876) marcou o nascimento oficial da Criminologia positivista.",
          },
          {
            id: 12,
            pergunta:
              "A doutrina do 'Determinismo' defendida pela Escola Positiva contrapõe-se ao conceito clássico de:",
            opcoes: [
              "Livre-arbítrio.",
              "Legalidade.",
              "Tipicidade.",
              "Humanidade das penas.",
            ],
            respostaCorreta: 0,
            dica: "Ideia de que o ser humano decide livremente as suas ações.",
            justificativa:
              "O determinismo nega a liberdade total de escolha, afirmando que a conduta é moldada por fatores biológicos, psíquicos ou sociais.",
          },
          {
            id: 13,
            pergunta:
              "Michel Foucault, na sua obra 'Vigiar e Punir', analisa a transição do suplício corporal para:",
            opcoes: [
              "A pena de banimento voluntário.",
              "A abolição total do sistema penal.",
              "A aplicação exclusiva de multas.",
              "A disciplina e o controlo do tempo e corpo nas prisões modernas.",
            ],
            respostaCorreta: 3,
            dica: "Analisa a emergência da instituição prisional como centro disciplinar.",
            justificativa:
              "Foucault demonstra como o poder punitivo deixou de focar na tortura do corpo para focar na disciplina da mente e da rotina.",
          },
          {
            id: 14,
            pergunta:
              "O movimento de 'Defesa Social', pós-Segunda Guerra Mundial, procurou:",
            opcoes: [
              "Retornar às penas de morte públicas.",
              "Eliminar os advogados de defesa do processo.",
              "Humanizar o Direito Penal e promover a ressocialização do criminoso.",
              "Privatizar integralmente as prisões.",
            ],
            respostaCorreta: 2,
            dica: "Procura equilibrar a proteção da sociedade com os direitos do infrator.",
            justificativa:
              "A Nova Defesa Social enfatizou a dignidade humana, a prevenção e a reabilitação em vez da mera punição.",
          },
          {
            id: 15,
            pergunta:
              "A Teoria das Janelas Partidas (Broken Windows Theory), desenvolvida nos anos 1980, sustenta que:",
            opcoes: [
              "O crime é causado unicamente por defeitos genéticos.",
              "A desordem e pequenos delitos não punidos geram um ambiente favorável a crimes mais graves.",
              "A construção de mais prisões reduz automaticamente o crime.",
              "As penas devem ser abolidas em bairros pobres.",
            ],
            respostaCorreta: 1,
            dica: "Se uma janela partida não for reparada, logo todas as outras estarão partidas.",
            justificativa:
              "Wilson e Kelling argumentaram que a negligência urbana e a desordem visível transmitem a mensagem de ausência de autoridade, atraindo a criminalidade.",
          },
        ],
      },

      // 3. HISTÓRIA DO DIREITO E DO PENSAMENTO JURÍDICO
      {
        id: "historia-direito",
        nome: "História do Direito e do Pensamento Jurídico",
        questoes: [
          {
            id: 1,
            pergunta:
              "O Código de Hamurábi (Mesopotâmia) é historicamente famoso pela aplicação da:",
            opcoes: [
              "Lei do Perdão.",
              "Lei do Talião ('Olho por olho, dente por dente').",
              "Presunção de inocência.",
              "Liberdade condicional.",
            ],
            respostaCorreta: 1,
            dica: "Proporcionalidade física estrita entre o dano e a punição.",
            justificativa:
              "O Código de Hamurábi codificou a retribuição exata da Lei do Talião no Direito Antigo.",
          },
          {
            id: 2,
            pergunta:
              "Qual civilização antiga contribuiu decisivamente para a criação dos conceitos de 'Iurisprudentia' e codificação civil sistematizada?",
            opcoes: ["Romana.", "Egípcia.", "Fenícia.", "Persa."],
            respostaCorreta: 0,
            dica: "Base da tradição jurídica ocidental de Direito Civil (Civil Law).",
            justificativa:
              "O Direito Romano (Compilação de Justiniano/Corpus Iuris Civilis) constitui a espinha dorsal do pensamento jurídico ocidental.",
          },
          {
            id: 3,
            pergunta:
              "A Lei das XII Tábuas é tida como o marco fundacional do direito escrito na:",
            opcoes: [
              "Grécia Clássica.",
              "Europa Medieval.",
              "Roma Antiga.",
              "Babilónia.",
            ],
            respostaCorreta: 2,
            dica: "Primeiro código escrito da República Romana.",
            justificativa:
              "As XII Tábuas (450 a.C.) garantiram publicidade às leis e limitaram o arbítrio dos patrícios sobre os plebeus.",
          },
          {
            id: 4,
            pergunta:
              "O Jusnaturalismo defende a existência de um Direito Natural que é:",
            opcoes: [
              "Criado exclusivamente pela vontade do Estado.",
              "Modificado diariamente pelos tribunais.",
              "Válido apenas para uma determinada nação.",
              "Anterior, superior e independente do direito positivo escrito.",
            ],
            respostaCorreta: 3,
            dica: "Fundamenta-se na razão, na natureza humana ou na ordem divina.",
            justificativa:
              "O Jusnaturalismo sustenta a existência de direitos universais e imutáveis válidos por si mesmos.",
          },
          {
            id: 5,
            pergunta:
              "O Juspositivismo (Positivismo Jurídico) caracteriza-se por:",
            opcoes: [
              "Considerar válidas apenas as leis que correspondem à moral divina.",
              "Separar o Direito da Moral e reconhecer como norma válida aquela produzida pelo Estado.",
              "Permitir que o juiz crie leis livremente.",
              "Negar a existência de constituições escritas.",
            ],
            respostaCorreta: 1,
            dica: "Validade formal da norma posta pela autoridade competente.",
            justificativa:
              "O Positivismo Jurídico foca-se na norma válida produzida pelo poder soberano (Direito Positivo), independentemente do seu valor moral.",
          },
          {
            id: 6,
            pergunta:
              "A Magna Carta de 1215, assinada na Inglaterra pelo Rei João Sem-Terra, é um marco para:",
            opcoes: [
              "A limitação do poder real e as garantias do devido processo legal (Due Process).",
              "O poder absoluto dos reis.",
              "A criação do sistema feudal.",
              "A abolição total da propriedade privada.",
            ],
            respostaCorreta: 0,
            dica: "Impediu que o monarca tributasse ou prendesse nobres sem julgamento formal.",
            justificativa:
              "A Magna Carta estabeleceu o princípio de que até o soberano está submetido à lei e assegurou julgamento justo aos homens livres.",
          },
          {
            id: 7,
            pergunta:
              "No contexto medieval, as 'Ordalias' ou 'Juízos de Deus' eram:",
            opcoes: [
              "Julgamentos baseados em provas periciais e autópsias.",
              "Debates académicos entre juristas e teólogos.",
              "Provas físicas dolorosas ou perigosas cuja sobrevivência invocava a intervenção divina.",
              "Recursos apresentados diretamente ao Papa.",
            ],
            respostaCorreta: 2,
            dica: "Testes de fogo ou água para apurar a culpa.",
            justificativa:
              "As ordalias submetiam o acusado a perigos físicos; a cicatrização ou sobrevivência era vista como prova de inocência por milagre divino.",
          },
          {
            id: 8,
            pergunta:
              "O movimento de Codificação do Século XIX teve como seu maior símbolo:",
            opcoes: [
              "O Código Penal Prussiano.",
              "O Digesto de Justiniano.",
              "As Ordenações Filipinas.",
              "O Código Civil Napoleónico (1804).",
            ],
            respostaCorreta: 3,
            dica: "Código promulgado em França que unificou o direito civil europeu.",
            justificativa:
              "O Code Civil francês de 1804 consolidou os valores da Revolução Francesa e serviu de modelo para a Europa e América Latina.",
          },
          {
            id: 9,
            pergunta:
              "Hans Kelsen é amplamente reconhecido no pensamento jurídico pela formulação da:",
            opcoes: [
              "Teoria Pura do Direito e da Pirâmide Normativa.",
              "Teoria Tridimensional do Direito.",
              "Escola do Direito Livre.",
              "Teoria do Delito Natural.",
            ],
            respostaCorreta: 0,
            dica: "Hierarquia de normas encabeçada pela Norma Fundamental.",
            justificativa:
              "Kelsen propôs expurgar o Direito de elementos sociológicos e morais, estruturando a validade das normas numa hierarquia piramidal.",
          },
          {
            id: 10,
            pergunta:
              "A Teoria Tridimensional do Direito, desenvolvida pelo jurista Miguel Reale, concebe o Direito como a integração de:",
            opcoes: [
              "Estado, Sociedade e Indivíduo.",
              "Lei, Doutrina e Jurisprudência.",
              "Facto, Valor e Norma.",
              "Crime, Pena e Processo.",
            ],
            respostaCorreta: 2,
            dica: "Três elementos constitutivos que se inter-relacionam continuamente.",
            justificativa:
              "A visão tridimensional sustenta que o Direito surge quando um facto social ganha um valor moral que resulta numa norma jurídica.",
          },
          {
            id: 11,
            pergunta:
              "O sistema jurídico da Common Law (tradição anglo-saxónica) baseia-se prioritariamente:",
            opcoes: [
              "Em códigos escritos extensos aprovados pelo Parlamento.",
              "Em precedentes judiciais (stare decisis) e costumes.",
              "Na vontade unilateral do Chefe de Estado.",
              "Em manuais teóricos universitários.",
            ],
            respostaCorreta: 1,
            dica: "Jurisprudência criada pelas decisões dos tribunais ao longo do tempo.",
            justificativa:
              "Na Common Law, a principal fonte do direito são as decisões judiciais anteriores que vinculam os julgamentos futuros.",
          },
          {
            id: 12,
            pergunta:
              "O Iluminismo Jurídico do século XVIII combateu vigorosamente:",
            opcoes: [
              "A igualdade perante a lei.",
              "A criação de constituições escritas.",
              "O julgamento por júri popular.",
              "As torturas, penas cruéis e o arbítrio judicial do Absolutismo.",
            ],
            respostaCorreta: 3,
            dica: "Pensadores como Voltaire, Montesquieu e Beccaria.",
            justificativa:
              "O Iluminismo promoveu a racionalidade, a proporcionalidade das penas e as garantias individuais contra a arbitrariedade do Estado.",
          },
          {
            id: 13,
            pergunta:
              "O Tribunal de Nuremberga (1945-1946) representou uma viragem no pensamento jurídico por:",
            opcoes: [
              "Consolidar a responsabilidade penal internacional e a prevalência dos Direitos Humanos sobre normas estatais ilegítimas.",
              "Confirmar o positivismo estrito ('A lei é a lei').",
              "Abolir os julgamentos para crimes de guerra.",
              "Submeter todos os países ao direito romano.",
            ],
            respostaCorreta: 0,
            dica: "Julgamento dos crimes nazistas e limitação da obediência cega à lei formal.",
            justificativa:
              "Nuremberga demonstrou que leis estatais que violem a humanidade perdem validade moral e jurídica perante o Direito Internacional.",
          },
          {
            id: 14,
            pergunta:
              "O conceito de Estado de Direito (Rechtsstaat) implica essencialmente:",
            opcoes: [
              "O governo absoluto de um soberano sem limitações constitucionais.",
              "A prevalência dos costumes locais sobre as leis escritas.",
              "A submissão de todos, incluindo o próprio Estado, ao império da lei.",
              "A ausência total de leis ou regulamentos formais.",
            ],
            respostaCorreta: 2,
            dica: "Ninguém está acima da lei, nem mesmo a autoridade que a promulga.",
            justificativa:
              "O Estado de Direito estabelece que a atuação do Poder Público é limitada pelas leis e garante direitos fundamentais aos cidadãos.",
          },
          {
            id: 15,
            pergunta:
              "O princípio da Legalidade Penal ('Nullum crimen, nulla poena sine lege') estabelece que:",
            opcoes: [
              "O juiz pode criar novos crimes com base na moral comunitária.",
              "Não há crime nem pena sem lei anterior que os defina.",
              "A pena pode ser aplicada retroativamente para prejudicar o réu.",
              "Qualquer conduta imoral é automaticamente considerada infração penal.",
            ],
            respostaCorreta: 1,
            dica: "Exige lei prévia e escrita para punir uma conduta.",
            justificativa:
              "Garantia fundamental do cidadão de que só será punido por conduta previamente tipificada em lei anterior ao facto.",
          },
        ],
      },

      // 3. HISTÓRIA DO DIREITO E DO PENSAMENTO JURÍDICO (versão alternativa - duplicado no ficheiro original)
      {
        id: "historia-direito-2",
        nome: "História do Direito e do Pensamento Jurídico",
        questoes: [
          {
            id: 1,
            pergunta:
              "O Código de Hamurábi (Mesopotâmia) é historicamente famoso pela aplicação da:",
            opcoes: [
              "Lei do Perdão.",
              "Presunção de inocência.",
              "Lei do Talião ('Olho por olho, dente por dente').",
              "Liberdade condicional.",
            ],
            respostaCorreta: 2,
            dica: "Proporcionalidade física estrita entre o dano e a punição.",
            justificativa:
              "O Código de Hamurábi codificou a retribuição exata da Lei do Talião no Direito Antigo.",
          },
          {
            id: 2,
            pergunta:
              "Qual civilização antiga contribuiu decisivamente para a criação dos conceitos de 'Iurisprudentia' e codificação civil sistematizada?",
            opcoes: ["Romana.", "Egípcia.", "Fenícia.", "Persa."],
            respostaCorreta: 0,
            dica: "Base da tradição jurídica ocidental de Direito Civil (Civil Law).",
            justificativa:
              "O Direito Romano (Compilação de Justiniano/Corpus Iuris Civilis) constitui a espinha dorsal do pensamento jurídico ocidental.",
          },
          {
            id: 3,
            pergunta:
              "A Lei das XII Tábuas é tida como o marco fundacional do direito escrito na:",
            opcoes: [
              "Grécia Clássica.",
              "Europa Medieval.",
              "Babilónia.",
              "Roma Antiga.",
            ],
            respostaCorreta: 3,
            dica: "Primeiro código escrito da República Romana.",
            justificativa:
              "As XII Tábuas (450 a.C.) garantiram publicidade às leis e limitaram o arbítrio dos patrícios sobre os plebeus.",
          },
          {
            id: 4,
            pergunta:
              "O Jusnaturalismo defende a existência de um Direito Natural que é:",
            opcoes: [
              "Criado exclusivamente pela vontade do Estado.",
              "Anterior, superior e independente do direito positivo escrito.",
              "Modificado diariamente pelos tribunais.",
              "Válido apenas para uma determinada nação.",
            ],
            respostaCorreta: 1,
            dica: "Fundamenta-se na razão, na natureza humana ou na ordem divina.",
            justificativa:
              "O Jusnaturalismo sustenta a existência de direitos universais e imutáveis válidos por si mesmos.",
          },
          {
            id: 5,
            pergunta:
              "O Juspositivismo (Positivismo Jurídico) caracteriza-se por:",
            opcoes: [
              "Considerar válidas apenas as leis que correspondem à moral divina.",
              "Permitir que o juiz crie leis livremente.",
              "Separar o Direito da Moral e reconhecer como norma válida aquela produzida pelo Estado.",
              "Negar a existência de constituições escritas.",
            ],
            respostaCorreta: 2,
            dica: "Validade formal da norma posta pela autoridade competente.",
            justificativa:
              "O Positivismo Jurídico foca-se na norma válida produzida pelo poder soberano (Direito Positivo), independentemente do seu valor moral.",
          },
          {
            id: 6,
            pergunta:
              "A Magna Carta de 1215, assinada na Inglaterra pelo Rei João Sem-Terra, é um marco para:",
            opcoes: [
              "A limitação do poder real e as garantias do devido processo legal (Due Process).",
              "O poder absoluto dos reis.",
              "A criação do sistema feudal.",
              "A abolição total da propriedade privada.",
            ],
            respostaCorreta: 0,
            dica: "Impediu que o monarca tributasse ou prendesse nobres sem julgamento formal.",
            justificativa:
              "A Magna Carta estabeleceu o princípio de que até o soberano está submetido à lei e assegurou julgamento justo aos homens livres.",
          },
          {
            id: 7,
            pergunta:
              "No contexto medieval, as 'Ordalias' ou 'Juízos de Deus' eram:",
            opcoes: [
              "Julgamentos baseados em provas periciais e autópsias.",
              "Debates académicos entre juristas e teólogos.",
              "Provas físicas dolorosas ou perigosas cuja sobrevivência invocava a intervenção divina.",
              "Recursos apresentados diretamente ao Papa.",
            ],
            respostaCorreta: 2,
            dica: "Testes de fogo ou água para apurar a culpa.",
            justificativa:
              "As ordalias submetiam o acusado a perigos físicos; a cicatrização ou sobrevivência era vista como prova de inocência por milagre divino.",
          },
          {
            id: 8,
            pergunta:
              "O movimento de Codificação do Século XIX teve como seu maior símbolo:",
            opcoes: [
              "O Código Penal Prussiano.",
              "O Digesto de Justiniano.",
              "As Ordenações Filipinas.",
              "O Código Civil Napoleónico (1804).",
            ],
            respostaCorreta: 3,
            dica: "Código promulgado em França que unificou o direito civil europeu.",
            justificativa:
              "O Code Civil francês de 1804 consolidou os valores da Revolução Francesa e serviu de modelo para a Europa e América Latina.",
          },
          {
            id: 9,
            pergunta:
              "Hans Kelsen é amplamente reconhecido no pensamento jurídico pela formulação da:",
            opcoes: [
              "Teoria Tridimensional do Direito.",
              "Teoria Pura do Direito e da Pirâmide Normativa.",
              "Escola do Direito Livre.",
              "Teoria do Delito Natural.",
            ],
            respostaCorreta: 1,
            dica: "Hierarquia de normas encabeçada pela Norma Fundamental.",
            justificativa:
              "Kelsen propôs expurgar o Direito de elementos sociológicos e morais, estruturando a validade das normas numa hierarquia piramidal.",
          },
          {
            id: 10,
            pergunta:
              "A Teoria Tridimensional do Direito, desenvolvida pelo jurista Miguel Reale, concebe o Direito como a integração de:",
            opcoes: [
              "Facto, Valor e Norma.",
              "Estado, Sociedade e Indivíduo.",
              "Lei, Doutrina e Jurisprudência.",
              "Crime, Pena e Processo.",
            ],
            respostaCorreta: 0,
            dica: "Três elementos constitutivos que se inter-relacionam continuamente.",
            justificativa:
              "A visão tridimensional sustenta que o Direito surge quando um facto social ganha um valor moral que resulta numa norma jurídica.",
          },
          {
            id: 11,
            pergunta:
              "O sistema jurídico da Common Law (tradição anglo-saxónica) baseia-se prioritariamente:",
            opcoes: [
              "Em códigos escritos extensos aprovados pelo Parlamento.",
              "Na vontade unilateral do Chefe de Estado.",
              "Em precedentes judiciais (stare decisis) e costumes.",
              "Em manuais teóricos universitários.",
            ],
            respostaCorreta: 2,
            dica: "Jurisprudência criada pelas decisões dos tribunais ao longo do tempo.",
            justificativa:
              "Na Common Law, a principal fonte do direito são as decisões judiciais anteriores que vinculam os julgamentos futuros.",
          },
          {
            id: 12,
            pergunta:
              "O Iluminismo Jurídico do século XVIII combateu vigorosamente:",
            opcoes: [
              "A igualdade perante a lei.",
              "A criação de constituições escritas.",
              "O julgamento por júri popular.",
              "As torturas, penas cruéis e o arbítrio judicial do Absolutismo.",
            ],
            respostaCorreta: 3,
            dica: "Pensadores como Voltaire, Montesquieu e Beccaria.",
            justificativa:
              "O Iluminismo promoveu a racionalidade, a proporcionalidade das penas e as garantias individuais contra a arbitrariedade do Estado.",
          },
          {
            id: 13,
            pergunta:
              "O Tribunal de Nuremberga (1945-1946) representou uma viragem no pensamento jurídico por:",
            opcoes: [
              "Confirmar o positivismo estrito ('A lei é a lei').",
              "Consolidar a responsabilidade penal internacional e a prevalência dos Direitos Humanos sobre normas estatais ilegítimas.",
              "Abolir os julgamentos para crimes de guerra.",
              "Submeter todos os países ao direito romano.",
            ],
            respostaCorreta: 1,
            dica: "Julgamento dos crimes nazistas e limitação da obediência cega à lei formal.",
            justificativa:
              "Nuremberga demonstrou que leis estatais que violem a humanidade perdem validade moral e jurídica perante o Direito Internacional.",
          },
          {
            id: 14,
            pergunta:
              "O conceito de Estado de Direito (Rechtsstaat) implica essencialmente:",
            opcoes: [
              "Que o governo pode alterar as leis sem consulta prévia.",
              "A militarização de todos os órgãos de segurança.",
              "A submissão do próprio Estado e dos seus governantes ao império da lei.",
              "A inexistência de um poder judiciário independente.",
            ],
            respostaCorreta: 2,
            dica: "Ninguém está acima da lei, nem o próprio monarca ou governante.",
            justificativa:
              "No Estado de Direito, as ações governamentais são estritamente limitadas por normas legais pré-existentes.",
          },
          {
            id: 15,
            pergunta:
              "As Ordenações Filipinas (1603) tiveram grande relevância histórica no contexto angolano e lusófono porque:",
            opcoes: [
              "Constituíram o corpo legislativo do Império Português aplicado nas colónias durante séculos.",
              "Foram a primeira constituição moderna de Angola.",
              "Aboliram a escravatura e os trabalhos forçados no século XVII.",
              "Foram redigidas diretamente em Luanda.",
            ],
            respostaCorreta: 0,
            dica: "Compilação legislativa portuguesa vigorante no período colonial.",
            justificativa:
              "As Ordenações Filipinas regularam a vida civil e penal em todos os territórios ultramarinos sob domínio português até ao século XIX.",
          },
        ],
      },

      // 4. INTRODUÇÃO AO ESTUDO DO DIREITO
      {
        id: "intro-direito",
        nome: "Introdução ao Estudo do Direito",
        questoes: [
          {
            id: 1,
            pergunta: "O princípio da Legalidade Penal prevê que:",
            opcoes: [
              "Qualquer ato imoral pode ser punido pelo juiz.",
              "A lei pode aplicar-se retroativamente para prejudicar o réu.",
              "Não há crime sem lei anterior que o defina, nem pena sem prévia cominação legal.",
              "O costume pode criar novos crimes sem aprovação do parlamento.",
            ],
            respostaCorreta: 2,
            dica: "Nullum crimen, nulla poena sine praevia lege.",
            justificativa:
              "O princípio da legalidade é a garantia máxima contra o arbítrio, exigindo lei prévia, escrita e estrita para tipificar condutas.",
          },
          {
            id: 2,
            pergunta:
              "Normas jurídicas cogentes (imperativas) caracterizam-se por:",
            opcoes: [
              "Serem de aplicação opcional dependendo do acordo entre as partes.",
              "Possuírem cumprimento obrigatório, não podendo ser afastadas pela vontade privada.",
              "Valerem apenas dentro das empresas.",
              "Serem meras recomendações éticas.",
            ],
            respostaCorreta: 1,
            dica: "A vontade individual não pode anular o seu cumprimento.",
            justificativa:
              "As normas cogentes protegem a ordem pública e o interesse social, sobrepondo-se à vontade particular.",
          },
          {
            id: 3,
            pergunta: "A vigência de uma norma jurídica refere-se a:",
            opcoes: [
              "A sua aceitação social pelos cidadãos.",
              "O seu valor de justiça moral.",
              "A sua aprovação por um tribunal internacional.",
              "A sua existência formal, validade e obrigatoriedade no ordenamento a partir da publicação.",
            ],
            respostaCorreta: 3,
            dica: "Atributo da norma promulgada e publicada que está apta a produzir efeitos.",
            justificativa:
              "A vigência é o período de vida útil de uma lei, delimitado pela sua entrada em vigor e pela sua revogação.",
          },
          {
            id: 4,
            pergunta:
              "O processo de preenchimento de lacunas da lei quando não existe norma específica denomina-se:",
            opcoes: [
              "Integração do Direito (ex: recurso à analogia e princípios gerais).",
              "Derrogação.",
              "Revogação expressa.",
              "Abolitio criminis.",
            ],
            respostaCorreta: 0,
            dica: "Recursos do jurista quando a lei é omissa.",
            justificativa:
              "O juiz não pode escusar-se de julgar alegando falta de lei; deve integrar o sistema jurídico recorrendo à analogia, costumes e princípios.",
          },
          {
            id: 5,
            pergunta:
              "A revogação parcial de uma lei por outra mais recente chama-se:",
            opcoes: ["Ab-rogação.", "Caducidade.", "Derrogação.", "Anulação."],
            respostaCorreta: 2,
            dica: "Enquanto a ab-rogação é a revogação total.",
            justificativa:
              "A derrogação extingue apenas uma parte ou artigos específicos de uma lei anterior.",
          },
          {
            id: 6,
            pergunta:
              "Qual é a fonte primária e direta do sistema jurídico de matriz Romano-Germânica (Civil Law)?",
            opcoes: [
              "O costume.",
              "A jurisprudência.",
              "A Lei escrita.",
              "A doutrina dos pareceristas.",
            ],
            respostaCorreta: 2,
            dica: "Sistemas onde o ato legislativo estatal é a fonte suprema.",
            justificativa:
              "No sistema Civil Law, a lei formal aprovada pelo poder legislativo é a fonte primária do direito.",
          },
          {
            id: 7,
            pergunta: "A capacidade jurídica de gozo adquire-se com:",
            opcoes: [
              "A maioria de idade (18 anos).",
              "O nascimento completo e com vida.",
              "A obtenção de um emprego formal.",
              "A conclusão da licenciatura.",
            ],
            respostaCorreta: 1,
            dica: "Aptidão para ser titular de direitos e obrigações desde a entrada no mundo.",
            justificativa:
              "Toda a pessoa humana adquire personalidade e capacidade de gozo com o nascimento com vida.",
          },
          {
            id: 8,
            pergunta:
              "O Ramo do Direito Público que regula a prevenção e repressão das infrações penais é:",
            opcoes: [
              "O Direito Administrativo.",
              "O Direito Constitucional.",
              "O Direito Comercial.",
              "O Direito Penal.",
            ],
            respostaCorreta: 3,
            dica: "Define crimes e comina penas.",
            justificativa:
              "O Direito Penal é o ramo público focado na proteção dos bens jurídicos mais fundamentais através da imposição de sanções.",
          },
          {
            id: 9,
            pergunta:
              "Qual das alternativas representa um Princípio Geral do Direito Penal?",
            opcoes: [
              "Princípio da Presunção de Inocência.",
              "Princípio da Punição Coletiva.",
              "Princípio da Prisão Preventiva Obrigatória.",
              "Princípio da Responsabilidade sem Culpa.",
            ],
            respostaCorreta: 0,
            dica: "Qualquer pessoa é tida como inocente até ao trânsito em julgado da condenação.",
            justificativa:
              "A presunção de inocência é uma garantia constitucional fundamental e estruturante do processo penal.",
          },
          {
            id: 10,
            pergunta:
              "A Antijuricidade (ou ilicitude) de uma conduta significa que esta:",
            opcoes: [
              "É perfeitamente aceitável pela moral da sociedade.",
              "Foi cometida por um menor de idade.",
              "É contrária às exigências do ordenamento jurídico e não está protegida por causas de exclusão.",
              "Não causou qualquer dano visível.",
            ],
            respostaCorreta: 2,
            dica: "Contradição formal e material entre o ato e o direito.",
            justificativa:
              "Para ser crime, a conduta típica deve ser antijurídica (ilícita), ou seja, contrária ao direito e sem causas de justificação (como legítima defesa).",
          },
          {
            id: 11,
            pergunta: "A Legítima Defesa constitui uma causa de:",
            opcoes: [
              "Exclusão da Tipicidade.",
              "Exclusão da Antijuricidade (ou Ilicitude).",
              "Aumento de Pena.",
              "Extinção do tribunal.",
            ],
            respostaCorreta: 1,
            dica: "Torna a conduta que seria crime num ato juridicamente aceito.",
            justificativa:
              "A legítima defesa justifica o ato de repelir agressão injusta e atual, retirando a ilicitude da conduta.",
          },
          {
            id: 12,
            pergunta:
              "O elemento subjetivo do crime que se traduz na vontade consciente de praticar a infração chama-se:",
            opcoes: ["Negligência.", "Imprudência.", "Caso fortuito.", "Dolo."],
            respostaCorreta: 3,
            dica: "A intenção direta ou aceitação do resultado ilícito.",
            justificativa:
              "O dolo implica conhecimento (elemento intelectivo) e vontade (elemento volitivo) de realizar o facto ilícito.",
          },
          {
            id: 13,
            pergunta:
              "A aplicação analógica de uma norma restritiva de direitos no Direito Penal (analogia in malam partem) é:",
            opcoes: [
              "Permitida a critério do juiz.",
              "Expressamente proibida em garantia da segurança jurídica.",
              "Obrigatória em crimes graves.",
              "Recomendada pelo Ministério Público.",
            ],
            respostaCorreta: 1,
            dica: "Não se pode criar infrações por semelhança contra o réu.",
            justificativa:
              "Em observância ao princípio da legalidade, é vedado usar analogia para criar crimes ou agravar penas (in malam partem).",
          },
          {
            id: 14,
            pergunta: "O Nexo de Causalidade no Direito Penal estabelece:",
            opcoes: [
              "A ligação de parentesco entre vítima e réu.",
              "A quantidade de testemunhas necessárias.",
              "A relação de causa e efeito entre a conduta do agente e o resultado produzido.",
              "O valor económico da indemnização.",
            ],
            respostaCorreta: 2,
            dica: "Demonstra se a ação produziu diretamente o evento criminoso.",
            justificativa:
              "O nexo de causalidade é o elo físico ou normativo que liga a ação do indivíduo ao resultado proibido por lei.",
          },
          {
            id: 15,
            pergunta:
              "As penas no Direito Moderno têm como dupla finalidade essencial:",
            opcoes: [
              "Prevenção (geral e especial) e retribuição justa.",
              "Vingança da vítima e eliminação do réu.",
              "Trabalho forçado e humilhação pública.",
              "Geração de receita para o Estado.",
            ],
            respostaCorreta: 0,
            dica: "Combina a punição proporcional com a proteção da sociedade.",
            justificativa:
              "A pena visa retribuir o mal do crime proporcionalmente e prevenir novas infrações, ressocializando o agente.",
          },
        ],
      },
      // 5. BIOPSICOLOGIA DO COMPORTAMENTO DESVIANTE
      {
        id: "biopsicologia",
        nome: "Biopsicologia do Comportamento Desviante",
        questoes: [
          {
            id: 1,
            pergunta:
              "A estrutura cerebral frequentemente associada ao controlo dos impulsos, planeamento e tomada de decisões é:",
            opcoes: [
              "O cerebelo.",
              "O tronco encefálico.",
              "O córtex pré-frontal.",
              "O lóbulo occipital.",
            ],
            respostaCorreta: 2,
            dica: "Região do cérebro que amadurece por último na juventude.",
            justificativa:
              "Danos ou hipofunção no córtex pré-frontal estão correlacionados com desinibição, agressividade e incapacidade de avaliar consequências.",
          },
          {
            id: 2,
            pergunta:
              "Qual neurotransmissor, em níveis baixos no sistema nervoso central, está empiricamente associado a comportamentos impulsivos e agressivos?",
            opcoes: [
              "Serotonina.",
              "Acetilcolina.",
              "Melatonina.",
              "Endorfina.",
            ],
            respostaCorreta: 0,
            dica: "Regula o humor, o sono e a inibição comportamental.",
            justificativa:
              "A hipofunção serotonérgica compromete a regulação de impulsos e do afeto, aumentando a propensão a respostas agressivas imprevistas.",
          },
          {
            id: 3,
            pergunta:
              "A Amígdala cerebral desempenha um papel central em relação a:",
            opcoes: [
              "Processamento de cálculos matemáticos.",
              "Coordenação motora fina.",
              "Visão de cores.",
              "Processamento de emoções, especialmente o medo, a ameaça e o condicionamento aversivo.",
            ],
            respostaCorreta: 3,
            dica: "Estrutura do sistema límbico fundamental para respostas de 'luta ou fuga'.",
            justificativa:
              "Anormalidades no volume ou funcionamento da amígdala podem levar à falta de empatia e à ausência de resposta ao medo em indivíduos psicopatas.",
          },
          {
            id: 4,
            pergunta:
              "A Perturbação da Personalidade Antissocial (TPAS) é caracterizada clinicamente por:",
            opcoes: [
              "Excessiva timidez e isolamento social voluntário.",
              "Padrão persistente de desrespeito e violação dos direitos dos outros, falta de empatia e remorso.",
              "Alucinações auditivas frequentes.",
              "Alternância rápida de comportamentos maníacos e depressivos.",
            ],
            respostaCorreta: 1,
            dica: "Conhecida vulgarmente no âmbito forense em formas graves como psicopatia ou sociopatia.",
            justificativa:
              "A TPAS envolve manipulação, engano, impulsividade e ausência de culpa face aos danos causados a terceiros.",
          },
          {
            id: 5,
            pergunta:
              "O célebre caso histórico de Phineas Gage (1848) tornou-se um marco na neurobiologia por demonstrar que:",
            opcoes: [
              "Lesões no córtex pré-frontal podem alterar radicalmente a personalidade e o julgamento moral sem afetar a memória básica.",
              "A inteligência lógica reside no cerebelo.",
              "O comportamento violento é imprevisível e sem base cerebral.",
              "A perda de audição gera impulsos criminosos.",
            ],
            respostaCorreta: 0,
            dica: "Um operário que teve uma barra de ferro a atravessar o seu crânio.",
            justificativa:
              "Após a lesão pré-frontal, Gage passou de um homem responsável a alguém irresponsável, profano e socialmente desinibido.",
          },
          {
            id: 6,
            pergunta:
              "Estudos de gémeos e de adoção em Biopsicologia Criminológica visam medir:",
            opcoes: [
              "A influência de dietas alimentares sobre o peso corporal.",
              "A eficácia da publicidade na escolha de consumo.",
              "A herdabilidade e a interação entre carga genética e fatores ambientais na conduta antissocial.",
              "A capacidade linguística de crianças isoladas.",
            ],
            respostaCorreta: 2,
            dica: "Compara gémeos univitelinos (idênticos) e bivitelinos.",
            justificativa:
              "Estas investigações mostram que a genética cria vulnerabilidades, mas o ambiente atua como gatilho determinante na conduta criminal.",
          },
          {
            id: 7,
            pergunta:
              "A enzima MAO-A (Monoamina Oxidase A), apelidada no passado pela imprensa de 'gene do guerreiro', atua na:",
            opcoes: [
              "Digestão de hidratos de carbono pesados.",
              "Síntese de hemoglobina no sangue.",
              "Regulação do crescimento ósseo.",
              "Degradação de neurotransmissores como dopamina e serotonina.",
            ],
            respostaCorreta: 3,
            dica: "Baixa atividade desta enzima aliada a maus-tratos na infância eleva o risco de desvio.",
            justificativa:
              "A variante de baixa atividade da MAO-A interage com o ambiente adverso na infância, aumentando o risco de conduta antissocial na vida adulta.",
          },
          {
            id: 8,
            pergunta:
              "Diferente dos psicóticos, os indivíduos classificados com Psicopatia Grave habitualmente apresentam:",
            opcoes: [
              "Delírios e desconexão com a realidade (perda de contacto com o real).",
              "Orientação espacial e racionalidade preservadas, com défice profundo de empatia e afeto.",
              "Incapacidade de falar com clareza.",
              "Amnésia sistemática do crime que cometeram.",
            ],
            respostaCorreta: 1,
            dica: "Sabem exatamente o que fazem e que é ilegal, mas não se importam.",
            justificativa:
              "O psicopata compreende perfeitamente as regras e a ilicitude dos seus atos, mas é incapaz de empatia moral e emocional com a vítima.",
          },
          {
            id: 9,
            pergunta:
              "A hipótese do Sub-Arousal (subativação do sistema nervoso autónomo) em psicopatas sugere que estes:",
            opcoes: [
              "Têm batimentos cardíacos extremamente acelerados em repouso.",
              "São hiper-sensíveis à dor física.",
              "Apresentam níveis cronicamente baixos de ansiedade e procuram sensações fortes/perigosas para atingir estímulo.",
              "Evitam qualquer situação de risco ou conflito.",
            ],
            respostaCorreta: 2,
            dica: "Procura constante de adrenalina devido à falta de reatividade fisiológica.",
            justificativa:
              "A baixa reatividade do sistema nervoso faz com que o indivíduo não sinta o medo típico diante do perigo e procure riscos extremos.",
          },
          {
            id: 10,
            pergunta:
              "Qual é o impacto do consumo crónico de álcool e substâncias psicoativas no comportamento antissocial?",
            opcoes: [
              "Debilita a função executiva, reduz o autocontrolo e amplia a reatividade impulsiva a ameaças percebidas.",
              "Aumenta a atividade inibitória do cérebro, reduzindo o risco de violência.",
              "Elimina totalmente as memórias de infância.",
              "Melhora a capacidade de planeamento estratégico.",
            ],
            respostaCorreta: 0,
            dica: "Substâncias que 'desligam' o travão biológico da agressão.",
            justificativa:
              "O álcool e certas drogas deprimem o controlo pré-frontal e amplificam estados emocionais desregulados.",
          },
          {
            id: 11,
            pergunta:
              "O conceito de 'Neuroplasticidade' traz esperança à criminologia porque indica que:",
            opcoes: [
              "O cérebro é imutável após os 5 anos de idade.",
              "A genética determina 100% dos comportamentos até ao fim da vida.",
              "Todas as lesões cerebrais são fatais a curto prazo.",
              "O cérebro é capaz de reorganizar as suas conexões em resposta à aprendizagem, intervenção psiquiátrica e ambiente.",
            ],
            respostaCorreta: 3,
            dica: "Capacidade de reestruturação do sistema nervoso.",
            justificativa:
              "A neuroplasticidade comprova que intervenções terapêuticas e sociais adequadas podem modificar vias neurais e melhorar a autorregulação.",
          },
          {
            id: 12,
            pergunta:
              "A hormona Testostérona tem sido estudada na Criminologia devido à sua correlação com:",
            opcoes: [
              "Passividade e submissão.",
              "Comportamento de dominância, competitividade e, em certas condições, agressividade.",
              "Redução da capacidade muscular.",
              "Aumento da empatia por estranhos.",
            ],
            respostaCorreta: 1,
            dica: "Andrógeno presente em ambos os sexos, mas em níveis mais elevados no sexo masculino.",
            justificativa:
              "Em combinação com baixos níveis de cortisol e ambiente social propenso, elevados níveis de testostérona associam-se a respostas impulsivas de dominância.",
          },
          {
            id: 13,
            pergunta:
              "Danos na região do Giro Cingulado Anterior do cérebro afetam diretamente:",
            opcoes: [
              "A deteção de erros, monitorização de conflitos comportamentais e aprendizagem pela punição.",
              "A capacidade auditiva para tons agudos.",
              "A precisão da visão noturna.",
              "A digestão de gorduras.",
            ],
            respostaCorreta: 0,
            dica: "Estrutura envolvida em notar quando cometemos um erro.",
            justificativa:
              "Esta estrutura é vital para aprender com as consequências negativas; sem ela, o indivíduo insiste em comportamentos punidos.",
          },
          {
            id: 14,
            pergunta:
              "Na avaliação de imputabilidade penal, um indivíduo que comete um crime sob o efeito de uma psicose ativa (ex: Esquizofrenia não tratada com alucinações imperativas) é geralmente considerado:",
            opcoes: [
              "Plenamente imputável e punível com pena normal.",
              "Isento apenas de custos judiciais.",
              "Inimputável (ou com imputabilidade reduzida) devido à incapacidade de compreender a ilicitude do ato.",
              "Culpado com agravante de premeditação.",
            ],
            respostaCorreta: 2,
            dica: "Ausência de capacidade intelectiva e volitiva no momento do facto.",
            justificativa:
              "A grave perturbação mental que anula a capacidade de apreciação do ato descaracteriza a culpabilidade em termos penais formais.",
          },
          {
            id: 15,
            pergunta: "A Epigenética estuda como:",
            opcoes: [
              "A sequência de letras do DNA é alterada por cirurgias.",
              "Os robôs substituirão os psicólogos forenses.",
              "As pessoas adquirem traços físicos através da leitura.",
              "Factores ambientais (como stress traumático ou nutrição) alteram a expressão dos genes sem mudar a sequência do DNA.",
            ],
            respostaCorreta: 3,
            dica: "Mecanismos que 'ligam' ou 'desligam' genes segundo as experiências de vida.",
            justificativa:
              "A epigenética demonstra como o trauma e o abuso infantil podem marcar biologicamente o genoma e influenciar o comportamento futuro.",
          },
        ],
      },

      // 6. CIÊNCIA POLÍTICA E DIREITO CONSTITUCIONAL
      {
        id: "ciencia-politica",
        nome: "Ciência Política e Direito Constitucional",
        questoes: [
          {
            id: 1,
            pergunta:
              "Quais são os três elementos constitutivos clássicos do Estado Moderno?",
            opcoes: [
              "Povo, Território e Soberania (Poder Político).",
              "Governo, Forças Armadas e Moeda.",
              "Constituição, Tribunais e Polícia.",
              "Partidos Políticos, Eleições e Leis.",
            ],
            respostaCorreta: 0,
            dica: "Tríade fundamental que define a existência de um Estado soberano.",
            justificativa:
              "Sem um povo delimitado num determinado território sob o exercício de um poder soberano, não há Estado em sentido do Direito Internacional.",
          },
          {
            id: 2,
            pergunta:
              "A célebre teoria da Separação dos Poderes (Legislativo, Executivo e Judiciário) foi sistematizada por:",
            opcoes: [
              "Thomas Hobbes.",
              "Jean-Jacques Rousseau.",
              "Montesquieu.",
              "Karl Marx.",
            ],
            respostaCorreta: 2,
            dica: "Autor da obra 'O Espírito das Leis' (1748).",
            justificativa:
              "Montesquieu formulou a divisão tripartida para evitar a tirania: 'só o poder trava o poder'.",
          },
          {
            id: 3,
            pergunta:
              "O conceito de 'Soberania' no Estado Democrático reside primariamente em quem?",
            opcoes: [
              "No Presidente da República.",
              "No Povo.",
              "Nas Forças Armadas.",
              "Nos Juízes do Tribunal Constitucional.",
            ],
            respostaCorreta: 1,
            dica: "Princípio expressamente consagrado na maioria das Constituições modernas.",
            justificativa:
              "Todo o poder político emana do povo, que o exerce diretamente ou por meio dos seus representantes eleitos.",
          },
          {
            id: 4,
            pergunta: "Uma Constituição rígida é aquela que:",
            opcoes: [
              "Não pode sofrer qualquer tipo de alteração ao longo dos tempos.",
              "É redigida num único documento impresso.",
              "Pode ser alterada por qualquer decreto do Presidente.",
              "Exige um processo de revisão legislativa mais complexo e exigente do que as leis comuns.",
            ],
            respostaCorreta: 3,
            dica: "Protege o texto constitucional de maiorias conjunturais simples.",
            justificativa:
              "A rigidez constitucional garante estabilidade política, impondo maiorias qualificadas para a aprovação de revisões constitucionais.",
          },
          {
            id: 5,
            pergunta:
              "Os Direitos Fundamentais de Primeira Geração (ou Dimensão) caracterizam-se por focar em:",
            opcoes: [
              "Liberdades individuais, direitos civis e políticos (não-intervenção abusiva do Estado).",
              "Direitos sociais, económicos e culturais (educação, saúde).",
              "Direitos de terceira geração como meio ambiente e paz.",
              "Direitos digitais e inteligência artificial.",
            ],
            respostaCorreta: 0,
            dica: "Inspirados na Revolução Francesa e Americana (Liberdade).",
            justificativa:
              "A 1ª geração impõe deveres de abstenção ao Estado para garantir a liberdade e a autonomia do indivíduo.",
          },
          {
            id: 6,
            pergunta:
              "Qual é o órgão jurisdicional encarregado de exercer a fiscalização suprema da constitucionalidade das leis?",
            opcoes: [
              "Tribunal de Contas.",
              "Tribunal Constitucional.",
              "Tribunal Militar.",
              "Procuradoria-Geral da República.",
            ],
            respostaCorreta: 1,
            dica: "Guardião da lei fundamental do país.",
            justificativa:
              "Cabe ao Tribunal Constitucional garantir que nenhuma norma hierarquicamente inferior viole os preceitos da Constituição.",
          },
          {
            id: 7,
            pergunta:
              "Thomas Hobbes, na sua obra 'O Leviatã', defende que o Estado surge de um Contrato Social para:",
            opcoes: [
              "Promover a igualdade económica de todos.",
              "Proteger a liberdade absoluta sem regras.",
              "Superar a 'guerra de todos contra todos' do estado de natureza, garantindo ordem e segurança.",
              "Garantir eleições anuais.",
            ],
            respostaCorreta: 2,
            dica: "'Homo homini lupus' (O homem é o lobo do homem).",
            justificativa:
              "Hobbes argumenta que sem o poder soberano do Estado, a vida humana seria violenta, caótica e curta.",
          },
          {
            id: 8,
            pergunta:
              "O remédio constitucional concebido especificamente para proteger a liberdade de locomoção (ir e vir) contra ilegalidade ou abuso de poder é o:",
            opcoes: [
              "Habeas Data.",
              "Mandado de Injunção.",
              "Recurso de Contencioso.",
              "Habeas Corpus.",
            ],
            respostaCorreta: 3,
            dica: "Garantia histórica de proteção contra a prisão arbitrária.",
            justificativa:
              "O Habeas Corpus protege o direito fundamental à liberdade física de deslocação quando ameaçado por violência ou coação ilegal.",
          },
          {
            id: 9,
            pergunta:
              "A forma de Estado Unitário Regional ou Descentralizado caracteriza-se por:",
            opcoes: [
              "Existência de um único centro de poder soberano, mas com autonomia administrativa e política concedida a regiões específicas.",
              "Divisão em estados soberanos independentes.",
              "Governo exercido exclusivamente por prefeitos locais.",
              "Inexistência de parlamento nacional.",
            ],
            respostaCorreta: 0,
            dica: "Modelo adotado por países como Portugal e Angola.",
            justificativa:
              "No Estado Unitário, a soberania é una, embora possa haver descentralização territorial de competências.",
          },
          {
            id: 10,
            pergunta:
              "O princípio da Supremacia da Constituição significa que:",
            opcoes: [
              "As leis ordinárias valem mais que a Constituição em caso de emergência.",
              "A Constituição é a norma de topo do ordenamento; todas as outras leis devem conformar-se a ela.",
              "Os tratados internacionais cancelam a Constituição automaticamente.",
              "O Presidente pode ignorar o texto constitucional.",
            ],
            respostaCorreta: 1,
            dica: "Espinha dorsal da hierarquia Kelseniana.",
            justificativa:
              "Sendo a norma suprema, qualquer ato legislativo ou administrativo infraconstitucional que contraponha a Constituição é nulo por inconstitucionalidade.",
          },
          {
            id: 11,
            pergunta:
              "O conceito de 'Estado Social de Direito' (2ª Geração de Direitos) exige do Estado:",
            opcoes: [
              "Uma atitude puramente passiva e de não intervenção.",
              "A privatização de todas as instituições públicas.",
              "Uma prestação ativa para garantir patamares mínimos de igualdade material (saúde, educação, trabalho).",
              "O fim dos impostos.",
            ],
            respostaCorreta: 2,
            dica: "Passagem do Estado Liberal (absenteísta) para o Estado Prestador.",
            justificativa:
              "O Estado Social atua na economia e nos serviços públicos para combater as desigualdades materiais da sociedade.",
          },
          {
            id: 12,
            pergunta:
              "Em Ciência Política, o conceito de 'Legitimidade' de um governo difere da 'Legalidade' porque:",
            opcoes: [
              "Legitimidade diz respeito à concordância com a lei escrita, e legalidade à aprovação popular.",
              "São conceitos idênticos sem diferença.",
              "Legitimidade aplica-se apenas a ditaduras.",
              "Legalidade é a conformidade formal com o direito; Legitimidade é a aceitação moral e política do poder pelos governados.",
            ],
            respostaCorreta: 3,
            dica: "Um governo pode ser legal (eleito na lei) mas perder a aceitação do povo.",
            justificativa:
              "A legalidade refere-se à forma; a legitimidade reflete o consenso e o reconhecimento de autoridade moral concedido pelos cidadãos.",
          },
          {
            id: 13,
            pergunta:
              "As 'Cláusulas Pétreas' ou limites materiais de revisão constitucional são:",
            opcoes: [
              "Núcleos essenciais da Constituição que não podem ser abolidos nem suprimidos por emenda ou revisão.",
              "Artigos que só podem ser lidos por juízes.",
              "Erros ortográficos que não podem ser alterados.",
              "Normas aprovadas no período colonial.",
            ],
            respostaCorreta: 0,
            dica: "Garantias imutáveis como a forma republicana, separação de poderes ou direitos fundamentais.",
            justificativa:
              "As cláusulas pétreas protegem a identidade fundamental da Constituição contra desfigurações promovidas por maiorias temporárias.",
          },
          {
            id: 14,
            pergunta:
              "O estado de emergência ou estado de sítio são institutos constitucionais de exceção destinados a:",
            opcoes: [
              "Permitir ao governo aumentar salários sem aprovação.",
              "Restabelecer a ordem em momentos de grave ameaça pública, podendo suspender temporariamente certas garantias não absolutas.",
              "Abolir a Constituição definitivamente.",
              "Dissolver a família civil.",
            ],
            respostaCorreta: 1,
            dica: "Mecanismos de defesa do próprio Estado em crises graves (ex: guerra, calamidade).",
            justificativa:
              "A própria Constituição prevê mecanismos temporários e rigorosamente delimitados para preservar a segurança nacional em situações extremas.",
          },
          {
            id: 15,
            pergunta:
              "O sufrágio universal é um elemento definidor da democracia representativa que garante:",
            opcoes: [
              "Direito de voto apenas aos proprietários de terras.",
              "A obrigatoriedade de filiação partidária.",
              "O direito de votar e ser votado a todos os cidadãos sem discriminação arbitrária.",
              "O voto exclusivo para quadros universitários.",
            ],
            respostaCorreta: 2,
            dica: "Uma pessoa, um voto.",
            justificativa:
              "O sufrágio universal consagra a igualdade política plena no exercício da cidadania através do voto.",
          },
        ],
      },
      // 7. MÉTODOS DE INVESTIGAÇÃO CIENTÍFICA
      {
        id: "metodos-investigacao",
        nome: "Métodos de Investigação Científica",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Hipótese numa investigação científica é definida como:",
            opcoes: [
              "Uma verdade absoluta e inquestionável.",
              "A conclusão final da tese.",
              "Uma resposta provisória e testável para o problema de pesquisa formulado.",
              "A lista de livros consultados.",
            ],
            respostaCorreta: 2,
            dica: "Afirmação suposta que será submetida a teste empírico.",
            justificativa:
              "A hipótese guia a recolha de dados, cabendo à investigação confirmá-la ou refutá-la.",
          },
          {
            id: 2,
            pergunta: "O método dedutivo parte de:",
            opcoes: [
              "Premissas ou teorias gerais para derivar conclusões particulares lógicas.",
              "Observações particulares para chegar a uma lei geral.",
              "Opiniões de senso comum sem comprovação.",
              "Entrevistas informais sem estrutura.",
            ],
            respostaCorreta: 0,
            dica: "Do geral para o particular.",
            justificativa:
              "No raciocínio dedutivo, se as premissas gerais forem verdadeiras, a conclusão particular extraída é necessariamente verdadeira.",
          },
          {
            id: 3,
            pergunta:
              "Diferente da abordagem quantitativa, a pesquisa Qualitativa foca-se em:",
            opcoes: [
              "Análise de gráficos e estatísticas descritivas complexas.",
              "Medição numérica do volume de crimes.",
              "Testes em amostras aleatórias de 10.000 pessoas.",
              "Compreensão profunda dos significados, motivações, discursos e experiências dos sujeitos.",
            ],
            respostaCorreta: 3,
            dica: "Qualidade, significado e contexto em vez de números.",
            justificativa:
              "A pesquisa qualitativa busca interpretar como os atores sociais percebem e atribuem sentido à sua realidade.",
          },
          {
            id: 4,
            pergunta:
              "Em termos éticos, o Consentimento Informado na pesquisa empírica garante que:",
            opcoes: [
              "O investigador pode usar os dados sem autorização.",
              "O participante compreende os objetivos, riscos e aceita voluntariamente participar, podendo desistir.",
              "O participante é obrigado a responder a todas as perguntas sob pena de multa.",
              "Os nomes reais das vítimas sejam publicados na imprensa.",
            ],
            respostaCorreta: 1,
            dica: "Proteção fundamental dos direitos dos participantes de pesquisas humanas.",
            justificativa:
              "É um requisito ético inescapável informar previamente o sujeito sobre a pesquisa e obter a sua concordância expressa.",
          },
          {
            id: 5,
            pergunta:
              "O estudo de caso na Criminologia é um delineamento metodológico que visa:",
            opcoes: [
              "Generalizar estatisticamente os resultados para todo o país.",
              "Substituir os relatórios da polícia.",
              "Analisar detalhadamente e em profundidade uma unidade específica (ex: um gangue, um tribunal, um indivíduo).",
              "Fazer simulações de computador.",
            ],
            respostaCorreta: 2,
            dica: "Investigação intensiva sobre um objeto delimitado no seu contexto real.",
            justificativa:
              "O estudo de caso permite captar a complexidade e a riqueza de dinâmicas específicas que os grandes questionários não captam.",
          },
          {
            id: 6,
            pergunta:
              "A variável independente num estudo experimental é aquela que:",
            opcoes: [
              "É manipulada ou introduzida pelo investigador para observar o seu efeito sobre outra variável.",
              "É medida para ver o resultado do teste.",
              "Permanece oculta sem ser registada.",
              "Muda aleatoriamente sem controlo.",
            ],
            respostaCorreta: 0,
            dica: "A causa presumida na relação causa-efeito.",
            justificativa:
              "A variável independente é o fator causa (ex: nível de policiamento) manipulado para medir o impacto na variável dependente (ex: taxa de roubos).",
          },
          {
            id: 7,
            pergunta: "O processo de Triangulação Metodológica consiste em:",
            opcoes: [
              "Desenhar triângulos no mapeamento do crime.",
              "Entrevistar apenas três testemunhas por crime.",
              "Descartar dados contrários à hipótese inicial.",
              "Combinar múltiplos métodos, fontes de dados ou teorias para estudar o mesmo fenómeno.",
            ],
            respostaCorreta: 3,
            dica: "Uso cruzado de técnicas (ex: quantitativo + qualitativo) para maior validade.",
            justificativa:
              "A triangulação reduz os enviesamentos de um único método, aumentando a consistência dos achados de pesquisa.",
          },
          {
            id: 8,
            pergunta:
              "Uma Revisão Sistemática da Literatura caracteriza-se por:",
            opcoes: [
              "Ler apenas artigos de opinião de jornais diários.",
              "Pesquisa rigorosa, estruturada e reprodutível que mapeia todas as evidências científicas publicadas sobre um tema.",
              "Escrever uma síntese rápida baseada num único livro de texto.",
              "Copiar resumos de sites não científicos.",
            ],
            respostaCorreta: 1,
            dica: "Metodologia transparente para sintetizar o estado da arte científico.",
            justificativa:
              "A revisão sistemática aplica critérios explícitos de inclusão e exclusão de estudos para responder a uma pergunta focada.",
          },
          {
            id: 9,
            pergunta:
              "O erro conhecido como 'Enviesamento do Investigador' (Researcher Bias) ocorre quando:",
            opcoes: [
              "O computador avaria durante a análise.",
              "Os sujeitos de pesquisa mentem deliberadamente.",
              "As expetativas ou crenças do próprio investigador influenciam a recolha ou interpretação dos dados.",
              "A amostra é grande demais.",
            ],
            respostaCorreta: 2,
            dica: "Interferência subjetiva do cientista a favor do resultado que ele deseja.",
            justificativa:
              "O cientista deve aplicar mecanismos de neutralidade para evitar direcionar a pesquisa para confirmar os seus pré-conceitos.",
          },
          {
            id: 10,
            pergunta: "A observação participante é uma técnica eminentemente:",
            opcoes: [
              "Etnográfica e qualitativa.",
              "Estatística.",
              "Documental e legislativa.",
              "Laboratorial e biológica.",
            ],
            respostaCorreta: 0,
            dica: "O investigador insere-se no meio da comunidade que estuda.",
            justificativa:
              "Na observação participante, o investigador vivencia a rotina do grupo estudado para compreender as suas normas internas.",
          },
          {
            id: 11,
            pergunta:
              "A fidedignidade (ou confiabilidade) de um instrumento de medição científica significa que este:",
            opcoes: [
              "É muito barato de aplicar.",
              "Mede algo completamente diferente do previsto.",
              "Foi aprovado pelo parlamento.",
              "Produz resultados consistentes e estáveis quando aplicado repetidamente nas mesmas condições.",
            ],
            respostaCorreta: 3,
            dica: "Estabilidade de medição em réplicas do teste.",
            justificativa:
              "Um instrumento confiável garante que variações nos dados refletem mudanças no fenómeno, e não erros na ferramenta.",
          },
          {
            id: 12,
            pergunta:
              "A operacionalização de um conceito abstrato (ex: 'Medo do Crime') exige:",
            opcoes: [
              "Ignorar o conceito e focar-se apenas na lei.",
              "Traduzir o conceito abstrato em indicadores empíricos observáveis e mensuráveis (ex: frequência de evita sair à noite).",
              "Decidir o valor sem perguntar à população.",
              "Escrever um poema sobre o medo.",
            ],
            respostaCorreta: 1,
            dica: "Transformar ideias genéricas em perguntas/indicadores concretos.",
            justificativa:
              "Operacionalizar é a ponte entre o nível teórico abstrato e o nível empírico mensurável.",
          },
          {
            id: 13,
            pergunta:
              "O 'Efeito Hawthorne' em pesquisas empíricas refere-se à tendência de os sujeitos:",
            opcoes: [
              "Adormecerem durante o preenchimento de questionários.",
              "Recusarem receber pagamento pela participação.",
              "Alterarem o seu comportamento natural simplesmente porque sabem que estão a ser observados.",
              "Aumentarem o consumo de café durante a entrevista.",
            ],
            respostaCorreta: 2,
            dica: "A presença do observador altera a conduta do observado.",
            justificativa:
              "Sabendo que fazem parte de um estudo, as pessoas tendem a agir de modo mais socialmente aceitável.",
          },
          {
            id: 14,
            pergunta:
              "Num artigo científico, a secção da Metodologia serve fundamentalmente para:",
            opcoes: [
              "Descrever detalhadamente como a pesquisa foi conduzida para permitir a sua réplica e validação por outros cientistas.",
              "Apresentar a biografia completa do autor.",
              "Listar os agradecimentos à família.",
              "Mostrar apenas as conclusões finais.",
            ],
            respostaCorreta: 0,
            dica: "Receita técnica e científica da pesquisa.",
            justificativa:
              "A transparência metodológica é a garantia de replicabilidade e rigor no método científico.",
          },
          {
            id: 15,
            pergunta: "O plágio académico e científico é concceituado como:",
            opcoes: [
              "A discordância legítima com a teoria de outro autor.",
              "A publicação do mesmo artigo em dois idiomas diferentes.",
              "O uso de tabelas estatísticas oficiais.",
              "A apropriação de ideias, textos ou dados de outrem sem a devida citação do autor original.",
            ],
            respostaCorreta: 3,
            dica: "Violação ética grave da propriedade intelectual alheia.",
            justificativa:
              "Apresentar trabalho alheio como se fosse próprio viola a integridade científica e os direitos de autor.",
          },
        ],
      },
      // 8. MÉTODOS QUANTITATIVOS
      {
        id: "metodos-quantitativos",
        nome: "Métodos Quantitativos",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Média Aritmética de um conjunto de dados calcula-se dividindo:",
            opcoes: [
              "O maior valor pelo menor valor.",
              "A soma de todos os valores pelo número total de observações.",
              "O valor central pelo total de observações.",
              "O desvio padrão pelo total da população.",
            ],
            respostaCorreta: 1,
            dica: "Medida clássica de tendência central.",
            justificativa:
              "A média distribui o valor total acumulado igualmente pelo número de elementos da amostra.",
          },
          {
            id: 2,
            pergunta: "A Mediana representa o valor que:",
            opcoes: [
              "Divide a distribuição exatamente ao meio (50% dos dados acima e 50% abaixo) quando ordenados.",
              "Aparece com maior frequência nos dados.",
              "Dá a diferença entre o máximo e o mínimo.",
              "Tem sempre o valor zero.",
            ],
            respostaCorreta: 0,
            dica: "O ponto central de uma série ordenada.",
            justificativa:
              "A mediana é resistente a valores extremos (outliers) que distorcem a média.",
          },
          {
            id: 3,
            pergunta:
              "Em estatística criminal, a Moda de uma série de dados é:",
            opcoes: [
              "O valor médio dos homicídios no ano.",
              "O crime mais grave do código penal.",
              "O valor ou categoria que ocorre com maior frequência na amostra.",
              "O desvio padrão dos furtos.",
            ],
            respostaCorreta: 2,
            dica: "Aquilo que mais se repete estatisticamente.",
            justificativa:
              "A moda identifica o pico da distribuição estatística (ex: a hora do dia em que ocorrem mais roubos).",
          },
          {
            id: 4,
            pergunta:
              "A Taxa de Homicídios é padronizada internacionalmente pela métrica de número de casos por:",
            opcoes: [
              "1.000 habitantes.",
              "10.000 habitantes.",
              "1.000.000 habitantes.",
              "100.000 habitantes.",
            ],
            respostaCorreta: 3,
            dica: "Padrão recomendado pela ONU e OMS para comparações populacionais.",
            justificativa:
              "A métrica por 100.000 habitantes permite comparar a violência entre cidades ou países com populações de tamanhos muito diferentes.",
          },
          {
            id: 5,
            pergunta: "O Desvio Padrão mede:",
            opcoes: [
              "Apenas a média dos dados.",
              "O grau de dispersão ou variabilidade dos dados em relação à média.",
              "A percentagem de pessoas que responderam ao inquérito.",
              "O erro de digitação no sistema policial.",
            ],
            respostaCorreta: 1,
            dica: "Quanto maior o desvio padrão, mais afastados da média estão os valores.",
            justificativa:
              "O desvio padrão indica a homogeneidade ou heterogeneidade de um conjunto de dados.",
          },
          {
            id: 6,
            pergunta: "Uma amostra aleatória simples é aquela em que:",
            opcoes: [
              "O investigador escolhe intencionalmente os seus amigos.",
              "Apenas as pessoas que estão na rua às 10h da manhã são ouvidas.",
              "Todos os elementos da população têm rigorosamente a mesma probabilidade de serem selecionados.",
              "A seleção é feita pelo comissário de polícia.",
            ],
            respostaCorreta: 2,
            dica: "Método probabilístico essencial para a representatividade estatística.",
            justificativa:
              "A aleatoriedade elimina o viés de seleção do investigador, permitindo a inferência estatística.",
          },
          {
            id: 7,
            pergunta:
              "A margem de erro numa sondagem/inquérito estatístico diminui à medida que:",
            opcoes: [
              "O tamanho da amostra aumenta.",
              "O questionário fica mais curto.",
              "O tempo de recolha é reduzido.",
              "Menos pessoas respondem.",
            ],
            respostaCorreta: 0,
            dica: "Amostras maiores trazem estimativas mais precisas.",
            justificativa:
              "Aumentar o tamanho da amostra aproxima a estimativa empírica do valor real da população.",
          },
          {
            id: 8,
            pergunta:
              "Um coeficiente de correlação de Pearson igual a +1.0 indica:",
            opcoes: [
              "Inexistência de qualquer relação entre as duas variáveis.",
              "Uma relação inversamente proporcional perfeita.",
              "Erro de cálculo grave na fórmula.",
              "Uma correlação positiva perfeita entre as duas variáveis.",
            ],
            respostaCorreta: 3,
            dica: "Quando uma variável sobe, a outra sobe exatamente na mesma proporção.",
            justificativa:
              "O valor +1 sinaliza uma associação linear perfeita positiva entre duas variáveis quantitativas.",
          },
          {
            id: 9,
            pergunta:
              "A frase clássica 'Correlação não implica Causalidade' significa que:",
            opcoes: [
              "A estatística não serve para estudar o crime.",
              "Duas variáveis estatisticamente associadas não provam que uma seja a causa direta da outra.",
              "Todos os gráficos estatísticos contêm erros.",
              "As variáveis dependentes são sempre falsas.",
            ],
            respostaCorreta: 1,
            dica: "Duas variáveis podem variar juntas por causa de uma terceira variável oculta (spurious relationship).",
            justificativa:
              "A associação estatística entre A e B não garante que A cause B; podem existir fatores de confusão não medidos.",
          },
          {
            id: 10,
            pergunta:
              "O gráfico de Histogramas é ideal para representar visualmente:",
            opcoes: [
              "A evolução histórica da legislação.",
              "A hierarquia dos tribunais.",
              "A distribuição de frequências de variáveis contínuas (ex: faixas etárias dos infratores).",
              "Organigramas de empresas.",
            ],
            respostaCorreta: 2,
            dica: "Barras contíguas que mostram o formato da distribuição de dados.",
            justificativa:
              "Os histogramas revelam a simetria, assimetria e concentração dos dados em intervalos de classe.",
          },
          {
            id: 11,
            pergunta: "Um valor 'Outlier' em estatística é:",
            opcoes: [
              "Um valor atípico ou extremo que se afasta drasticamente do padrão geral dos restantes dados.",
              "A média exata da amostra.",
              "O resultado de uma divisão por zero.",
              "O total de dados válidos recolhidos.",
            ],
            respostaCorreta: 0,
            dica: "Ponto fora da curva.",
            justificativa:
              "Outliers devem ser analisados com cuidado porque podem ser erros de medição ou casos excecionais de grande relevância.",
          },
          {
            id: 12,
            pergunta:
              "A probabilidade de um evento acontecer varia numa escala matemática rigorosa de:",
            opcoes: [
              "-1 a +1.",
              "1 a 10.",
              "0 a 1.000.",
              "0 (impossibilidade) a 1 (certeza absoluta) ou 0% a 100%.",
            ],
            respostaCorreta: 3,
            dica: "Axioma fundamental da teoria da probabilidade.",
            justificativa:
              "Nenhum evento probabilístico pode ter valor negativo ou superior a 100% (1.0).",
          },
          {
            id: 13,
            pergunta:
              "Em testes de hipóteses estatísticas, o 'p-valor' (p-value) inferior a 0,05 indica habitualmente que:",
            opcoes: [
              "A pesquisa falhou totalmente.",
              "Os resultados são estatisticamente significativos (rejeita-se a hipótese nula de mero acaso).",
              "95% dos dados estavam errados.",
              "O teste deve ser cancelado.",
            ],
            respostaCorreta: 1,
            dica: "Nível de significância padrão de 5% nas ciências sociais.",
            justificativa:
              "Um p-valor < 0,05 significa que a probabilidade de o resultado ter ocorrido por mero acaso é inferior a 5%.",
          },
          {
            id: 14,
            pergunta:
              "Inquéritos de Vitimização são ferramentas quantitativas usadas para:",
            opcoes: [
              "Punir polícias corruptos.",
              "Substituir o censo populacional.",
              "Medir a taxa real de vitimização na população e estimar a Cifra Negra.",
              "Calcular impostos sobre bens roubados.",
            ],
            respostaCorreta: 2,
            dica: "Inquérito direto aos cidadãos perguntando se foram vítimas de crimes no último ano.",
            justificativa:
              "Como muitos crimes não são reportados à polícia, os inquéritos de vitimização revelam a dimensão oculta da criminalidade.",
          },
          {
            id: 15,
            pergunta: "Variáveis categóricas nominais são aquelas que:",
            opcoes: [
              "Classificam dados em categorias sem qualquer ordem de grandeza ou hierarquia (ex: Tipo de Crime: Roubo, Burla, Homicídio).",
              "Podem ser ordenadas hierarquicamente (ex: 1º, 2º, 3º lugar).",
              "Representam números decimais exatos.",
              "Medem a temperatura em graus Celsius.",
            ],
            respostaCorreta: 0,
            dica: "Apenas rótulos informativos sem ordem matemática interna.",
            justificativa:
              "Nas variáveis nominais, os nomes servem apenas para diferenciação qualitativa sem relação de ordem.",
          },
        ],
      },
      // 9. COMUNICAÇÃO PESSOAL E EMPRESARIAL
      {
        id: "comunicacao",
        nome: "Comunicação Pessoal e Empresarial",
        questoes: [
          {
            id: 1,
            pergunta:
              "No processo de comunicação, o ruído é concceituado como:",
            opcoes: [
              "Apenas barulho sonoro de alta intensidade no ambiente.",
              "O tom de voz elevado do emissor.",
              "Qualquer interferência ou barreira que distorça ou impeça a correta receção da mensagem.",
              "O uso de termos em idioma estrangeiro.",
            ],
            respostaCorreta: 2,
            dica: "Pode ser físico, psicológico, semântico ou técnico.",
            justificativa:
              "Ruído é qualquer fator perturbador que afete a fidelidade da transmissão da mensagem entre emissor e recetor.",
          },
          {
            id: 2,
            pergunta:
              "A Escuta Ativa numa entrevista ou interrogatório criminológico envolve:",
            opcoes: [
              "Interromper o interlocutor a cada minuto para corrigir erros.",
              "Prestar atenção plena, demonstrar empatia, validar emoções e fazer perguntas clarificadoras sem julgamento precoce.",
              "Ouvir em silêncio enquanto se utilizam as redes sociais no telemóvel.",
              "Apenas gravar a voz sem prestar atenção às palavras.",
            ],
            respostaCorreta: 1,
            dica: "Técnica fundamental de comunicação interpessoal avançada e investigação.",
            justificativa:
              "A escuta ativa constrói relatórios mais precisos ao estabelecer rapport e captar meandros não-ditos pelo entrevistado.",
          },
          {
            id: 3,
            pergunta: "A Comunicação Não-Verbal inclui elementos como:",
            opcoes: [
              "Apenas o texto escrito em e-mails formais.",
              "A escolha do dicionário de termos jurídicos.",
              "A assinatura digital de documentos.",
              "Postura corporal, expressões faciais, contacto visual, gestos e proxémica (distância física).",
            ],
            respostaCorreta: 3,
            dica: "Comunicação efetuada pelo corpo e voz sem uso das palavras explícitas.",
            justificativa:
              "Estudos indicam que a grande percentagem do impacto da comunicação presencial reside na linguagem corporal e paralinguagem.",
          },
          {
            id: 4,
            pergunta: "O estilo de comunicação Assertivo caracteriza-se por:",
            opcoes: [
              "Expressar direitos, ideias e sentimentos de forma clara, direta e respeitosa, sem ser agressivo nem passivo.",
              "Impor opiniões através do medo e do tom de voz agressivo.",
              "Concordar com tudo o que os outros dizem para evitar conflitos.",
              "Comunicar exclusivamente através de mensagens escritas anónimas.",
            ],
            respostaCorreta: 0,
            dica: "Ponto de equilíbrio saudável entre a passividade e a agressividade.",
            justificativa:
              "A assertividade defende posições firmes mantendo o respeito pelas outras partes envolvidas.",
          },
          {
            id: 5,
            pergunta:
              "Num relatório técnico criminológico ou pericial, a linguagem deve priorizar:",
            opcoes: [
              "Jargões poéticos e expressões emotivas pessoais.",
              "Abreviaturas informais típicas de redes sociais.",
              "Clareza, objetividade, precisão técnica e imparcialidade.",
              "Frases ambíguas para deixar margem a dúvidas.",
            ],
            respostaCorreta: 2,
            dica: "O relatório servirá de prova para juízes e investigadores.",
            justificativa:
              "Relatórios periciais exigem rigor descritivo para transmitir factos observáveis sem ambiguidades ou opiniões passionais.",
          },
          {
            id: 6,
            pergunta:
              "O conceito de 'Rapport' em técnicas de entrevista interpessoal refere-se a:",
            opcoes: [
              "Um estado de hostilidade declarada entre as partes.",
              "A construção de uma relação de confiança mútua, empatia e sintonia com o entrevistado.",
              "O ato de ler a ata final da reunião.",
              "O pagamento de custas de consultoria.",
            ],
            respostaCorreta: 1,
            dica: "Estabelecer uma ponte de conexão fluida para obter cooperação.",
            justificativa:
              "Sem rapport, testemunhas ou vítimas tendem a fechar-se e a omitir informações cruciais.",
          },
          {
            id: 7,
            pergunta:
              "A Comunicação Organizacional Interna eficiente numa instituição de segurança serve para:",
            opcoes: [
              "Evitar que os subordinados conversem entre si.",
              "Substituir as reuniões presenciais por boletins anuais.",
              "Esconder falhas operacionais do público.",
              "Alinhar objetivos, otimizar fluxos de trabalho e evitar ruídos de informação entre departamentos.",
            ],
            respostaCorreta: 3,
            dica: "Integração e fluidez de informação dentro da estrutura corporativa ou estatal.",
            justificativa:
              "A comunicação interna integra equipas, garante o cumprimento de ordens técnicas e melhora o clima organizacional.",
          },
          {
            id: 8,
            pergunta:
              "A Proxémica é o ramo da comunicação não-verbal que estuda:",
            opcoes: [
              "O uso, perceção e gestão do espaço físico e da distância interpessoal na comunicação.",
              "O significado das cores das fardas.",
              "O timbre da voz humana.",
              "A velocidade da leitura de relatórios.",
            ],
            respostaCorreta: 0,
            dica: "A distância intencional ou desconfortável entre dois indivíduos.",
            justificativa:
              "Invasões do espaço pessoal podem gerar reações defensivas ou agressivas dependendo do contexto cultural e social.",
          },
          {
            id: 9,
            pergunta:
              "O Feedback construtivo no ambiente de trabalho deve ser focado em:",
            opcoes: [
              "Atacar a personalidade e o caráter do funcionário.",
              "Elogiar sempre, mesmo quando o trabalho é péssimo.",
              "Comportamentos observáveis e factos concretos, oferecendo caminhos de melhoria.",
              "Criticar publicamente diante de toda a equipa.",
            ],
            respostaCorreta: 2,
            dica: "Focalizar o ato/resultado profissional e não a pessoa.",
            justificativa:
              "Feedback de valor aponta discrepâncias entre a expetativa e o desempenho com vista à correção pedagógica.",
          },
          {
            id: 10,
            pergunta:
              "Em Comunicação de Crise (ex: um incidente grave de segurança pública), a posição oficial da instituição deve ser:",
            opcoes: [
              "Esconder os factos e culpar a imprensa.",
              "Rápida, transparente, empática, baseada em factos apurados e transmitida por um porta-voz treinado.",
              "Emitir dados contraditórios para confundir a opinião pública.",
              "Silêncio absoluto durante vários meses.",
            ],
            respostaCorreta: 1,
            dica: "Gestão da reputação e prestação de contas à sociedade.",
            justificativa:
              "O silêncio ou a mentira em momentos de crise destroem a credibilidade institucional perante a população.",
          },
          {
            id: 11,
            pergunta:
              "A Paralinguagem analisa aspectos da comunicação verbal como:",
            opcoes: [
              "O significado literal das palavras no dicionário.",
              "O tipo de papel utilizado na impressão.",
              "A sintaxe e a gramática formal.",
              "O tom de voz, ritmo da fala, volume, pausas e hesitações.",
            ],
            respostaCorreta: 3,
            dica: "Não é o que se diz, mas 'como' se diz vocalmente.",
            justificativa:
              "Alterações no tom ou velocidade da fala frequentemente denunciam estados emocionais subjacentes como ansiedade ou raiva.",
          },
          {
            id: 12,
            pergunta: "A 'Barreira Semântica' na comunicação ocorre quando:",
            opcoes: [
              "O emissor utiliza palavras, termos técnicos ou códigos desconhecidos pelo receptor.",
              "O telemóvel fica sem sinal de rede.",
              "Duas pessoas falam a gritar no mesmo recinto.",
              "O documento é extraviado pelo correio.",
            ],
            respostaCorreta: 0,
            dica: "Dificuldades de compreensão do significado das palavras.",
            justificativa:
              "Falar com cidadãos leigos usando termos jurídicos/médicos ultracomplexos cria uma barreira semântica de incompreensão.",
          },
          {
            id: 13,
            pergunta:
              "Numa negociação de gestão de conflitos, a estratégia 'Ganha-Ganha' (Win-Win) visa:",
            opcoes: [
              "Derrotar e humilhar totalmente a outra parte.",
              "Ceder em tudo sem obter nada em troca.",
              "Encontrar uma solução sustentável que atenda aos interesses fundamentais de ambas as partes.",
              "Transferir a responsabilidade para um terceiro.",
            ],
            respostaCorreta: 2,
            dica: "Abordagem colaborativa baseada na Escola de Negociação de Harvard.",
            justificativa:
              "A negociação baseada em interesses procura criar valor mútuo para alcançar acordos duradouros e estáveis.",
          },
          {
            id: 14,
            pergunta:
              "Perguntas Abertas durante uma investigação comunicacional servem para:",
            opcoes: [
              "Forçar o entrevistado a responder apenas 'Sim' ou 'Não'.",
              "Incentivar o entrevistado a discorrer livremente e fornecer detalhes espontâneos sobre o facto.",
              "Apressar o término da reunião.",
              "Testar a audição do sujeito.",
            ],
            respostaCorreta: 1,
            dica: "Começam geralmente por 'Como...', 'O que...', 'Descreva...'.",
            justificativa:
              "Perguntas abertas evitam induzir a resposta e extraem narrativas mais ricas em pormenores.",
          },
          {
            id: 15,
            pergunta:
              "O 'Efeito de Halo' na perceção interpessoal consiste na tendência de:",
            opcoes: [
              "Generalizar uma impressão global positiva ou negativa de uma pessoa com base num único traço visível (ex: boa apresentação física).",
              "Avaliar pessoas sempre com notas médias estatísticas.",
              "Esquecer os nomes dos colegas de trabalho.",
              "Ignorar completamente a linguagem não-verbal.",
            ],
            respostaCorreta: 0,
            dica: "Vieses cognitivo que afeta julgamentos profissionais e de seleção.",
            justificativa:
              "O Efeito de Halo pode levar um perito ou entrevistador a julgar erroneamente alguém como honesto só porque é articulado ou bem-vestido.",
          },
        ],
      },
      // 10. SOCIOLOGIA GERAL 1
      {
        id: "sociologia-1",
        nome: "Sociologia Geral 1",
        questoes: [
          {
            id: 1,
            pergunta:
              "Émile Durkheim conceptualizou os 'Factos Sociais' como modos de agir, pensar e sentir que possuem as seguintes características centrais:",
            opcoes: [
              "Individuais, passageiros e biológicos.",
              "Exteriores ao indivíduo, coercivos e gerais na sociedade.",
              "Exclusivamente económicos e políticos.",
              "Racionais, voluntários e escolhidos.",
            ],
            respostaCorreta: 1,
            dica: "Exercem pressão de fora para dentro sobre os sujeitos.",
            justificativa:
              "Para Durkheim, os factos sociais existem independentemente das vontades individuais e exercem coerção sobre os membros do grupo.",
          },
          {
            id: 2,
            pergunta:
              "Max Weber propôs como objeto central da Sociologia Compreensiva:",
            opcoes: [
              "As leis biológicas da evolução das espécies.",
              "A contagem simples de multidões nas cidades.",
              "A Ação Social e os sentidos subjetivos atribuídos pelos indivíduos ao seu comportamento.",
              "A produção industrial de bens.",
            ],
            respostaCorreta: 2,
            dica: "Foca-se no significado (sentido) que a pessoa dá à sua conduta ao interagir com outros.",
            justificativa:
              "Weber procurava compreender o sentido condutor que os indivíduos dão às suas ações nas relações interpessoais.",
          },
          {
            id: 3,
            pergunta:
              "Karl Marx explicava a estrutura e a dinâmica de transformação das sociedades fundamentalmente a partir da:",
            opcoes: [
              "Luta de classes e das relações materiais de produção (Materialismo Histórico).",
              "Harmonia e cooperação natural entre classes.",
              "Religião e moralidade individual.",
              "Genética e clima geográfico.",
            ],
            respostaCorreta: 0,
            dica: "A história de todas as sociedades é a história da luta de classes.",
            justificativa:
              "Marx via nos conflitos entre possuidores dos meios de produção (burguesia) e trabalhadores (proletariado) o motor das mudanças sociais.",
          },
          {
            id: 4,
            pergunta:
              "O conceito de 'Anomia' em Durkheim manifesta-se quando a sociedade padece de:",
            opcoes: [
              "Excesso de leis e autoritarismo militar.",
              "Excesso de riqueza distribuída por igual.",
              "Um nível muito elevado de instrução universitária.",
              "Ausência, enfraquecimento ou desregulação das normas sociais e morais reguladoras.",
            ],
            respostaCorreta: 3,
            dica: "Estado de falta de regras orientadoras das condutas individuais.",
            justificativa:
              "Na anomia, as normas perdem a força coerciva e protetora, gerando desorientação e aumento de comportamentos desviantes.",
          },
          {
            id: 5,
            pergunta:
              "O processo de 'Socialização Primária' ocorre predominantemente durante:",
            opcoes: [
              "A idade adulta no ambiente corporativo de trabalho.",
              "A infância, no seio da família e das primeiras redes comunitárias.",
              "A aposentadoria e velhice.",
              "O serviço militar obrigatório.",
            ],
            respostaCorreta: 1,
            dica: "Fase de construção da identidade fundamental da criança.",
            justificativa:
              "É na socialização primária que a criança interioriza a linguagem, os valores básicos e o mundo social inicial através da família.",
          },
          {
            id: 6,
            pergunta:
              "Instituições Sociais são concceituadas na Sociologia como:",
            opcoes: [
              "Edifícios públicos construídos pelo governo.",
              "Grupos temporários de pessoas num concerto de música.",
              "Estruturas relativamente estáveis de normas, papéis e valores que organizam atividades humanas essenciais (ex: Família, Escola, Estado).",
              "Empresas privadas com fins de lucro.",
            ],
            respostaCorreta: 2,
            dica: "Padrões duradouros de organização social.",
            justificativa:
              "As instituições moldam o comportamento coletivo e transmitem a herança cultural de geração em geração.",
          },
          {
            id: 7,
            pergunta:
              "A 'Mobilidade Social Ascendente' descreve a trajetória de um indivíduo que:",
            opcoes: [
              "Melhora a sua posição socioeconómica na hierarquia de estratificação social.",
              "Muda de país sem alterar a sua profissão.",
              "Perde o seu património e fica desempregado.",
              "Mantém rigorosamente o mesmo salário a vida toda.",
            ],
            respostaCorreta: 0,
            dica: "Subida na pirâmide de classes sociais.",
            justificativa:
              "A mobilidade ascendente reflete o ganho de prestígio, rendimento ou poder dentro da estrutura social.",
          },
          {
            id: 8,
            pergunta:
              "O conceito de 'Ethnocentrismo' traduz-se pela tendência de:",
            opcoes: [
              "Respeitar e defender todas as culturas por igual.",
              "Estudar línguas antigas e arqueologia.",
              "Migrar constantemente entre diferentes países.",
              "Avaliar e julgar outras culturas a partir dos padrões e valores da sua própria cultura, vista como superior.",
            ],
            respostaCorreta: 3,
            dica: "Colocar a própria etnia/cultura no centro de tudo.",
            justificativa:
              "O etnocentrismo gera preconceito e discriminação ao encarar a diversidade cultural como 'inferior' ou 'anormal'.",
          },
          {
            id: 9,
            pergunta:
              "O Relativismo Cultural opõe-se ao etnocentrismo defendendo que:",
            opcoes: [
              "Existem culturas objetivamente superiores a outras.",
              "Cada manifestação cultural deve ser compreendida dentro do seu próprio contexto histórico e lógica interna.",
              "Todas as culturas devem adotar as leis ocidentais.",
              "A cultura não afeta a vida dos indivíduos.",
            ],
            respostaCorreta: 1,
            dica: "Compreender o outro sem impor os seus próprios pré-conceitos.",
            justificativa:
              "O relativismo cultural metodológico procura suspender julgamentos morais de valor para compreender o sentido das práticas sociais.",
          },
          {
            id: 10,
            pergunta:
              "A passagem da 'Solidariedade Mecânica' para a 'Solidariedade Orgânica' em Durkheim é impulsionada por:",
            opcoes: [
              "Diminuição da população do planeta.",
              "Construção de impérios militares.",
              "Aumento da divisão do trabalho social e da complexidade das sociedades modernas.",
              "Retorno à vida puramente agrícola.",
            ],
            respostaCorreta: 2,
            dica: "Sociedades tradicionais (semelhança) versus sociedades modernas (interdependência funcional).",
            justificativa:
              "Na solidariedade orgânica moderna, a coesão social resulta da interdependência criada pela especialização do trabalho.",
          },
          {
            id: 11,
            pergunta:
              "Para Max Weber, a 'Burocracia' é a forma mais pura de exercício da dominação:",
            opcoes: [
              "Legal-Racional.",
              "Carismática.",
              "Tradicional.",
              "Afetiva.",
            ],
            respostaCorreta: 0,
            dica: "Assenta na crença na legalidade das estatutos e regras abstratas.",
            justificativa:
              "A dominação legal-racional fundamenta-se em normas escritas, impessoalidade e hierarquia técnica regulada.",
          },
          {
            id: 12,
            pergunta:
              "O conceito sociológico de 'Estratificação Social' diz respeito a:",
            opcoes: [
              "Estudo das camadas geológicas da terra.",
              "Formações rochosas marinhas.",
              "Apenas à divisão por sexo biológuco.",
              "A distribuição desigual de indivíduos e grupos em camadas ou hierarquias sociais com acesso diferenciado a recursos e prestígio.",
            ],
            respostaCorreta: 3,
            dica: "Divisão da sociedade em estratos (ex: classes, castas, estamentos).",
            justificativa:
              "A estratificação analisa como o poder, o dinheiro e o prestígio são distribuídos de modo desigual na estrutura social.",
          },
          {
            id: 13,
            pergunta: "Em Sociologia, um 'Papel Social' consiste em:",
            opcoes: [
              "O documento de identificação pessoal (B.I.).",
              "O conjunto de comportamentos, deveres e expetativas associados a um determinado estatuto social (ex: papel de médico, de professor, de aluno).",
              "Um contrato de aluguer escrito.",
              "Uma apresentação teatral profissional.",
            ],
            respostaCorreta: 1,
            dica: "O lado dinâmico do estatuto social.",
            justificativa:
              "A sociedade espera que o indivíduo aja de acordo com os padrões definidos para o papel que desempenha na estrutura.",
          },
          {
            id: 14,
            pergunta: "A 'Cultura Imaterial' engloba elementos como:",
            opcoes: [
              "Ferramentas de ferro, edifícios e estradas.",
              "Automóveis e computadores.",
              "Crenças, valores, normas, linguagem, tradições e conhecimentos transmitidos oralmente.",
              "Sistemas de iluminação pública.",
            ],
            respostaCorreta: 2,
            dica: "Bens não tangíveis ou físicos da herança social.",
            justificativa:
              "Ao contrário da cultura material (objetos), a cultura imaterial reside nos saberes, significados e símbolos coletivos.",
          },
          {
            id: 15,
            pergunta:
              "O conceito de 'Desvio Social' na Sociologia define-se como:",
            opcoes: [
              "Qualquer comportamento ou ação que viole as normas e expetativas partilhadas por um grupo social ou comunidade.",
              "Qualquer doença mental medicada.",
              "Errar o caminho durante uma viagem rodoviária.",
              "Optar por uma profissão artística.",
            ],
            respostaCorreta: 0,
            dica: "Conduta que se afasta do padrão de normalidade definido pela coletividade.",
            justificativa:
              "O desvio é definido socioculturalmente e abrange desde pequenas quebras de etiqueta até infrações graves à lei penal.",
          },
        ],
      },
    ],
  },
  {
    id: "mod-2",
    titulo: "Nível 2: Base do Aprofundamento",
    disciplinas: [
      {
        id: "criminologia-experimental",
        nome: "Criminologia Experimental",
        questoes: [
          {
            id: 1,
            pergunta:
              "Qual é o objetivo principal dos experimentos aleatorizados (RCTs) na Criminologia Experimental?",
            opcoes: [
              "Demonstrar a culpa do réu no processo penal",
              "Substituir o julgamento magistral por algoritmos",
              "Testar a eficácia de intervenções criminais isolando variáveis de confusão",
              "Mapear historicamente o crime na Idade Média",
            ],
            respostaCorreta: 2,
            dica: "Pense num desenho experimental que compara grupos para isolar causa e efeito.",
            justificativa:
              "Os Ensaios Controlados Aleatorizados (RCTs) isolam variáveis para determinar relações de causa e efeito em políticas criminais.",
          },
          {
            id: 2,
            pergunta:
              "O que caracteriza o 'Experimento de Policiamento de Minneapolis' (Sherman & Berk, 1984)?",
            opcoes: [
              "A comparação do impacto da prisão versus mediação em casos de violência doméstica",
              "O uso de drones para patrulhamento noturno",
              "A privatização do sistema prisional local",
              "A legalização de substâncias ilícitas na região central",
            ],
            respostaCorreta: 0,
            dica: "Um dos estudos policiais mais citados sobre resposta a violência doméstica.",
            justificativa:
              "O estudo testou aleatoriamente três respostas policiais (prender, aconselhar ou afastar o agressor) para medir a reincidência.",
          },
          {
            id: 3,
            pergunta:
              "Em criminologia experimental, o que significa a 'validade interna' de uma pesquisa?",
            opcoes: [
              "A capacidade de aplicar o resultado a qualquer país do mundo",
              "A aprovação do projeto de pesquisa pelo tribunal de justiça",
              "O custo orçamentário do experimento no ambiente prisional",
              "A certeza de que a intervenção testada foi a verdadeira causa do resultado observado",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se com o rigor causal dentro do próprio estudo.",
            justificativa:
              "Validade interna refere-se ao rigor do design em garantir que as mudanças na variável dependente foram causadas pela intervenção.",
          },
          {
            id: 4,
            pergunta:
              "O que define a 'validade externa' de um experimento criminológico?",
            opcoes: [
              "A aceitação pública da pena aplicada aos criminosos",
              "O grau em que os achados podem ser generalizados para outros contextos e populações",
              "A quantidade de policiais envolvidos na recolha de dados",
              "A publicação do estudo em revistas internacionais",
            ],
            respostaCorreta: 1,
            dica: "Pensa em 'exterior' ao estudo — aplicação a outros lugares.",
            justificativa:
              "Validade externa trata da generalização dos resultados de uma amostra para cenários do mundo real.",
          },
          {
            id: 5,
            pergunta:
              "Qual o principal obstáculo ético frequentemente enfrentado na Criminologia Experimental?",
            opcoes: [
              "O custo elevado dos computadores para análise",
              "A falta de livros sobre o tema nas bibliotecas",
              "A negação deliberada de uma intervenção benéfica ao grupo de controlo",
              "A recusa dos criminólogos em ir a campo",
            ],
            respostaCorreta: 2,
            dica: "Pensa no dilema de dividir pessoas em 'recebe ajuda' vs 'não recebe'.",
            justificativa:
              "Alocar indivíduos aleatoriamente para 'tratamento' ou 'não tratamento' pode privar um grupo de um serviço preventivo crucial.",
          },
          {
            id: 6,
            pergunta:
              "Na matriz de evidências da criminologia (Escola de Maryland), qual nível representa maior rigor científico?",
            opcoes: [
              "Nível 1 (Correlações simples)",
              "Nível 3 (Estudos antes-depois)",
              "Nível 0 (Opinião de peritos)",
              "Nível 5 (Ensaios aleatorizados/RCTs)",
            ],
            respostaCorreta: 3,
            dica: "O nível mais alto é sempre o método mais controlado.",
            justificativa:
              "O Nível 5 na escala de rigor científico de Maryland é reservado para experimentos aleatorizados bem executados.",
          },
          {
            id: 7,
            pergunta:
              "O que é o efeito 'Hawthorne' no contexto de experimentos de prevenção criminal?",
            opcoes: [
              "A alteração do comportamento dos sujeitos simplesmente por saberem que estão a ser observados",
              "O aumento da criminalidade em épocas festivas",
              "A redução imediata da violência após a construção de um presídio",
              "A falha nos equipamentos eletrónicos de monitorização",
            ],
            respostaCorreta: 0,
            dica: "Já viste este conceito noutra disciplina sobre metodologia.",
            justificativa:
              "Se os alvos ou policiais sabem que fazem parte de um estudo, o seu comportamento muda temporariamente apenas pela atenção recebida.",
          },
          {
            id: 8,
            pergunta:
              "O que caracteriza um experimento de campo (field experiment) em criminologia?",
            opcoes: [
              "É realizado dentro de um laboratório fechado com simulações no computador",
              "É conduzido em ambiente real da vida cotidiana, aplicando intervenções sociais diretas",
              "Analisa apenas documentos históricos de tribunais medievais",
              "Depende exclusivamente de questionários enviados por correio",
            ],
            respostaCorreta: 1,
            dica: "Acontece nas ruas, prisões ou comunidades reais.",
            justificativa:
              "Experimentos de campo aplicam tratamentos experimentais nos contextos sociais naturais onde o crime ocorre.",
          },
          {
            id: 9,
            pergunta:
              "Qual é o papel do 'Grupo de Controlo' em um estudo experimental criminológico?",
            opcoes: [
              "Fiscalizar o trabalho dos investigadores",
              "Prender os infratores que não participarem da pesquisa",
              "Fornecer uma linha de base de comparação sem receber a intervenção testada",
              "Financiar os custos operacionais da universidade",
            ],
            respostaCorreta: 2,
            dica: "Serve para comparar o que acontece quando a intervenção NÃO é aplicada.",
            justificativa:
              "O grupo de controlo permite verificar o que teria ocorrido naturalmente sem a presença da variável ou programa sob teste.",
          },
          {
            id: 10,
            pergunta:
              "A 'Revisão Sistemática' aliada à 'Meta-análise' na Criminologia Experimental busca:",
            opcoes: [
              "Entrevistar novamente todas as vítimas de um crime",
              "Substituir o Código Penal por artigos de jornal",
              "Eliminar o uso de estatística na criminologia moderna",
              "Sintetizar quantitativamente os resultados de múltiplos estudos experimentais independentes",
            ],
            respostaCorreta: 3,
            dica: "Reúne múltiplos experimentos para chegar a uma conclusão agregada.",
            justificativa:
              "Meta-análises combinam os efeitos estatísticos de vários experimentos (como os da Campbell Collaboration) para avaliar o impacto real de uma política.",
          },
          {
            id: 11,
            pergunta:
              "O que diferencia um 'Quase-Experimento' de um 'Experimento Puro' (RCT)?",
            opcoes: [
              "A ausência de alocação aleatória dos participantes entre os grupos",
              "A proibição total de usar dados quantitativos",
              "O fato de ser realizado exclusivamente por policiais sem acadêmicos",
              "A obrigatoriedade de ser feito em apenas 24 horas",
            ],
            respostaCorreta: 0,
            dica: "Observe a palavra-chave: aleatorização.",
            justificativa:
              "Em quase-experimentos, os grupos de tratamento e comparação são formados sem amostragem/atribuição estritamente aleatória.",
          },
          {
            id: 12,
            pergunta:
              "O conceito de 'Deslocamento do Crime' em avaliações experimentais de policiamento refere-se a:",
            opcoes: [
              "A eliminação definitiva de todos os delitos na cidade.",
              "A alteração do crime para outro local, horário, método ou alvo devido ao aumento do policiamento.",
              "A conversão de crimes violentos em crimes financeiros.",
              "O aumento do orçamento policial para transporte.",
            ],
            respostaCorreta: 1,
            dica: "Quando a pressão policial num ponto obriga o infrator a mudar de tática ou local.",
            justificativa:
              "O deslocamento ocorre quando a intervenção preventiva não elimina a motivação criminal, fazendo com que a atividade delinquente migre no espaço, tempo ou método.",
          },
          {
            id: 13,
            pergunta:
              "O que é a 'Difusão de Benefícios' observada em programas de prevenção situacional?",
            opcoes: [
              "A proliferação de crimes não violentos na periferia",
              "A perda de verba governamental para segurança pública",
              "A extensão da redução criminal para áreas ou horários adjacentes ao local da intervenção",
              "A contaminação da amostra de dados por vírus de computador",
            ],
            respostaCorreta: 2,
            dica: "O oposto do deslocamento do crime; um ganho extra involuntário.",
            justificativa:
              "Difusão de benefícios ocorre quando a prevenção numa zona gera redução do crime em áreas próximas não tratadas diretamente.",
          },
          {
            id: 14,
            pergunta:
              "Qual a importância da 'Regra do Consentimento Informado' na criminologia experimental?",
            opcoes: [
              "Permitir ao pesquisador publicar dados confidenciais com o nome do réu",
              "Isentar o Estado de prestar assistência jurídica ao réu",
              "Obrigar o sujeito a responder a todas as perguntas sem recusa",
              "Garantir que o participante compreenda os riscos e aceite voluntariamente integrar o estudo",
            ],
            respostaCorreta: 3,
            dica: "Trata-se de um pilar ético universal em pesquisas com seres humanos.",
            justificativa:
              "O consentimento informado assegura que os sujeitos da pesquisa conheçam os procedimentos e concordem livremente em participar.",
          },
          {
            id: 15,
            pergunta:
              "Em Criminologia Experimental, o 'Tratamento' refere-se a:",
            opcoes: [
              "A intervenção, programa ou política pública específica que está sendo testada",
              "Atendimento médico de emergência oferecido na prisão",
              "O interrogatório coercitivo realizado em delegacia",
              "O julgamento em segunda instância nos tribunais",
            ],
            respostaCorreta: 0,
            dica: "É a variável independente manipulada pelo pesquisador.",
            justificativa:
              "Tratamento é o programa, sanção ou estratégia cujo impacto causal está sendo mensurado durante o experimento.",
          },
        ],
      },
      {
        id: "ciencia-do-comportamento-desviante",
        nome: "Ciência do Comportamento Desviante",
        questoes: [
          {
            id: 1,
            pergunta:
              "Como a Sociologia do Desvio define 'Comportamento Desviante'?",
            opcoes: [
              "Qualquer ato que viole regras biológicas de hereditariedade",
              "Doença mental clinicamente diagnosticada pelo CID",
              "Crimes exclusivamente previstos no Código Penal Militar",
              "Conduta que viola as normas sociais estabelecidas e sancionadas por uma comunidade",
            ],
            respostaCorreta: 3,
            dica: "Foque nas expectativas e normas da sociedade, não apenas na lei penal.",
            justificativa:
              "O desvio é definido socioculturalmente como a violação de normas aceitas por determinado grupo social.",
          },
          {
            id: 2,
            pergunta:
              "Segundo a Teoria da Rotulagem (Labeling Approach), o desvio secundário ocorre quando:",
            opcoes: [
              "O indivíduo reorganiza sua identidade social ao redor do rótulo de desviante recebido",
              "O indivíduo comete o primeiro delito sem ser descoberto",
              "O Estado anula a pena do condenado por bom comportamento",
              "A vítima perdoa o agressor em audiência de conciliação",
            ],
            respostaCorreta: 0,
            dica: "Involucra a internalização do rótulo de 'criminoso/desviante'.",
            justificativa:
              "O desvio secundário surge da reação social e da aceitação do rótulo, fazendo o sujeito adotar o papel de desviante.",
          },
          {
            id: 3,
            pergunta:
              "Na Teoria da Anomia de Robert Merton, a conformidade é caracterizada por:",
            opcoes: [
              "Rejeitar as metas culturais e aceitar os meios institucionalizados",
              "Aceitar tanto as metas culturais quanto os meios institucionalizados para atingi-las",
              "Utilizar meios ilícitos para obter sucesso financeiro rápido",
              "Abandonar completamente a vida em sociedade",
            ],
            respostaCorreta: 1,
            dica: "É o comportamento padrão e adaptado da maioria dos cidadãos.",
            justificativa:
              "Merton define conformidade como a adesão simultânea às metas culturais aceitas e aos meios legítimos.",
          },
          {
            id: 4,
            pergunta: "Qual a diferença entre desvio formal e desvio informal?",
            opcoes: [
              "O formal ocorre de dia; o informal ocorre à noite",
              "O formal é praticado por adultos; o informal por adolescentes",
              "O formal viola leis escritas; o informal viola costumes e convenções sociais",
              "O formal não possui sanção; o informal gera pena de prisão",
            ],
            respostaCorreta: 2,
            dica: "Pense em leis oficiais vs. boas maneiras/etiqueta.",
            justificativa:
              "Desvio formal infringe a lei (crimes), enquanto o informal viola normas sociais não codificadas (tabus, costumes).",
          },
          {
            id: 5,
            pergunta:
              "Para Edwin Sutherland (Teoria da Associação Diferencial), o comportamento criminoso é:",
            opcoes: [
              "Herdado geneticamente dos pais",
              "Fruto de possessão de traços atávicos de Lombroso",
              "Causado unicamente pelo clima e geografia",
              "Aprendido em interação com outras pessoas mediante processos de comunicação",
            ],
            respostaCorreta: 3,
            dica: "O crime aprende-se em grupo, tal como qualquer outro oficio.",
            justificativa:
              "Sutherland defende que o comportamento desviante é aprendido pela interação interpessoal em grupos íntimos.",
          },
          {
            id: 6,
            pergunta:
              "O conceito de 'Empresários da Moral' desenvolvido por Howard Becker designa:",
            opcoes: [
              "Indivíduos que lideram campanhas para criar e impor novas regras e rótulos morais",
              "Líderes de facções criminosas que gerenciam o tráfico",
              "Empresários que financiam a segurança privada",
              "Juízes que cobram taxas para julgar processos",
            ],
            respostaCorreta: 0,
            dica: "Pessoas que lutam para transformar seus valores pessoais em leis formais.",
            justificativa:
              "Becker define empresários morais como agentes que promovem cruzadas para criminalizar ou estigmatizar certas condutas.",
          },
          {
            id: 7,
            pergunta:
              "Na Teoria do Controlo Social de Travis Hirschi, o que impede a pessoa de cometer atos desviantes?",
            opcoes: [
              "O medo da dor física causada pelas punições corporais",
              "A força dos laços sociais (apego, compromisso, envolvimento e crença)",
              "A presença constante de câmeras de vigilância",
              "O alto nível de inteligência acadêmica do indivíduo",
            ],
            respostaCorreta: 1,
            dica: "Pense no que nos conecta à família, escola e comunidade.",
            justificativa:
              "Hirschi argumenta que o vínculo do indivíduo com a sociedade impede o engajamento em condutas desviantes.",
          },
          {
            id: 8,
            pergunta:
              "De acordo com Merton, o modo de adaptação anômico da 'Inovação' consiste em:",
            opcoes: [
              "Aceitar os meios legítimos e rejeitar as metas de sucesso",
              "Rejeitar tanto as metas quanto os meios e criar uma nova sociedade",
              "Aceitar as metas culturais de sucesso, mas utilizar meios ilícitos/ilegítimos para alcançá-las",
              "Cumprir cegamente a rotina sem ambições",
            ],
            respostaCorreta: 2,
            dica: "Muito comum em crimes patrimoniais e de colarinho branco.",
            justificativa:
              "A inovação ocorre quando se deseja o sucesso financeiro (meta), mas se recorre ao crime (meios ilícitos) para alcançá-lo.",
          },
          {
            id: 9,
            pergunta:
              "O conceito de 'Estigma' segundo Erving Goffman é definido como:",
            opcoes: [
              "Um prêmio concedido a cidadãos exemplares",
              "Um contrato formal de trabalho temporário",
              "Um exame toxicológico negativo",
              "Um atributo profundamente depreciativo que reduz o indivíduo de uma pessoa comum a uma pessoa estragada",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se à marca social que desqualifica a identidade de alguém.",
            justificativa:
              "Goffman analisa o estigma como a marca social que desacredita o sujeito perante a sociedade.",
          },
          {
            id: 10,
            pergunta:
              "A Teoria da Neutralização (Sykes e Matza) explica como os delinquentes:",
            opcoes: [
              "Utilizam justificativas mentais para racionalizar e desacreditar a culpa de seus atos desviantes",
              "Eliminam vestígios químicos da cena do crime",
              "Convertem-se a religiões para fugir da prisão",
              "Pagam fiança para responder ao processo em liberdade",
            ],
            respostaCorreta: 0,
            dica: "Técnicas como 'negação da responsabilidade' ou 'negação da vítima'.",
            justificativa:
              "Técnicas de neutralização são racionalizações prévias que protegem o indivíduo da auto-recriminação ao transgredir.",
          },
          {
            id: 11,
            pergunta:
              "Qual das alternativas representa a adaptação do 'Ritualismo' na Teoria da Anomia?",
            opcoes: [
              "Uso de violência para mudar a constituição do país",
              "Abandono das metas de sucesso financeiro, mas apego compulsivo às regras institucionais",
              "Uso de drogas em isolamento social completo",
              "Prática de furto mediante fraude",
            ],
            respostaCorreta: 1,
            dica: "A pessoa desiste de subir na vida, mas segue as regras ao pé da letra.",
            justificativa:
              "O ritualista abandona as grandes metas de ascensão social, mas apoia-se rigidamente na rotina e nas normas.",
          },
          {
            id: 12,
            pergunta: "A perspectiva da reação social afirma que o desvio:",
            opcoes: [
              "Existe intrinsecamente na natureza de certos atos humanos",
              "É determinado exclusivamente pela estrutura metabólica da pessoa",
              "Não é uma qualidade do ato, mas uma consequência da aplicação de regras e sanções aos 'infratores'",
              "Desaparecerá com o avanço tecnológico dos telemóveis",
            ],
            respostaCorreta: 2,
            dica: "O foco muda da ação para a reação dos outros.",
            justificativa:
              "A reação social defende que a qualidade de 'desviante' depende de como a sociedade interpreta e rotula a ação.",
          },
          {
            id: 13,
            pergunta: "O desvio primário na Teoria da Rotulagem refere-se a:",
            opcoes: [
              "O último crime cometido antes da prisão perpétua",
              "Crimes cometidos exclusivamente na infância antes dos 10 anos",
              "Violações de normas cometidas por autoridades governamentais",
              "Ato desviante inicial que não altera fundamentalmente a autoimagem do sujeito",
            ],
            respostaCorreta: 3,
            dica: "Ocorre de forma esporádica e sem assumir a identidade desviante.",
            justificativa:
              "Desvio primário engloba transgressões normais ou temporárias que não geram um rótulo permanente nem afetam a identidade.",
          },
          {
            id: 14,
            pergunta:
              "O conceito de 'Controlo Social Informal' engloba sanções executadas por:",
            opcoes: [
              "Família, vizinhos, colegas de trabalho e opinião pública mediante olhares, fofocas ou isolamento",
              "Tribunais supremos de justiça e polícia judicial",
              "Sistemas penitenciários de alta segurança",
              "Decretos presidenciais e leis estaduais",
            ],
            respostaCorreta: 0,
            dica: "Agentes do dia a dia sem poder de polícia institucional.",
            justificativa:
              "O controlo informal atua através do convívio interpessoal e de reações interpessoais não codificadas.",
          },
          {
            id: 15,
            pergunta: "Em sociologia, o termo 'Subcultura Desviante' descreve:",
            opcoes: [
              "Uma doença neurológica infecciosa coletiva",
              "Um grupo social cujos valores e normas diferem e desafiam os padrões da cultura dominante",
              "O hábito de ler romances policiais no transporte público",
              "A recusa em utilizar moedas digitais na economia local",
            ],
            respostaCorreta: 1,
            dica: "Um subgrupo com normas próprias contrárias à sociedade ampla.",
            justificativa:
              "Subculturas desviantes oferecem sistemas de valores alternativos que legitimam comportamentos reprimidos pela maioria.",
          },
        ],
      },
      {
        id: "direito-penal-1",
        nome: "Direito Penal 1",
        questoes: [
          {
            id: 1,
            pergunta:
              "Qual é o pilar fundamental do Princípio da Legalidade no Direito Penal (Nullum crimen, nulla poena sine lege)?",
            opcoes: [
              "O juiz pode criar novos crimes se considerar a conduta imoral",
              "A polícia pode aplicar penas de prisão sem julgamento em casos de flagrante",
              "Não há crime nem pena sem lei anterior que os defina expressamente",
              "O costume local prevalece sobre o texto escrito na lei penal",
            ],
            respostaCorreta: 2,
            dica: "Garantia constitucional básica do cidadão perante o Estado.",
            justificativa:
              "O princípio da legalidade exige lei prévia, escrita e estrita para a definição de infrações e sanções penais.",
          },
          {
            id: 2,
            pergunta:
              "O princípio da Irretroatividade da Lei Penal maléfica determina que:",
            opcoes: [
              "Leis novas sempre se aplicam a fatos passados independente da pena",
              "O réu deve ser julgado pelas leis de outros países se for estrangeiro",
              "A lei penal retroage apenas para aumentar a pena pecuniária",
              "A lei penal nova mais severa nunca retroage para prejudicar o réu",
            ],
            respostaCorreta: 3,
            dica: "A lei só retroage se for para beneficiar (lex mitior).",
            justificativa:
              "A norma penal mais gravosa não pode ser aplicada a fatos cometidos antes de sua vigência.",
          },
          {
            id: 3,
            pergunta:
              "Conforme a Teoria Tripartida do Crime, a infração penal é constituída por:",
            opcoes: [
              "Fato Típico, Antijurídico (Ilícito) e Culpável",
              "Fato Moral, Religioso e Legal",
              "Ação, Intenção e Confissão",
              "Dano Material, Lucro Cessante e Dano Moral",
            ],
            respostaCorreta: 0,
            dica: "Estrutura clássica do conceito analítico de crime.",
            justificativa:
              "O conceito analítico de crime exige tipicidade, antijuridicidade e culpabilidade para a caracterização do delito.",
          },
          {
            id: 4,
            pergunta: "O que caracteriza o 'Dolo Direto' no direito penal?",
            opcoes: [
              "O agente age por imprudência sem prever o perigo",
              "O agente prevê o resultado e quer efetivamente realizá-lo",
              "O agente aceita o risco de produzir o resultado sem o desejar diretamente",
              "O agente comete o crime dormindo ou em estado de hipnose",
            ],
            respostaCorreta: 1,
            dica: "Vontade consciente e direcionada ao fim criminoso.",
            justificativa:
              "No dolo direto de primeiro grau, a intenção do agente está focada no alcance do resultado proibido.",
          },
          {
            id: 5,
            pergunta:
              "Qual das seguintes hipóteses constitui uma Causa de Exclusão da Ilicitude (Antijuridicidade)?",
            opcoes: [
              "Embriaguez voluntária por álcool",
              "Coação moral resistível",
              "Desconhecimento da lei penal",
              "Legítima Defesa",
            ],
            respostaCorreta: 3,
            dica: "Conduta que repele injusta agressão, atual ou iminente.",
            justificativa:
              "A legítima defesa torna a conduta típica em um ato lícito/justificado pelo ordenamento penal.",
          },
          {
            id: 6,
            pergunta:
              "O que distingue a 'Negação do Padrão de Cuidado' na Culpa Consciente do 'Dolo Eventual'?",
            opcoes: [
              "No dolo eventual o agente não prevê o resultado em hipótese alguma",
              "A culpa consciente gera penas maiores que o dolo direto",
              "Na culpa consciente, o agente prevê o resultado, mas confia sinceramente que ele não ocorrerá",
              "Não há diferença teórica ou prática entre ambas",
            ],
            respostaCorreta: 2,
            dica: "Em uma o agente assume o risco; na outra, confia nas suas habilidades para evitar.",
            justificativa:
              "No dolo eventual o sujeito assume/indiferencia-se para com o risco; na culpa consciente ele repudia o resultado esperando evitá-lo.",
          },
          {
            id: 7,
            pergunta: "O Estado de Necessidade pressupõe a existência de:",
            opcoes: [
              "Uma situação de perigo atual para bem jurídico próprio ou alheio, não provocado voluntariamente pelo agente",
              "Uma agressão humana ilícita e intencional contra o agente",
              "Uma ordem superior hierárquica para cometer um crime",
              "A prática de ato de vingança após o término da violência",
            ],
            respostaCorreta: 0,
            dica: "Conflito entre bens jurídicos legítimos diante de uma situação de perigo real.",
            justificativa:
              "O estado de necessidade justifica a lesão a um bem protegido para salvar outro de valor igual ou superior em perigo atual.",
          },
          {
            id: 8,
            pergunta:
              "O Princípio da Insignificância (ou Bagatela) atua sobre qual elemento do crime?",
            opcoes: [
              "Exclui a Culpabilidade pela imaturidade do agente",
              "Exclui a Tipicidade Material devido à irrelevância da lesão ao bem jurídico",
              "Aumenta a pena pelo desrespeito à norma pública",
              "Anula o direito de defesa do réu",
            ],
            respostaCorreta: 1,
            dica: "O Direito Penal não deve se ocupar de insignificâncias (minimis non curat praetor).",
            justificativa:
              "A insignificância afasta a tipicidade material, pois a conduta não gera lesão grave bastante para acionar o Direito Penal.",
          },
          {
            id: 9,
            pergunta: "Quando ocorre a 'Tentativa' de um delito?",
            opcoes: [
              "Quando o agente apenas cogita na sua mente praticar o crime",
              "Quando o crime é totalmente concluído com sucesso",
              "Quando a execução é iniciada, mas o resultado não se consuma por circunstâncias alheias à vontade do agente",
              "Quando o agente se arrepende voluntariamente e repara o dano antes da denúncia",
            ],
            respostaCorreta: 2,
            dica: "Atos executórios iniciados, mas sem consumação por fatores externos.",
            justificativa:
              "A tentativa ocorre quando o iter criminis é interrompido por razões estranhas à vontade do autor.",
          },
          {
            id: 10,
            pergunta:
              "O que caracteriza a 'Inimputabilidade' por anomalia psíquica?",
            opcoes: [
              "O fato de ter menos de 40 anos de idade",
              "A prática de crimes em dias chuvosos",
              "O analfabetismo funcional do infrator",
              "A incapacidade do agente de entender o caráter ilícito do fato ou de determinar-se segundo esse entendimento ao tempo da ação",
            ],
            respostaCorreta: 3,
            dica: "Incapacidade biopsíquica de compreender a ilicitude do ato.",
            justificativa:
              "Inimputáveis não possuem discernimento mental no momento do ato, o que afasta o elemento culpabilidade.",
          },
          {
            id: 11,
            pergunta:
              "O Arrependimento Eficaz difere da Desistência Voluntária porque no Arrependimento Eficaz:",
            opcoes: [
              "O agente para a execução no meio sem terminar os atos que pretendia",
              "O agente conclui o processo de execução, mas impede que o resultado se produza",
              "A vítima morre antes da intervenção médica",
              "A polícia impede o disparo da arma com um tiro de contenção",
            ],
            respostaCorreta: 1,
            dica: "O ciclo executório foi concluído, mas o autor atua ativamente para evitar o resultado final.",
            justificativa:
              "No arrependimento eficaz, todos os atos executórios foram praticados, mas o autor desenvolve nova ação que impede o resultado.",
          },
          {
            id: 12,
            pergunta:
              "Qual teoria do nexo causal é predominantemente adotada no Direito Penal para determinar a causa do resultado?",
            opcoes: [
              "Teoria da Equivalência das Condições (Conditio sine qua non)",
              "Teoria da Imputação Objetiva estrita sem conduta",
              "Teoria do Acaso Biológico",
              "Teoria da Culpa Exclusiva da Vítima Absoluta",
            ],
            respostaCorreta: 0,
            dica: "Considera-se causa todo antecedente sem o qual o resultado não teria ocorrido.",
            justificativa:
              "Pela regra do 'conditio sine qua non', qualquer ação que concorra diretamente para o resultado é considerada sua causa.",
          },
          {
            id: 13,
            pergunta: "O Erro de Tipo Essencial incide sobre:",
            opcoes: [
              "A ilicitude da conduta moral do agente",
              "O valor da taxa de custas judiciais do tribunal",
              "Os elementos constitutivos do tipo penal (fatos ou dados da realidade)",
              "A nacionalidade do juiz do processo",
            ],
            respostaCorreta: 2,
            dica: "A pessoa não sabe exatamente o que está fazendo no plano factual (ex.: atirar num homem achando ser um urso).",
            justificativa:
              "O erro de tipo incide sobre elementos objetivos do tipo legal, eliminando sempre o dolo.",
          },
          {
            id: 14,
            pergunta:
              "O Princípio da Intervenção Mínima (Ultima Ratio) preconiza que o Direito Penal:",
            opcoes: [
              "Deve ser aplicado a qualquer tipo de conflito social, por menor que seja",
              "Deve ser a primeira opção do legislador para resolver problemas econômicos",
              "Apenas se aplica a cidadãos de baixa renda",
              "Só deve atuar quando os demais ramos do Direito forem insuficientes para proteger os bens jurídicos fundamentais",
            ],
            respostaCorreta: 3,
            dica: "O Direito Penal é a última cartada da proteção jurídica.",
            justificativa:
              "O Direito Penal possui caráter subsidiário e fragmentário, intervindo apenas diante de graves lesões a bens essenciais.",
          },
          {
            id: 15,
            pergunta:
              "O Crime Impossível (ou tentativa inidônea) ocorre quando:",
            opcoes: [
              "Por ineficácia absoluta do meio ou por absoluta impropriedade do objeto, é impossível o crime se consumar",
              "O criminoso foge de helicóptero da prisão de segurança máxima",
              "O agente utiliza uma arma de fogo de alto calibre carregada",
              "A vítima descobre o plano e perdoa o autor antes da execução",
            ],
            respostaCorreta: 0,
            dica: "Uso de meio totalmente incapaz de produzir o resultado (ex.: atirar com arma de brinquedo de plástico sem projétil).",
            justificativa:
              "Se o meio for absolutamente ineficaz ou o objeto absolutamente impróprio, não há perigo real ao bem jurídico, sendo o fato impunível.",
          },
        ],
      },
      {
        id: "direito-penal-2",
        nome: "Direito Penal 2",
        questoes: [
          {
            id: 1,
            pergunta:
              "O crime de Homicídio Qualificado distingue-se do Homicídio Simples por:",
            opcoes: [
              "Ser praticado exclusivamente por militares",
              "Não permitir a atuação do advogado de defesa",
              "Apresentar circunstâncias agravantes específicas no meio, modo, motivo ou finalidade que aumentam a pena",
              "Envolver obrigatoriamente bens da administração pública",
            ],
            respostaCorreta: 2,
            dica: "Fique atento aos motivos fúteis, meios cruéis ou recurso que dificulte a defesa.",
            justificativa:
              "A qualificação do homicídio resulta de circunstâncias especiais que elevam a gravidade da conduta e os limites da pena.",
          },
          {
            id: 2,
            pergunta:
              "No crime de Furto (subtração de coisa alheia móvel), o elemento caracterizador é:",
            opcoes: [
              "O emprego de violência ou grave ameaça contra a pessoa",
              "A entrega voluntária do bem pelo proprietário iludido por fraude",
              "A assinatura de um documento falso perante o cartório",
              "A ausência de violência ou grave ameaça à pessoa durante a subtração",
            ],
            respostaCorreta: 3,
            dica: "Subtrair sem uso de força física ou ameaça direta contra a vítima.",
            justificativa:
              "O furto distingue-se do roubo exatamente pela ausência de violência física ou grave ameaça à pessoa.",
          },
          {
            id: 3,
            pergunta:
              "O delito de Roubo diferencia-se do Furto essencialmente por:",
            opcoes: [
              "Envolver violência, grave ameaça ou redução da capacidade de resistência da pessoa",
              "Ocorrer apenas no período noturno",
              "Ser praticado contra órgãos governamentais",
              "Envolver apenas bens imóveis como casas e terrenos",
            ],
            respostaCorreta: 0,
            dica: "Presença de grave ameaça ou violência contra o indivíduo.",
            justificativa:
              "O uso de violência ou grave ameaça para subtrair a coisa transfigura a conduta de furto para roubo.",
          },
          {
            id: 4,
            pergunta: "O crime de Estelionato é caracterizado por:",
            opcoes: [
              "Agressão física direta para tomada de carteira",
              "Obtenção de vantagem ilícita induzindo ou mantendo alguém em erro mediante fraude/artifício",
              "Invasão de domicílio sem arrombamento de portas",
              "Falta de pagamento de impostos municipais",
            ],
            respostaCorreta: 1,
            dica: "Uso do engano e da fraude para fazer a vítima entregar o bem.",
            justificativa:
              "O estelionato exige o emprego de meio fraudulento para induzir a vítima em erro e obter vantagem indevida.",
          },
          {
            id: 5,
            pergunta:
              "No crime de Peculato, o sujeito ativo deve ser obrigatoriamente:",
            opcoes: [
              "Um comerciante cadastrado",
              "Um turista estrangeiro",
              "Um funcionário público (ou equiparado) que se apropria de dinheiro/bens em razão do cargo",
              "Qualquer cidadão maior de 18 anos",
            ],
            respostaCorreta: 2,
            dica: "Trata-se de um crime próprio funcional contra a Administração Pública.",
            justificativa:
              "Peculato é delito próprio cometido por funcionário público que se aproveita da facilidade do cargo para apropriar-se de bens.",
          },
          {
            id: 6,
            pergunta: "O crime de Corrupção Passiva consiste em:",
            opcoes: [
              "Oferecer dinheiro a um policial para evitar uma multa",
              "Invadir um prédio público portando armas",
              "Sonegar impostos de renda de empresa privada",
              "Solicitar, receber ou aceitar promessa de vantagem indevida em razão da função pública",
            ],
            respostaCorreta: 3,
            dica: "Atitude do agente público que pede ou aceita a 'propina'.",
            justificativa:
              "Corrupção passiva é a conduta do funcionário público de solicitar ou receber vantagem indevida para si ou para outrem.",
          },
          {
            id: 7,
            pergunta:
              "Diferente da Corrupção Passiva, a Corrupção Ativa é praticada por:",
            opcoes: [
              "Apenas pelo Presidente da República",
              "Qualquer pessoa que oferece ou promete vantagem indevida a funcionário público",
              "Juízes durante proferimento de sentença",
              "Funcionários do setor de logística da empresa privada",
            ],
            respostaCorreta: 1,
            dica: "Conduta do particular que tenta 'comprar' ou peitar o funcionário público.",
            justificativa:
              "Corrupção ativa é cometida pelo particular que oferece/promete a vantagem indevida ao agente público.",
          },
          {
            id: 8,
            pergunta: "O crime de Calúnia consiste em:",
            opcoes: [
              "Imputar falsamente a alguém a prática de um fato definido como crime",
              "Ofender a dignidade ou o decoro de alguém sem imputar fato específico",
              "Divulgar segredos industriais de uma empresa concorrente",
              "Criticar publicamente a gestão de um governo municipal",
            ],
            respostaCorreta: 0,
            dica: "Acusar falsamente alguém de ter cometido um CRIME específico.",
            justificativa:
              "Caluniar é atribuir falsamente a outrem a autoria de uma infração penal determinada.",
          },
          {
            id: 9,
            pergunta:
              "A Difamação distingue-se da Injúria porque na Difamação:",
            opcoes: [
              "Ataca-se a autoestimativa e honra subjetiva diretamente na presença do ofendido sem fato preciso",
              "Exige-se sempre agressão física prévia",
              "Imputa-se fato ostensivamente deshonroso à reputação da vítima perante terceiros",
              "O fato imputado deve ser obrigatoriamente um crime previsto no código penal",
            ],
            respostaCorreta: 2,
            dica: "A difamação atinge a reputação perante a sociedade (honra objetiva).",
            justificativa:
              "Difamação é imputar fato determinado ofensivo à reputação perante terceiros; injúria atinge o decoro interior (honra subjetiva).",
          },
          {
            id: 10,
            pergunta: "O crime de Extorsão difere do Roubo porque na Extorsão:",
            opcoes: [
              "Não há utilização de ameaça de espécie alguma",
              "O bem é tomado sem que a vítima perceba a ação",
              "A pena aplicada é exclusivamente pecuniária",
              "A vítima é compelida a fazer, tolerar que se faça ou deixar de fazer algo, exigindo-se sua colaboração indispensável",
            ],
            respostaCorreta: 3,
            dica: "Depende de um ato ou comportamento da própria vítima (ex.: digitar a senha do banco).",
            justificativa:
              "Na extorsão, o agente força a vítima a realizar determinado comportamento para obter a vantagem, sendo a conduta do sujeito passivo indispensável.",
          },
          {
            id: 11,
            pergunta: "O crime de Apropriação Indébita ocorre quando o agente:",
            opcoes: [
              "Apropria-se de coisa alheia móvel de que tem a posse ou detenção legítima prévia",
              "Toma à força a carteira da vítima no transporte coletivo",
              "Entra numa loja e esconde mercadorias sob a casaca",
              "Falsifica cheque bancário para descontar no caixa",
            ],
            respostaCorreta: 0,
            dica: "O bem já estava licitamente em suas mãos antes de decidir guardá-lo para si.",
            justificativa:
              "A apropriação indébita pressupõe posse ou detenção prévia e desprovida de fraude do bem alheio, invertendo-se depois o ânimo de dono.",
          },
          {
            id: 12,
            pergunta:
              "O crime de Prevaricação é caracterizado quando o funcionário público:",
            opcoes: [
              "Exige imposto indevido mediante coação física",
              "Retarda ou deixa de praticar ato de ofício para satisfazer interesse ou sentimento pessoal",
              "Apropria-se de bens do Estado para vender no mercado negro",
              "Divulga informações sigilosas de investigações penais",
            ],
            respostaCorreta: 1,
            dica: "Motivação baseada em 'interesse ou sentimento pessoal' (amizade, rancor, preguiça).",
            justificativa:
              "Prevaricar é descumprir o dever funcional movido por interesse interpessoal ou afetivo do próprio agente.",
          },
          {
            id: 13,
            pergunta: "A Receptação é classificada como o ato de:",
            opcoes: [
              "Fabricar dinheiro falso em gráfica clandestina",
              "Fugir de abordagem policial em via pública",
              "Adquirir, receber, transportar ou ocultar coisa que sabe ser produto de crime",
              "Cometer furto em residência abandonada",
            ],
            respostaCorreta: 2,
            dica: "Comprar ou esconder materiais oriundos de roubos/furtos anteriores.",
            justificativa:
              "Receptação consiste em tirar proveito ou ocultar objetos originados de atividade criminosa prévia de terceiros.",
          },
          {
            id: 14,
            pergunta:
              "O delito de Concussão consiste na conduta do funcionário público que:",
            opcoes: [
              "Solicita educadamente uma doação voluntária para a polícia",
              "Apropriar-se de saldo bancário de empresa falida",
              "Ameaça de morte um colega de repartição por questões pessoais",
              "Exige, para si ou para outrem, direta ou indiretamente, vantagem indevida em razão do cargo",
            ],
            respostaCorreta: 3,
            dica: "Repare na palavra-chave do verbo: EXIGIR (diferente da corrupção passiva, que é solicitar/receber).",
            justificativa:
              "A concussão caracteriza-se pela ordenação ou imposição (exigência) da vantagem indevida valendo-se da autoridade do cargo.",
          },
          {
            id: 15,
            pergunta: "O crime de Falsa Identidade ocorre quando alguém:",
            opcoes: [
              "Esquece a cédula de identidade original em sua residência",
              "Atribui-se ou atribui a terceiro falsa identidade para obter vantagem ou causar dano a outrem",
              "Perde seus documentos pessoais em via pública",
              "Altera a assinatura no documento por mudança de estado civil",
            ],
            respostaCorreta: 1,
            dica: "Mentir sobre o próprio nome ou qualificação para tirar proveito ou enganar.",
            justificativa:
              "Falsa identidade pune a conduta de se fazer passar por outra pessoa (ou inventar dados falsos de si) para obter vantagem ilícita.",
          },
        ],
      },
      {
        id: "drogas-e-questoes-criminais",
        nome: "Drogas e Questões Criminais",
        questoes: [
          {
            id: 1,
            pergunta:
              "O que estabelece a distinção legal entre 'Tráfico de Drogas' e 'Consumo Pessoal' na legislação criminal moderna?",
            opcoes: [
              "A hora do dia em que a apreensão foi efetuada",
              "O tipo de vestuário que o suspeito trajava no momento",
              "A quantidade apreendida, circunstâncias da apreensão, local e antecedentes do indivíduo",
              "A profissão declarada pelo portador da substância",
            ],
            respostaCorreta: 2,
            dica: "Combinação de elementos objetivos (quantidade, balanças) e subjetivos.",
            justificativa:
              "A diferenciação avalia a quantidade da substância, a presença de apetrechos de embalagem, o local e a conduta do agente.",
          },
          {
            id: 2,
            pergunta:
              "O conceito de 'Redução de Danos' em políticas públicas sobre drogas foca em:",
            opcoes: [
              "Erradicar obrigatoriamente todos os usuários através de internação forçada",
              "Aumentar as penas de prisão para consumidores esporádicos",
              "Proibir o acesso a tratamentos médicos nas prisões",
              "Minimizar as consequências adversas à saúde e sociais do uso de drogas sem necessariamente exigir a abstinência imediata",
            ],
            respostaCorreta: 3,
            dica: "Pragmatismo em saúde pública focado em diminuir riscos de infecções e overdose.",
            justificativa:
              "A Redução de Danos visa diminuir prejuízos biológicos e sociais associados ao consumo, respeitando a autonomia do indivíduo.",
          },
          {
            id: 3,
            pergunta:
              "A Convenção Única sobre Entorpecentes das Nações Unidas (1961) teve como impacto global:",
            opcoes: [
              "A consolidação do modelo proibicionista internacional e a classificação rigorosa de substâncias sob controlo",
              "A legalização irrestrita da cannabis para consumo recreativo",
              "A abolição de todas as polícias de combate às drogas no mundo",
              "A obrigatoriedade de prescrição de heroína para todos os pacientes",
            ],
            respostaCorreta: 0,
            dica: "Marco histórico do regime proibicionista mundial.",
            justificativa:
              "A Convenção de 1961 padronizou medidas repressivas e o controlo internacional da produção e comércio de estupefacientes.",
          },
          {
            id: 4,
            pergunta:
              "O fenómeno da 'Mercantilização do Tráfico' e expansão de Facções Criminosas está diretamente ligado a:",
            opcoes: [
              "Incentivos fiscais oferecidos pelo Ministério da Economia",
              "Altas margens de lucro geradas pela proibição e monopolização do mercado ilegal",
              "Aumento da venda de livros didáticos nas periferias",
              "Redução do valor das mercadorias legais no comércio formal",
            ],
            respostaCorreta: 1,
            dica: "A proibição cria mercados paralelos extremamente lucrativos.",
            justificativa:
              "A proibição eleva artificialmente os preços das drogas, financiando o poderio econômico e bélico das organizações criminosas.",
          },
          {
            id: 5,
            pergunta:
              "O que caracteriza as chamadas 'NPS' (Novas Substâncias Psicoativas)?",
            opcoes: [
              "Bebidas alcoólicas produzidas segundo métodos tradicionais do século XIX",
              "Remédios fitoterápicos autorizados para consumo infantil sem restrições",
              "Drogas sintéticas projetadas para mimetizar substâncias ilícitas e burlar as listas de proibição legal temporariamente",
              "Produtos de tabaco sem nicotina nem aditivos",
            ],
            respostaCorreta: 2,
            dica: "Moléculas alteradas em laboratório para contornar a legislação vigente.",
            justificativa:
              "NPS são moléculas modificadas em laboratório que imitam drogas conhecidas antes de serem incluídas nas listas oficiais de proibição.",
          },
          {
            id: 6,
            pergunta:
              "Qual o objetivo da 'Descriminalização' do consumo de drogas?",
            opcoes: [
              "Tornar a venda de drogas permitida em supermercados",
              "Fechar todos os centros de reabilitação e saúde pública",
              "Conceder anistia fiscal aos grandes traficantes internacionais",
              "Remover as sanções penais/criminais para a posse de pequenas quantidades destinadas ao uso pessoal",
            ],
            respostaCorreta: 3,
            dica: "Retira a sanção penal do usuário, podendo manter sanções administrativas.",
            justificativa:
              "A descriminalização afasta o estigma e o registro criminal do usuário, tratando a questão sob a ótica da saúde pública.",
          },
          {
            id: 7,
            pergunta:
              "A relação entre o consumo de drogas e a criminalidade violenta é explicada criminologicamente por três modelos. O modelo 'Sistêmico' refere-se a:",
            opcoes: [
              "Violência inerente ao funcionamento do próprio mercado ilegal de drogas (disputas de território, cobranças)",
              "Crimes cometidos sob efeito psicótico direto da substância",
              "Furtos praticados para conseguir dinheiro para comprar a dose",
              "Crimes ambientais cometidos nas florestas tropicais",
            ],
            respostaCorreta: 0,
            dica: "Violência entre quadrilhas e disputa por 'bocas de fumo'.",
            justificativa:
              "O modelo sistêmico de Goldstein explica a violência gerada pelas disputas de poder e de territórios de venda no mercado informal.",
          },
          {
            id: 8,
            pergunta:
              "O modelo de explicação 'Econômico-Compulsivo' da relação crime-drogas ocorre quando:",
            opcoes: [
              "O traficante investe o dinheiro do crime em ações na bolsa de valores",
              "O indivíduo comete crimes patrimoniais (furtos, roubos) para financiar o custo da sua dependência química",
              "O Estado arrecada impostos sobre a venda legal de bebidas alcoólicas",
              "A farmácia vende remédios acima do preço estipulado pelo governo",
            ],
            respostaCorreta: 1,
            dica: "Cometer delitos patrimoniais impulsionado pela necessidade de obter a droga.",
            justificativa:
              "No modelo econômico-compulsivo, o usuário comete infrações lucrativas para sustentar o hábito e evitar a síndrome de abstinência.",
          },
          {
            id: 9,
            pergunta:
              "O termo 'Legalização' do mercado de drogas difere de descriminalização porque:",
            opcoes: [
              "A legalização proíbe ainda mais rigorosamente o consumo individual",
              "A legalização aplica-se exclusivamente às prisões de segurança máxima",
              "A legalização regulamenta toda a cadeia produtiva, distribuição e venda comercial sob normas do Estado",
              "Não há diferença entre os dois conceitos no direito internacional",
            ],
            respostaCorreta: 2,
            dica: "Cria um mercado legal com regras, impostos e controlo de qualidade.",
            justificativa:
              "A legalização cria um arcabouço normativo para a produção, tributação e venda comercial da substância pelo Estado.",
          },
          {
            id: 10,
            pergunta:
              "O crime de 'Associação para o Tráfico' exige para sua configuração:",
            opcoes: [
              "A reunião esporádica e casual de duas pessoas em uma festa",
              "A apreensão obrigatória de mais de 100 quilos de cocaína pura",
              "Que os envolvidos sejam proprietários de empresas registradas",
              "O vínculo estável e permanente entre duas ou mais pessoas focado na prática do tráfico",
            ],
            respostaCorreta: 3,
            dica: "Exige o elemento temporal de estabilidade e durabilidade do grupo.",
            justificativa:
              "A associação para o tráfico pressupõe animus associativo estável e duradouro voltado à comercialização de entorpecentes.",
          },
          {
            id: 11,
            pergunta:
              "A 'Teoria da Porta de Entrada' (Gateway Hypothesis) sustentava historicamente que:",
            opcoes: [
              "O uso de drogas leves levava inevitavelmente ao consumo progressivo de drogas mais pesadas",
              "As portas das prisões deveriam ficar abertas durante todo o dia",
              "O tráfico de drogas inicia-se sempre nos portos marítimos",
              "O álcool não tem efeito sobre o comportamento humano",
            ],
            respostaCorreta: 0,
            dica: "Ideia de que o uso de cannabis conduziria rigorosamente ao uso de heroína.",
            justificativa:
              "A teoria da porta de entrada afirmava que a experimentação de certas substâncias funcionava como degrau para o vício em drogas mais pesadas.",
          },
          {
            id: 12,
            pergunta:
              "Qual é a principal função dos testes toxicológicos em investigações criminais de trânsito?",
            opcoes: [
              "Avaliar a cor da viatura policial utilizada na abordagem",
              "Detectar a presença e concentração de álcool ou psicoativos no organismo do condutor",
              "Medir a velocidade do veículo no momento do impacto",
              "Identificar se a carteira de habilitação do motorista é autêntica",
            ],
            respostaCorreta: 1,
            dica: "Mede a capacidade psicomotora alterada por substâncias.",
            justificativa:
              "Análises toxicológicas comprovam a alteração da capacidade psicomotora causada por álcool ou drogas ao volante.",
          },
          {
            id: 13,
            pergunta:
              "O impacto da 'Guerra às Drogas' nas populações carcerárias de países em desenvolvimento gerou:",
            opcoes: [
              "Esvaziamento completo dos estabelecimentos penitenciários",
              "Eliminação definitiva do consumo de entorpecentes em sociedade",
              "Superlotação prisional maciça por crimes não violentos ligados ao pequeno comércio ilícito",
              "Redução imediata nos custos de manutenção das prisões",
            ],
            respostaCorreta: 2,
            dica: "Encarceramento em massa de pequenos transportadores e usuários.",
            justificativa:
              "A política proibicionista punitiva provocou o encarceramento em massa de pequenos varejistas, inflamando o sistema prisional.",
          },
          {
            id: 14,
            pergunta:
              "O conceito de 'Droga Psicoativa' inclui qualquer substância que:",
            opcoes: [
              "Apenas causa queimaduras químicas na pele exterior",
              "Serve exclusivamente para limpar motores de veículos",
              "Seja comercializada em supermercados sem necessidade de embalagem",
              "Ao ser ingerida, altera o funcionamento do Sistema Nervoso Central, modificando percepção, humor ou cognição",
            ],
            respostaCorreta: 3,
            dica: "Atua diretamente nas funções do cérebro e na mente.",
            justificativa:
              "Substâncias psicoativas atuam no cérebro alterando estados mentais, percepções, emoções e o comportamento do indivíduo.",
          },
          {
            id: 15,
            pergunta:
              "O 'Lavado de Ativos' oriundo do tráfico de drogas compreende a etapa de 'Ocultação' (Layering), que consiste em:",
            opcoes: [
              "Movimentar os fundos em uma teia complexa de transações financeiras para distanciar o dinheiro de sua origem criminosa",
              "Depositar o dinheiro vivo diretamente na conta poupança do próprio autor",
              "Comprar mantimentos básicos em feiras locais com moedas pequenas",
              "Queimar todas as notas bancárias recebidas com a venda",
            ],
            respostaCorreta: 0,
            dica: "Estratégia para dificultar o rastreamento do dinheiro ilícito por meio de transações e contas off-shore.",
            justificativa:
              "A camada/ocultação busca quebrar a cadeia de evidências, disfarçando a origem ilícita dos lucros do tráfico.",
          },
        ],
      },
      {
        id: "sociologia-geral-2",
        nome: "Sociologia Geral 2",
        questoes: [
          {
            id: 1,
            pergunta:
              "Segundo Max Weber, a 'Ação Social' é definida como qualquer conduta humana cujo sentido intencionado pelo agente se orienta em relação ao comportamento de:",
            opcoes: [
              "Forças da natureza como tempestades ou terremotos",
              "Outros indivíduos ou grupos de indivíduos",
              "Sistemas mecânicos ou algoritmos de computador",
              "Plantas e espécies de animais selvagens",
            ],
            respostaCorreta: 1,
            dica: "Tem que haver orientação com significado voltado para o outro.",
            justificativa:
              "Para Weber, a ação social ganha sentido ao levar em consideração e orientar-se pelas reações de outros sujeitos.",
          },
          {
            id: 2,
            pergunta:
              "No pensamento de Émile Durkheim, o estado de 'Anomia Social' caracteriza-se por:",
            opcoes: [
              "Controlo rígido e autoritário do Estado sobre a imprensa",
              "Prosperidade econômica ilimitada e igualitária para todos",
              "Ausência ou enfraquecimento das regras e normas sociais que regulam os desejos e condutas humanas",
              "Abolição completa do dinheiro no comércio local",
            ],
            respostaCorreta: 2,
            dica: "Falta de regras sociais para nortear as expectativas coletivas.",
            justificativa:
              "A anomia ocorre quando transformações sociais rápidas desregulamentam as normas morais que garantiam a coesão social.",
          },
          {
            id: 3,
            pergunta:
              "O conceito de 'Habitus' desenvolvido pelo sociólogo Pierre Bourdieu refere-se a:",
            opcoes: [
              "Hábitos de higiene pessoal aprendidos na infância",
              "A rotina de exercícios físicos praticada nas academias",
              "Um tipo de contrato de trabalho temporário",
              "Sistemas de disposições duráveis e estruturadas incorporadas pelos indivíduos ao longo da sua socialização",
            ],
            respostaCorreta: 3,
            dica: "A estrutura social interiorizada no corpo e na mente do indivíduo.",
            justificativa:
              "O habitus representa estruturas sociais internalizadas que orientam percepções, gostos e ações dos atores sociais.",
          },
          {
            id: 4,
            pergunta:
              "Segundo Karl Marx, a luta de classes na sociedade capitalista dá-se fundamentalmente entre:",
            opcoes: [
              "A Burguesia (proprietários dos meios de produção) e o Proletariado (trabalhadores assalariados)",
              "Monarcas e camponeses feudais",
              "Políticos e cientistas acadêmicos",
              "Comerciantes rurais e sacerdotes religiosos",
            ],
            respostaCorreta: 0,
            dica: "Donos do capital vs. aqueles que vendem sua força de trabalho.",
            justificativa:
              "O conflito de classes no capitalismo fundamenta-se no antagonismo econômico entre a burguesia e o proletariado.",
          },
          {
            id: 5,
            pergunta: "O conceito de 'Mais-Valia' em Marx representa:",
            opcoes: [
              "O valor extra pago pelo consumidor por produtos de luxo",
              "A diferença entre o valor produzido pelo trabalho do operário e o valor efetivamente pago a ele sob a forma de salário",
              "O imposto cobrado pelo governo sobre exportações",
              "O lucro obtido por doações de caridade",
            ],
            respostaCorreta: 1,
            dica: "Trabalho não pago que gera o lucro do capitalista.",
            justificativa:
              "A mais-valia é a parcela de trabalho não paga ao operário apropriada pelo proprietário dos meios de produção.",
          },
          {
            id: 6,
            pergunta:
              "A Teoria da Estruturação de Anthony Giddens procura superar o dualismo entre:",
            opcoes: [
              "Biologia e Química",
              "Direito Público e Direito Privado",
              "Agência (Ação Humana) e Estrutura Social",
              "Religião e Magia",
            ],
            respostaCorreta: 2,
            dica: "Como os atores atuam e como as regras sociais moldam a ação reciprocamente.",
            justificativa:
              "Giddens propõe que estrutura e ação (agência) dependem uma da outra reciprocamente através das práticas sociais.",
          },
          {
            id: 7,
            pergunta:
              "O tipo de dominação racional-legal na tipologia de Max Weber fundamenta-se em:",
            opcoes: [
              "Crença na santidade das tradições do passado (ex.: Monarquia)",
              "Carisma e dons extraordinários do líder (ex.: Profeta)",
              "Uso de força bruta sem qualquer norma legal",
              "Crença na legalidade dos ordenamentos estatuídos e no direito dos detentores do poder de dar ordens sob tais normas",
            ],
            respostaCorreta: 3,
            dica: "Base do Estado moderno e da burocracia civil.",
            justificativa:
              "A dominação racional-legal assenta na autoridade da lei, do regulamento e dos cargos burocráticos impessoais.",
          },
          {
            id: 8,
            pergunta:
              "O conceito de 'Alienação' no trabalho em Karl Marx refere-se a:",
            opcoes: [
              "Perda do controlo e do pertencimento do trabalhador sobre o processo produtivo e sobre o produto do seu trabalho",
              "Desconhecimento da língua oficial do país",
              "Falta de capacitação técnica do jovem aprendiz",
              "Recusa do trabalhador em fazer horas extras na fábrica",
            ],
            respostaCorreta: 0,
            dica: "O trabalhador torna-se estranho ao próprio bem que produziu.",
            justificativa:
              "O trabalhador alienado perde a autonomia sobre seu trabalho, tornando-se uma mera engrenagem do processo fabril.",
          },
          {
            id: 9,
            pergunta:
              "Em Durkheim, a 'Solidariedade Orgânica' é típica das sociedades:",
            opcoes: [
              "Pré-modernas com pouca ou nenhuma divisão do trabalho",
              "Complexas e industrializadas com acentuada divisão social do trabalho e interdependência de funções",
              "Nômades baseadas exclusivamente na caça",
              "Feudais organizadas em estamentos rígidos",
            ],
            respostaCorreta: 1,
            dica: "Como os órgãos de um corpo: cada um faz uma função, mas dependem uns dos outros.",
            justificativa:
              "A solidariedade orgânica surge com a divisão do trabalho social, onde a coesão vem da especialização e interdependência.",
          },
          {
            id: 10,
            pergunta:
              "O conceito de 'Capital Cultural' na teoria de Pierre Bourdieu inclui:",
            opcoes: [
              "Contas bancárias e títulos de investimento financeiro",
              "Imóveis e frotas de automóveis esportivos",
              "Conhecimentos, credenciais acadêmicas, diplomas, postura e domínio da linguagem formal",
              "Número de seguidores em redes sociais virtuais",
            ],
            respostaCorreta: 2,
            dica: "Recursos baseados em educação, cultura erudita e títulos de estudo.",
            justificativa:
              "Capital cultural refere-se a saberes, habilidades, bens culturais e diplomas acumulados pelo indivíduo.",
          },
          {
            id: 11,
            pergunta:
              "Para Michel Foucault, a mudança do modelo punitivo do suplício para a prisão marcou a passagem do 'Poder Soberano' para o:",
            opcoes: [
              "Anarquismo institucional pleno",
              "Poder Divino absoluto sustentado pela Igreja",
              "Comunismo utópico igualitário",
              "Poder Disciplinar e Biopolítica focados no controlo e docilização dos corpos",
            ],
            respostaCorreta: 3,
            dica: "Sociedade de vigilância, horário, rotina e adestramento das mentes e corpos.",
            justificativa:
              "Foucault argumenta que a sanção moderna foca no adestramento e vigilância contínua do corpo e da mente (Panopticon).",
          },
          {
            id: 12,
            pergunta:
              "O conceito de 'Modernidade Líquida' do sociólogo Zygmunt Bauman caracteriza-se por:",
            opcoes: [
              "Relações sociais fluidas, inconstantes, voláteis e marcadas pelo individualismo e incerteza",
              "Construção de edifícios públicos à prova de água e inundações",
              "Solidez das instituições familiares e trabalhistas mantidas por séculos",
              "Estatização de todas as empresas petrolíferas mundiais",
            ],
            respostaCorreta: 0,
            dica: "Tudo muda rapidamente; os laços não duram muito tempo.",
            justificativa:
              "A modernidade líquida é marcada pela fragilidade dos laços humanos e pela rápida obsolescência de valores e relacionamentos.",
          },
          {
            id: 13,
            pergunta:
              "A 'Socialização Primária' compreende o processo no qual o indivíduo:",
            opcoes: [
              "Aprende o conhecimento técnico em um curso de pós-graduação universitária",
              "Internaliza as normas, valores e linguagem fundamentais na infância através da família",
              "Inicia o seu primeiro emprego com carteira assinada",
              "Aprende a votar em campanhas eleitorais adultas",
            ],
            respostaCorreta: 1,
            dica: "Acontece nos primeiros anos de vida no seio familiar.",
            justificativa:
              "A socialização primária constrói o mundo base da criança no seio familiar, formando sua identidade inicial.",
          },
          {
            id: 14,
            pergunta:
              "O conceito de 'Fato Social' em Émile Durkheim possui três características essenciais:",
            opcoes: [
              "Privado, Opcional e Passageiro",
              "Biológico, Genético e Hereditário",
              "Geral, Exterior e Coercitivo",
              "Político, Econômico e Religioso",
            ],
            respostaCorreta: 2,
            dica: "Existe fora de nós, atinge a todos e nos força a agir de certo modo.",
            justificativa:
              "Os fatos sociais são exteriores aos indivíduos, exercem coerção sobre suas condutas e são genéricos na sociedade.",
          },
          {
            id: 15,
            pergunta: "O termo 'Estratificação Social' refere-se a:",
            opcoes: [
              "Estudo das camadas rochosas do solo terrestre",
              "Aumento da taxa de natalidade nas áreas urbanas",
              "Processo de fusão entre duas empresas multinacionais",
              "Divisão da sociedade em camadas ou hierarquias com base no acesso desigual a recursos e poder",
            ],
            respostaCorreta: 3,
            dica: "Hierarquia e divisão social em níveis (classes, castas, estamentos).",
            justificativa:
              "Estratificação social designa a estruturação da sociedade em estratos hierárquicos com diferentes níveis de privilégios.",
          },
        ],
      },

      {
        id: "estatistica-aplicada-1",
        nome: "Estatística Aplicada 1",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Medida de Tendência Central calculada através da soma de todos os valores dividida pelo número total de observações é a:",
            opcoes: ["Média Aritmética", "Mediana", "Moda", "Variância"],
            respostaCorreta: 0,
            dica: "A métrica mais comum para obter o valor central de um conjunto numérico.",
            justificativa:
              "A média aritmética é obtida somando todos os valores da distribuição e dividindo pelo número de observações ($N$ ou $n$).",
          },
          {
            id: 2,
            pergunta:
              "Em um conjunto de dados sobre registros de ocorrências policiais, a 'Moda' é definida como:",
            opcoes: [
              "O valor exatamente intermediário que divide a amostra ao meio",
              "A diferença entre o maior e o menor valor observado",
              "O valor que ocorre com maior frequência no conjunto de dados",
              "A porcentagem de crimes resolvidos no ano",
            ],
            respostaCorreta: 2,
            dica: "O valor que mais se repete.",
            justificativa:
              "A moda representa o valor ou categoria de maior frequência observada na amostra.",
          },
          {
            id: 3,
            pergunta:
              "Para encontrar a 'Mediana' de um conjunto de dados quantitativos, é indispensável antes:",
            opcoes: [
              "Multiplicar todos os valores por cem",
              "Ordenar os dados em sequência crescente ou decrescente (Rol)",
              "Calcular a raiz quadrada da soma dos elementos",
              "Eliminar todos os números ímpares da amostra",
            ],
            respostaCorreta: 1,
            dica: "Organizar a lista em ordem do menor para o maior.",
            justificativa:
              "A mediana é o elemento central do conjunto, exigindo a organização prévia dos dados em Rol.",
          },
          {
            id: 4,
            pergunta:
              "Qual das seguintes variáveis é classificada como 'Qualitativa Nominal'?",
            opcoes: [
              "Número de furtos por bairro (0, 1, 2, 3...)",
              "Grau de instrução (Fundamental, Médio, Superior)",
              "Salário do profissional em kwanzas",
              "Tipo de delito praticado (Roubo, Homicídio, Estelionato)",
            ],
            respostaCorreta: 3,
            dica: "Categorias sem ordem numérica ou hierarquia intrínseca.",
            justificativa:
              "Variáveis qualitativas nominais classificam os elementos em categorias sem ordenação natural (como tipos de crimes).",
          },
          {
            id: 5,
            pergunta:
              "Qual das seguintes variáveis é classificada como 'Quantitativa Discreta'?",
            opcoes: [
              "Número de detenções efetuadas em uma operação policial (ex.: 4 detenções)",
              "Peso das apreensões de drogas em quilogramas (ex.: 2,45 kg)",
              "Nível de escolaridade dos detentos",
              "Altura dos recrutas em metros (ex.: 1,78 m)",
            ],
            respostaCorreta: 0,
            dica: "Variável contável por números inteiros (não admite valores decimais).",
            justificativa:
              "Quantitativas discretas assumem valores contáveis inteiros provenientes de contagens diretas.",
          },
          {
            id: 6,
            pergunta:
              "A 'Amplitude Total' de um conjunto de dados numéricos é calculada por:",
            opcoes: [
              "Soma da média com o desvio-padrão",
              "Divisão da mediana pelo total de observações",
              "Diferença entre o valor máximo e o valor mínimo do conjunto",
              "Multiplicação da moda por dois",
            ],
            respostaCorreta: 2,
            dica: "Valor Máximo - Valor Mínimo.",
            justificativa:
              "A amplitude total é a medida de dispersão mais simples, obtida subtraindo o menor do maior valor da série.",
          },
          {
            id: 7,
            pergunta:
              "O que representa o 'Desvio-Padrão' em uma análise estatística criminal?",
            opcoes: [
              "A soma exata de todos os crimes reportados",
              "A medida do grau de dispersão dos dados em relação à média aritmética",
              "A porcentagem de suspeitos absolvidos em julgamento",
              "O número de páginas do relatório policial final",
            ],
            respostaCorreta: 1,
            dica: "Indica o quão afastados/variados os dados estão em torno da média.",
            justificativa:
              "O desvio-padrão mede a variabilidade dos dados ao redor da média (quanto maior o valor, mais dispersos os dados).",
          },
          {
            id: 8,
            pergunta:
              "Se o desvio-padrão de um conjunto de dados é igual a 4, a sua 'Variância' será igual a:",
            opcoes: ["2", "8", "64", "16"],
            respostaCorreta: 3,
            dica: "A variância é o quadrado do desvio-padrão ($S^2$).",
            justificativa:
              "A variância é $4^2 = 16$, pois o desvio-padrão é a raiz quadrada da variância.",
          },
          {
            id: 9,
            pergunta: "O que define uma 'Amostra' na estatística?",
            opcoes: [
              "Um subconjunto representativo selecionado a partir de uma população estatística",
              "A totalidade absoluta de todos os elementos de um universo de estudo",
              "O gráfico de barras impresso ao final do livro",
              "A taxa de erro aceita pelo juiz da causa",
            ],
            respostaCorreta: 0,
            dica: "Uma fração do todo para estudar as características da população.",
            justificativa:
              "A amostra é a parte/fração coletada da população para inferir propriedades do todo.",
          },
          {
            id: 10,
            pergunta: "Na amostragem aleatória simples:",
            opcoes: [
              "O pesquisador escolhe manualmente apenas os seus amigos para participar",
              "Apenas os dados de indivíduos com mais de 50 anos são coletados",
              "Cada elemento da população tem exatamente a mesma probabilidade de ser selecionado",
              "A amostragem é feita sem qualquer tipo de lista de referência",
            ],
            respostaCorreta: 2,
            dica: "Sorteio probabilístico justo onde todos têm chances iguais.",
            justificativa:
              "Na amostragem aleatória simples, a escolha é estritamente probabilística, garantindo equidade de seleção.",
          },
          {
            id: 11,
            pergunta:
              "O 'Gráfico de Histograma' é especialmente adequado para representar:",
            opcoes: [
              "Apenas nomes de cidades sem números associados",
              "Variáveis quantitativas contínuas agrupadas em classes de frequência",
              "Fotografias tiradas no local do delito",
              "Organigramas de empresas privadas",
            ],
            respostaCorreta: 1,
            dica: "Gráficos de colunas contíguas para intervalos numéricos contínuos.",
            justificativa:
              "Histogramas representam distribuições de frequências de dados quantitativos contínuos estruturados em intervalos.",
          },
          {
            id: 12,
            pergunta:
              "O 'Intervalo Interquartil' (IQR) é calculada pela diferença entre:",
            opcoes: [
              "A Média e a Moda",
              "O maior valor e a mediana",
              "O Desvio-padrão e a Variância",
              "O Terceiro Quartil ($Q_3$) e o Primeiro Quartil ($Q_1$)",
            ],
            respostaCorreta: 3,
            dica: "$IQR = Q_3 - Q_1$. Medida de dispersão resistente a valores discrepantes.",
            justificativa:
              "O intervalo interquartil reflete a amplitude dos $50\\%$ centrais dos dados observados ($Q_3 - Q_1$).",
          },
          {
            id: 13,
            pergunta:
              "O que é uma 'Frequência Relativa' na construção de uma tabela estatística?",
            opcoes: [
              "A proporção ou percentagem da frequência absoluta em relação ao total de observações",
              "A contagem bruta simples do número de vezes que uma categoria ocorre",
              "A média da idade dos policiais envolvidos na pesquisa",
              "A diferença entre o primeiro e o último valor coletado",
            ],
            respostaCorreta: 0,
            dica: "Exprime o valor em percentagem/fração da amostra total.",
            justificativa:
              "A frequência relativa demonstra o peso percentual da ocorrência de um evento sobre o total geral ($f_r = f_a / N$).",
          },
          {
            id: 14,
            pergunta:
              "Um conjunto de dados numéricos que possui duas modas é classificado como:",
            opcoes: ["Unimodal", "Amodal", "Bimodal", "Multivariado contínuo"],
            respostaCorreta: 2,
            dica: "Possui 'dois' picos de maior frequência.",
            justificativa:
              "Distribuições que apresentam dois valores empatados com a maior frequência máxima são chamadas de bimodais.",
          },
          {
            id: 15,
            pergunta:
              "Valores extremamente discrepantes que se afastam drasticamente da maioria dos dados são denominados estatisticamente como:",
            opcoes: [
              "Parâmetros de controle",
              "Outliers (ou valores discrepantes/atípicos)",
              "Medianas absolutas",
              "Fatores de correção de amplitude",
            ],
            respostaCorreta: 1,
            dica: "Aquele dado fora da curva que distorce a média.",
            justificativa:
              "Outliers são observações atípicas que se distanciam severamente do padrão de concentração dos dados.",
          },
        ],
      },
      {
        id: "estatistica-aplicada-2",
        nome: "Estatística Aplicada 2",
        questoes: [
          {
            id: 1,
            pergunta:
              "Em testes de hipóteses estatísticas, o 'Erro do Tipo I' ocorre quando o pesquisador:",
            opcoes: [
              "Aceita a hipótese nula ($H_0$) quando ela é falsa",
              "Erra a soma dos números na calculadora manual",
              "Rejeita a hipótese nula ($H_0$) quando ela é, na verdade, verdadeira",
              "Utiliza uma amostra com mais de 10.000 pessoas",
            ],
            respostaCorreta: 2,
            dica: "Falso positivo: rejeitar o que era verdadeiro (nível $\\alpha$).",
            justificativa:
              "O Erro Tipo I ($\\alpha$) é cometido ao rejeitar indevidamente uma hipótese nula que corresponde à verdade.",
          },
          {
            id: 2,
            pergunta: "O 'Erro do Tipo II' em testes de hipótese consiste em:",
            opcoes: [
              "Não rejeitar (aceitar) a hipótese nula ($H_0$) quando ela é, na verdade, falsa",
              "Rejeitar a hipótese alternativa quando ela é verdadeira",
              "Inverter as colunas do gráfico de dispersão",
              "Publicar os dados sem autorização da polícia",
            ],
            respostaCorreta: 0,
            dica: "Falso negativo: deixar de rejeitar a hipótese nula que era falsa (nível $\\beta$).",
            justificativa:
              "O Erro Tipo II ($\\beta$) é a falha em rejeitar uma hipótese nula que é efetivamente falsa.",
          },
          {
            id: 3,
            pergunta:
              "O Coeficiente de Correlação de Pearson ($r$) varia em qual intervalo numérico?",
            opcoes: [
              "De $0$ a $+100$",
              "De $-\\infty$ a $+\\infty$",
              "Apenas números inteiros positivos",
              "De $-1$ a $+1$",
            ],
            respostaCorreta: 3,
            dica: "Indica a força e direção da associação linear entre duas variáveis contínuas.",
            justificativa:
              "O coeficiente $r$ oscila entre $-1$ (correlação negativa perfeita) e $+1$ (correlação positiva perfeita).",
          },
          {
            id: 4,
            pergunta:
              "Um Coeficiente de Correlação $r = -0.85$ entre taxa de desemprego e rendimento familiar indica:",
            opcoes: [
              "Que não existe qualquer associação entre as duas variáveis",
              "Uma relação linear forte e inversa (negativa) entre as variáveis",
              "Que o cálculo estatístico foi executado de forma incorreta",
              "Uma relação positiva perfeita onde ambas crescem juntas",
            ],
            respostaCorreta: 1,
            dica: "Valor próximo de $-1$ indica associação forte e no sentido oposto.",
            justificativa:
              "Valores de $r$ próximos de $-1$ sinalizam uma associação linear forte em direções opostas (quando uma sobe, a outra desce).",
          },
          {
            id: 5,
            pergunta:
              "Na Análise de Regressão Linear Simples ($Y = a + bX$), o parâmetro ' $b$ ' representa:",
            opcoes: [
              "O ponto exato onde a reta cruza o eixo horizontal do gráfico",
              "A média aritmética dos erros de amostragem",
              "O coeficiente angular (inclinação da reta), indicando a variação esperada em $Y$ para cada unidade aumentada em $X$",
              "A quantidade total de observações do estudo",
            ],
            respostaCorreta: 2,
            dica: "Mede a inclinação ou a taxa de variação da variável resposta.",
            justificativa:
              "O coeficiente angular $b$ mede quanto a variável dependente ($Y$) altera diante da mudança de uma unidade na variável independente ($X$). ",
          },
          {
            id: 6,
            pergunta: "O p-valor (p-value) em um teste estatístico representa:",
            opcoes: [
              "A probabilidade de obter um resultado tão ou mais extremo que o observado, assumindo que a hipótese nula é verdadeira",
              "A porcentagem de acertos da polícia nas investigações",
              "O preço total gasto com a aplicação dos questionários",
              "O número absoluto de erros encontrados na tabela de dados",
            ],
            respostaCorreta: 0,
            dica: "Se p-valor < $\\alpha$ (0,05), rejeitamos $H_0$.",
            justificativa:
              "O $p$-valor indica a probabilidade de observar os dados sob a suposição de $H_0$ ser verdadeira. Valores muito baixos levam à rejeição de $H_0$.",
          },
          {
            id: 7,
            pergunta:
              "O Teste Qui-Quadrado ( $\\chi^2$ ) de Independência é aplicado principalmente para avaliar:",
            opcoes: [
              "A média de altura dos detentos em centímetros",
              "A velocidade de resposta das viaturas policiais",
              "A evolução histórica dos salários ao longo dos anos",
              "A associação/dependência entre duas variáveis categóricas (qualitativas)",
            ],
            respostaCorreta: 3,
            dica: "Mede a associação entre variáveis em tabelas de contingência.",
            justificativa:
              "O Qui-Quadrado de independência testa se duas variáveis categóricas possuem relação de dependência estatisticamente significativa.",
          },
          {
            id: 8,
            pergunta:
              "Uma distribuição de probabilidade com curva em formato de sino, simétrica em torno da média, é conhecida como:",
            opcoes: [
              "Distribuição Binomial Discreta",
              "Distribuição Normal (ou Gaussiana)",
              "Distribuição de Poisson Poissoniana",
              "Distribuição Assimétrica Negativa",
            ],
            respostaCorreta: 1,
            dica: "Curva clássica de Gauss.",
            justificativa:
              "A Distribuição Normal apresenta simetria perfeita em formato de sino, onde Média, Mediana e Moda coincidem no centro.",
          },
          {
            id: 9,
            pergunta:
              "O Coeficiente de Determinação ($R^2$) na regressão mede:",
            opcoes: [
              "A média das idades dos criminosos na amostra",
              "A probabilidade de ocorrência do Erro Tipo II",
              "A proporção da variância da variável dependente ($Y$) explicada pelo modelo de regressão",
              "O número total de variáveis que foram excluídas da pesquisa",
            ],
            respostaCorreta: 2,
            dica: "Se $R^2 = 0{,}80$, $80\\%$ da variação de $Y$ é explicada por $X$.",
            justificativa:
              "O $R^2$ avalia a qualidade do ajustamento do modelo, variando de $0$ a $1$ (ou $0\\%$ a $100\\%$).",
          },
          {
            id: 10,
            pergunta:
              "Qual das seguintes hipóteses estatísticas afirma a AUSÊNCIA de efeito, diferença ou associação?",
            opcoes: [
              "Hipótese Nula ($H_0$)",
              "Hipótese Alternativa ($H_1$)",
              "Hipótese do Pesquisador",
              "Hipótese de Regressão Quadrática",
            ],
            respostaCorreta: 0,
            dica: "Afirma a igualdade ou que não há diferença real ($H_0$).",
            justificativa:
              "A Hipótese Nula ($H_0$) assume a igualdade ou a inexistência de efeito até que haja evidências em contrário.",
          },
          {
            id: 11,
            pergunta:
              "O Teste t de Student para duas amostras independentes é utilizado para comparar:",
            opcoes: [
              "A proporção de homens e mulheres em tabelas nominais de 4 entradas",
              "A variância de mais de 5 grupos simultaneamente",
              "O ranking de preferências nominais",
              "As médias de duas populações/grupos com variáveis quantitativas",
            ],
            respostaCorreta: 3,
            dica: "Compara as médias numéricas de dois grupos (ex.: Grupo Controlo vs. Grupo Tratamento).",
            justificativa:
              "O teste t de Student avalia se a diferença entre as médias de dois grupos independentes tem significância estatística.",
          },
          {
            id: 12,
            pergunta:
              "O teste ANOVA (Análise de Variância) é a ferramenta adequada quando se deseja:",
            opcoes: [
              "Calcular a moda de uma variável qualitativa nominal",
              "Comparar as médias de TRÊS ou mais grupos simultaneamente",
              "Construir um mapa de geoprocessamento criminal",
              "Inverter a ordem da amostragem aleatória simples",
            ],
            respostaCorreta: 1,
            dica: "Extensão do teste t para mais de dois grupos.",
            justificativa:
              "A ANOVA testa a igualdade de médias entre três ou mais populações, controlando a taxa de erro acumulada.",
          },
          {
            id: 13,
            pergunta: "A Distribuição de Poisson é ideal para modelar:",
            opcoes: [
              "A variação contínua da altura de indivíduos adultos",
              "A preferência partidária dos cidadãos em pesquisas pré-eleitorais",
              "O número de ocorrências de um evento raro em um intervalo fixo de tempo ou espaço (ex.: homicídios por dia)",
              "O custo total de manutenção de viaturas policiais em anos",
            ],
            respostaCorreta: 2,
            dica: "Eventos discretos que contam contagens em um intervalo determinado de tempo/espaço.",
            justificativa:
              "A distribuição de Poisson modela a frequência de ocorrência de eventos discretos em intervalos contínuos dados.",
          },
          {
            id: 14,
            pergunta: "O Teorema do Limite Central estabelece que:",
            opcoes: [
              "À medida que o tamanho da amostra ($n$) aumenta, a distribuição das médias amostrais aproxima-se de uma Distribuição Normal",
              "A média da amostra é sempre igual a zero independente dos dados",
              "Variáveis qualitativas tornam-se numéricas automaticamente após 100 observações",
              "O desvio-padrão diminui quando a variância aumenta",
            ],
            respostaCorreta: 0,
            dica: "A base teórica que autoriza a inferência estatística paramétrica com grandes amostras.",
            justificativa:
              "Pelo Teorema do Limite Central, para amostras grandes, a distribuição da média amostral converge para uma normal.",
          },
          {
            id: 15,
            pergunta:
              "Em Regressão Logística, a variável dependente ($Y$) é do tipo:",
            opcoes: [
              "Quantitativa contínua sem limites (ex.: Salário)",
              "Ordinar descendente sem categorias",
              "Matriz multivariada de textos abertos",
              "Binária/Dicotômica (ex.: 0 = Não reincidiu, 1 = Reincidiu)",
            ],
            respostaCorreta: 3,
            dica: "Modela probabilidades para eventos com dois resultados possíveis (Sim/Não).",
            justificativa:
              "A regressão logística é utilizada para prever a probabilidade de uma variável resposta categórica binária.",
          },
        ],
      },
      {
        id: "metodos-de-intervencao-no-comportamento-desviante",
        nome: "Métodos de Intervenção no Comportamento Desviante",
        questoes: [
          {
            id: 1,
            pergunta:
              "O Modelo RSR (Risco, Necessidade e Responsividade) na reabilitação criminal preceitua que:",
            opcoes: [
              "Todos os infratores devem receber exatamente o mesmo tratamento estandardizado",
              "As penas privativas de liberdade devem ser abolidas sem programas alternativos",
              "O nível de intervenção deve ser proporcional ao risco de reincidência do indivíduo",
              "O tratamento deve focar apenas em aspectos hereditários e genéticos",
            ],
            respostaCorreta: 2,
            dica: "O Risco direciona QUEM recebe tratamento intensivo; a Necessidade direciona O QUÊ tratar.",
            justificativa:
              "O princípio do Risco determina que infratores de alto risco exigem intervenções mais intensivas para reduzir a reincidência.",
          },
          {
            id: 2,
            pergunta:
              "Na estrutura do modelo RSR, o que são as 'Necessidades Criminógenas'?",
            opcoes: [
              "Fatores dinâmicos de risco diretamente ligados ao comportamento criminoso que podem ser alterados (ex.: atitudes antissociais)",
              "Características estáticas que jamais mudam, como o histórico de prisões anteriores",
              "Necessidades de consumo financeiro de produtos de luxo",
              "Exames de sangue periódicos exigidos no presídio",
            ],
            respostaCorreta: 0,
            dica: "Fatores mutáveis (dinâmicos) que, quando modificados, reduzem o crime.",
            justificativa:
              "Necessidades criminógenas são alvos terapêuticos dinâmicos cuja modificação reduz diretamente o risco de reincidência.",
          },
          {
            id: 3,
            pergunta:
              "A Terapia Cognitivo-Comportamental (TCC) aplicada a indivíduos em cumprimento de pena busca:",
            opcoes: [
              "Analisar sonhos infantis sob a perspectiva da psicanálise clássica",
              "Prescrever medicamentos tranquilizantes para toda a população prisional",
              "Treinar os apenados em artes marciais avançadas",
              "Identificar e reestruturar padrões de pensamento distorcidos e crenças que justificam a conduta ilícita",
            ],
            respostaCorreta: 3,
            dica: "Conectar pensamentos, crenças automáticas e comportamentos praticados.",
            justificativa:
              "A TCC foca na modificação dos esquemas cognitivos pro-criminais e no desenvolvimento de habilidades de resolução de problemas.",
          },
          {
            id: 4,
            pergunta:
              "A Justiça Restaurativa difere do modelo punitivo retributivo tradicional por enfatizar:",
            opcoes: [
              "A aplicação automática de penas de prisão mais longas e severas",
              "A reparação dos danos causados à vítima e a recomposição do tecido social com a participação das partes",
              "O pagamento de custas judiciais ao juiz do caso",
              "A eliminação do direito do réu de falar no processo",
            ],
            respostaCorreta: 1,
            dica: "Foco na vítima, no infrator e na comunidade em busca de conciliação e reparação.",
            justificativa:
              "A Justiça Restaurativa foca na restauração dos relacionamentos, no diálogo e no atendimento às necessidades reais da vítima e da comunidade.",
          },
          {
            id: 5,
            pergunta:
              "O conceito de 'Dessistência Criminal' (Desistance) refere-se ao:",
            opcoes: [
              "Ato de confessar espontaneamente um delito na esquadra",
              "Aumento da frequência de infrações cometidas após os 30 anos",
              "Processo gradual e dinâmico pelo qual um indivíduo cessa permanentemente o envolvimento com o crime",
              "Abandono de um processo judicial pelo advogado de defesa",
            ],
            respostaCorreta: 2,
            dica: "A 'saída' ou desligamento da carreira criminosa.",
            justificativa:
              "Dessistência é o processo causal pelo qual o infrator encerra seu percurso no comportamento delitivo ao longo do tempo.",
          },
          {
            id: 6,
            pergunta:
              "Os programas de 'Treinamento de Habilidades Sociais' (SST) visam dotar os indivíduos de capacidade para:",
            opcoes: [
              "Gerenciar conflitos, resistir à pressão dos pares e expressar emoções de forma assertiva sem violência",
              "Enganar testemunhas em interrogatórios formais",
              "Criar perfis falsos na internet para operações clandestinas",
              "Memorizar artigos do Código de Processo Penal",
            ],
            respostaCorreta: 0,
            dica: "Desenvolver competências relacionais e autocontrole pro-sociais.",
            justificativa:
              "O treinamento de habilidades sociais ensina alternativas comportamentais não violentas para lidar com frustrações cotidianas.",
          },
          {
            id: 7,
            pergunta:
              "A técnica da 'Entrevista Motivacional' (Miller & Rollnick) é desenhada para:",
            opcoes: [
              "Coagir o participante a assinar uma confissão de culpa",
              "Ajudar os clientes a resolver a ambivalência e fortalecer a motivação interna para a mudança comportamental",
              "Avaliá a memória de curto prazo do depoente",
              "Acelerar o trâmite de soltura condicional",
            ],
            respostaCorreta: 1,
            dica: "Trabalha a motivação intrínseca sem confrontação agressiva.",
            justificativa:
              "A entrevista motivacional é uma abordagem centrada na pessoa para resolver ambivalências e engajar o sujeito na mudança voluntária.",
          },
          {
            id: 8,
            pergunta:
              "As 'Comunidades Terapêuticas' no tratamento do uso abusivo de substâncias dentro ou fora do sistema prisional apoiam-se em:",
            opcoes: [
              "Isolamento em celas individuais sem contato interpessoal por anos",
              "Aulas exclusivamente teóricas de Economia Política",
              "Sistemas de castigos corporais controlados por guardas",
              "Modelo residencial peer-led (ajuda mútua) centrado no trabalho, disciplina e convivência comunitária",
            ],
            respostaCorreta: 3,
            dica: "Ambiente comunitário onde a própria convivência e os pares auxiliam no processo.",
            justificativa:
              "Comunidades terapêuticas usam o ambiente de grupo e a vivência comunitária como ferramentas centrais de reestruturação interpessoal.",
          },
          {
            id: 9,
            pergunta:
              "O monitoramento eletrônico (tornozeleira eletrônica) é classificado como uma medida de:",
            opcoes: [
              "Inviolabilidade penal absoluta sem acompanhamento",
              "Tratamento psiquiátrico compulsório ambulatorial",
              "Execução de pena ou alternativa penal de supervisão técnica e restrição de espaço no meio aberto",
              "Punição aplicável unicamente a testemunhas do processo",
            ],
            respostaCorreta: 2,
            dica: "Mecanismo tecnológico de vigilância e controle fora do presídio físico.",
            justificativa:
              "A monitorização eletrônica funciona como alternativa ao encarceramento ou transição para o meio aberto mediante vigilância à distância.",
          },
          {
            id: 10,
            pergunta:
              "O Good Lives Model (GLM - Modelo de Vidas Realizadas) de reabilitação criminosa enfatiza:",
            opcoes: [
              "Focar exclusivamente nos defeitos, punições e déficits do transgressor",
              "Construir capacitações e fornecer recursos para o indivíduo alcançar 'bens primários' humanos de forma pro-social",
              "Garantir renda básica financeira passiva vitalícia para egressos",
              "Transferir o infrator para outro país após a soltura",
            ],
            respostaCorreta: 1,
            dica: "Abordagem positiva baseada em pontos fortes e realizações pessoais legítimas.",
            justificativa:
              "O GLM é um modelo promocional positivo que ajuda o infrator a conquistar metas de vida valorizadas por meios não criminosos.",
          },
          {
            id: 11,
            pergunta:
              "Em programas de prevenção da reincidência, o 'Planejamento de Prevenção de Recaída' inclui:",
            opcoes: [
              "Identificar gatilhos e situações de alto risco e elaborar estratégias de enfrentamento prévias",
              "Garantir a oferta ilimitada de bebidas alcoólicas na residência do indivíduo",
              "Evitar todo e qualquer tipo de acompanhamento psicológico pós-prisão",
              "Transferir o paciente para um abrigo sem regras de convivência",
            ],
            respostaCorreta: 0,
            dica: "Antecipar cenários de tentação/risco e treinar a resposta certa.",
            justificativa:
              "A prevenção de recaída capacita o indivíduo a reconhecer sinais de alerta e aplicar técnicas para evitar o retorno ao comportamento desviante.",
          },
          {
            id: 12,
            pergunta:
              "A intervenção focada no 'Círculo de Apoio e Prestação de Contas' (COSA) é utilizada principalmente com:",
            opcoes: [
              "Crimes de sonegação fiscal de grande porte",
              "Jovens acusados de pichação de monumentos públicos",
              "Políticos absolvidos por imunidade parlamentar",
              "Egressos de infrações sexuais, oferecendo suporte comunitário e supervisão contínua por voluntários",
            ],
            respostaCorreta: 3,
            dica: "Voluntários treinados que auxiliam e fiscalizam o egresso na comunidade.",
            justificativa:
              "O COSA integra voluntários da comunidade que fornecem apoio social ao mesmo tempo em que exigem responsabilidade do ex-infrator.",
          },
          {
            id: 13,
            pergunta:
              "O conceito de 'Efeito Estigmatizante' das intervenções punitivas precoces alerta que:",
            opcoes: [
              "Prisões curtas reduzem a zero o risco de cometimento de novos crimes",
              "Institucionalizar jovens precocemente pode reforçar a identidade criminosa e aumentar a reincidência",
              "A aplicação de multas leves gera trauma psicológico irreversível",
              "A mediação escolar deve ser proibida por lei federal",
            ],
            respostaCorreta: 1,
            dica: "A rotulagem e o encarceramento precoce podem piorar a trajetória do jovem.",
            justificativa:
              "Intervenções excessivamente punitivas em jovens produzem rotulagem e inserção em redes delitivas, ampliando o risco de desvio.",
          },
          {
            id: 14,
            pergunta:
              "Qual é a principal meta das 'Tabelas de Avaliação de Risco Estruturado' (ex.: COMPAS, LSI-R)?",
            opcoes: [
              "Definir a cor do uniforme a ser utilizado pelo interno",
              "Calcular o montante em kwanzas para pagamento de fiança",
              "Fornecer uma estimativa padronizada do risco de reincidência e mapear as necessidades de tratamento",
              "Determinar o tempo de duração da visita íntima",
            ],
            respostaCorreta: 2,
            dica: "Ferramentas psicométricas e estatísticas de suporte à decisão de gestão do risco.",
            justificativa:
              "Instrumentos estruturados medem objetivamente o perfil de risco e indicam as prioridades de intervenção preventiva.",
          },
          {
            id: 15,
            pergunta:
              "Programas de 'Treinamento de Controle da Raiva' (Anger Management) ensinam o participante a:",
            opcoes: [
              "Reconhecer os sinais fisiológicos e cognitivos da raiva e reprimir a resposta agressiva automática",
              "Gritar com autoridades para exigir direitos constitucionais",
              "Acumular estresse até a ocorrência de uma explosão emocional violenta",
              "Substituir o diálogo interpessoal por confrontos físicos combinados",
            ],
            respostaCorreta: 0,
            dica: "Identificação precoce do estado de irritação e aplicação de técnicas de autorregulação.",
            justificativa:
              "O gerenciamento da raiva desenvolve o autoconhecimento sobre os gatilhos fisiológicos e cognitivos e fornece estratégias de desescalada.",
          },
        ],
      },
      {
        id: "direito-da-familia-e-dos-menores",
        nome: "Direito da Família e dos Menores",
        questoes: [
          {
            id: 1,
            pergunta:
              "O Princípio do 'Superior Interesse da Criança e do Adolescente' determina que:",
            opcoes: [
              "A vontade dos pais deve sempre prevalecer, mesmo que fira os direitos do filho",
              "As decisões judiciais e administrativas devem priorizar a proteção, o bem-estar e o desenvolvimento integral do menor",
              "A criança deve trabalhar a partir dos 10 anos para auxiliar no sustento da casa",
              "O patrimônio financeiro da família não pode ser dividido em hipótese alguma",
            ],
            respostaCorreta: 1,
            dica: "Direito fundamental que coloca os direitos do menor no topo das prioridades.",
            justificativa:
              "O superior interesse do menor orienta todo o ordenamento jurídico no sentido de assegurar com absoluta prioridade os direitos da criança.",
          },
          {
            id: 2,
            pergunta:
              "A Guarda Compartilhada entre pais separados é caracterizada por:",
            opcoes: [
              "Residência da criança alterada diariamente a cada 12 horas",
              "Perda total do poder familiar do pai não gestante",
              "Co-responsabilização e divisão conjunta dos direitos e deveres relativos ao exercício das decisões sobre o filho",
              "Transferência da tutela da criança para um abrigo público governamental",
            ],
            respostaCorreta: 2,
            dica: "Divisão de responsabilidades e decisões da vida da criança entre ambos os genitores.",
            justificativa:
              "Na guarda compartilhada, ambos os pais participam ativamente do planejamento e das decisões fundamentais da vida do filho.",
          },
          {
            id: 3,
            pergunta:
              "O conceito de 'Alienação Parental' ocorre quando um dos genitores:",
            opcoes: [
              "Promove a interferência na formação psicológica da criança para renegá-la ou induzir o repúdio ao outro genitor",
              "Inscreve o filho em uma escola de ensino integral privada",
              "Leva a criança para passeios aos finais de semana cadastrados",
              "Exige o cumprimento da agenda de vacinação obrigatória",
            ],
            respostaCorreta: 0,
            dica: "Campanha para fazer a criança odiar ou afastar-se do outro pai/mãe.",
            justificativa:
              "Alienação parental é a manipulação do menor por um dos genitores visando prejudicar os laços afetivos com o outro.",
          },
          {
            id: 4,
            pergunta:
              "No âmbito do Direito dos Menores, o 'Ato Infracional' é definido como a conduta descrita como:",
            opcoes: [
              "Desobediência leve às regras de conduta escolares",
              "Falta de comparência às aulas sem justificativa médica",
              "Atraso no pagamento da pensão alimentícia pelos pais",
              "Crime ou contravenção penal praticada por criança ou adolescente",
            ],
            respostaCorreta: 3,
            dica: "Equivalente ao crime quando cometido por pessoa inimputável pela idade.",
            justificativa:
              "Ato infracional é a designação jurídica para a conduta análoga a crime ou contravenção realizada por menores de idade.",
          },
          {
            id: 5,
            pergunta:
              "As sanções aplicadas a adolescentes autores de atos infracionais têm natureza eminentemente:",
            opcoes: [
              "De vingança estatal com penas corporais e trabalhos forçados",
              "Sócio-educativa e pedagógica, visando a reintegração e responsabilização do jovem",
              "Pecuniária estrita aplicada exclusivamente aos avós",
              "Vitalícia de privação de direitos políticos e de trabalho",
            ],
            respostaCorreta: 1,
            dica: "Foco na educação, responsabilização e reinserção social.",
            justificativa:
              "Medidas socioeducativas buscam reeducar o adolescente infrator, evitando a mera punição desprovida de caráter pedagógico.",
          },
          {
            id: 6,
            pergunta:
              "Qual das seguintes opções é uma Medida Socioeducativa em Meio Aberto?",
            opcoes: [
              "Internação em estabelecimento educacional fechado",
              "Prisão preventiva em cela comum de adultos",
              "Prestação de Serviços à Comunidade (PSC)",
              "Internação compulsória hospitalar psiquiátrica",
            ],
            respostaCorreta: 2,
            dica: "O adolescente cumpre em liberdade mantendo suas rotinas e família.",
            justificativa:
              "A prestação de serviços comunitários e a liberdade assistida são executadas no meio aberto sem privação completa de liberdade.",
          },
          {
            id: 7,
            pergunta:
              "O Dever de Prestação de Alimentos (Pensão Alimentícia) fundamenta-se no princípio da:",
            opcoes: [
              "Solidariedade Familiar e no binômio Necessidade do alimentando vs. Possibilidade do alimentante",
              "Vingança financeira entre ex-cônjuges divorciados",
              "Obrigação estrita de ressarcimento de dívidas contratuais",
              "Caridade pública oferecida por organizações não governamentais",
            ],
            respostaCorreta: 0,
            dica: "Binômio Necessidade de quem pede vs. Possibilidade de quem paga.",
            justificativa:
              "Os alimentos são fixados proporcionalmente às necessidades de quem recebe e aos recursos financeiros de quem paga.",
          },
          {
            id: 8,
            pergunta: "A Adoção é um instituto jurídico que:",
            opcoes: [
              "Concede a custódia provisória de uma criança apenas durante as férias escolares",
              "Funciona como um contrato de prestação de serviços de babá remunerada",
              "Pode ser revogada unilateralmente pelos adotantes se o jovem não tirar boas notas",
              "Cria um vínculo definitivo de filiação, atribuindo à pessoa adotada a condição de filho com os mesmos direitos e deveres",
            ],
            respostaCorreta: 3,
            dica: "Torna o filho adotivo igual em todos os direitos ao filho biológico, de forma irrevogável.",
            justificativa:
              "A adoção é ato solene e irrevogável que confere o estatuto pleno de filho com equiparação absoluta de direitos.",
          },
          {
            id: 9,
            pergunta:
              "O instituto do 'Poder Familiar' (ou Autoridade Parental) consiste em:",
            opcoes: [
              "A propriedade física absoluta dos pais sobre a vida dos filhos",
              "Conjunto de direitos e deveres assegurados aos pais em relação à pessoa e aos bens dos filhos menores não emancipados",
              "O direito de vender os bens e heranças dos filhos sem autorização do juiz",
              "A autoridade conferida aos professores de punir fisicamente os alunos",
            ],
            respostaCorreta: 1,
            dica: "Múnus público para reger, proteger e sustentar os filhos menores.",
            justificativa:
              "O poder familiar é o complexo de deveres e direitos dos genitores no interesse do cuidado e formação dos filhos.",
          },
          {
            id: 10,
            pergunta:
              "Qual a duração máxima permitida por lei para a medida excepcional de internação provisória de adolescente antes da sentença final?",
            opcoes: [
              "10 anos",
              "2 dias",
              "45 dias",
              "Sem limite de tempo estabelecido",
            ],
            respostaCorreta: 2,
            dica: "Prazo estrito para evitar a prisão prolongada sem conclusão do processo socioeducativo.",
            justificativa:
              "A internação antes da sentença é medida cautelar excepcional que não pode ultrapassar o limite de 45 dias na legislação de referência.",
          },
          {
            id: 11,
            pergunta:
              "O regime matrimonial de 'Comunhão Parcial de Bens' estabelece que:",
            opcoes: [
              "Comunicam-se os bens adquiridos onerosamente pelo casal na constância do casamento, excluindo-se os bens anteriores e doações/heranças",
              "Todos os bens passados, presentes e futuros pertencem a ambos os cônjuges sem exceção",
              "Nenhum bem se comunica, mantendo-se a separação absoluta de patrimônios",
              "Os bens imóveis passam a pertencer automaticamente ao Estado",
            ],
            respostaCorreta: 0,
            dica: "O que foi comprado junto durante o casamento é dos dois.",
            justificativa:
              "Na comunhão parcial, apenas o patrimônio adquirido a título oneroso durante a união integra o acervo comum do casal.",
          },
          {
            id: 12,
            pergunta:
              "O 'Acolhimento Familiar ou Institucional' de crianças em situação de risco deve ser tratado como uma medida:",
            opcoes: [
              "Definitiva e permanente até a maioridade da criança",
              "Punitiva direcionada à criança por seus maus comportamentos escolares",
              "Obrigatória para todas as famílias de baixa renda da cidade",
              "Provisória e excepcional, visando a reintegração na família de origem ou extensa sempre que possível",
            ],
            respostaCorreta: 3,
            dica: "Sempre a última opção e por menor tempo possível.",
            justificativa:
              "O acolhimento é medida protetiva temporária e de exceção, devendo priorizar a recomposição dos laços familiares originais.",
          },
          {
            id: 13,
            pergunta: "A 'Emancipação' de um menor civilmente capaz significa:",
            opcoes: [
              "A perda automática da cidadania do indivíduo no país",
              "A aquisição da capacidade civil plena antes da idade legal mínima estabelecida por lei",
              "A obrigatoriedade de prestar serviço militar imediato",
              "A transferência do jovem para um centro socioeducativo fechado",
            ],
            respostaCorreta: 1,
            dica: "Antecipação dos atos da vida civil plena para menores qualificados.",
            justificativa:
              "A emancipação extingue a incapacidade civil relativa do menor, permitindo a prática de atos da vida civil de forma autônoma.",
          },
          {
            id: 14,
            pergunta:
              "O 'Direito de Convivência Familiar' (antigo direito de visitas) assegura que:",
            opcoes: [
              "Os avós sejam proibidos de visitar os netos em qualquer circunstância",
              "A criança possa decidir viver sozinha a partir dos 8 anos de idade",
              "O genitor que não detém a guarda física mantenha contato, convivência e acompanhamento do desenvolvimento do filho",
              "O pai ou mãe que paga alimentos fique isento de ver o filho",
            ],
            respostaCorreta: 2,
            dica: "Garante ao filho o convívio saudável com o genitor não residente.",
            justificativa:
              "A convivência é um direito do próprio filho de manter vínculos afetivos e acompanhamento contínuo de ambos os pais.",
          },
          {
            id: 15,
            pergunta:
              "A Suspensão ou Destituição do Poder Familiar pode ser decretada pelo juiz quando os pais:",
            opcoes: [
              "Castigarem imoderadamente, abandonarem ou praticarem atos contrários à moral e aos deveres de proteção do filho",
              "Trocarem de emprego ou mudarem para um apartamento menor",
              "Professarem religiões não majoritárias na região",
              "Decidirem matricular o filho em cursos de línguas estrangeiras",
            ],
            respostaCorreta: 0,
            dica: "Violação grave e reiterada dos deveres essenciais de proteção à infância.",
            justificativa:
              "A perda da autoridade parental é sanção grave applied judicialmente em casos comprovados de abuso, negligência grave ou abandono.",
          },
        ],
      },
    ],
  },

  {
    id: "mod-3",
    titulo: "Nível 3: Especialização Operacional e Forense",
    disciplinas: [
      {
        id: "criminologia-clinica",
        nome: "Criminologia Clínica",
        questoes: [
          {
            id: 1,
            pergunta:
              "Qual é o foco principal da Criminologia Clínica no contexto da execução penal?",
            opcoes: [
              "Diagnosticar a personalidade do delinquente para elaborar um tratamento individualizado.",
              "Determinar a pena abstrata com base na gravidade social do crime.",
              "Investigar a autoria de crimes não solucionados pela polícia judiciária.",
              "Substituir a sanção penal por medidas assistenciais sem qualquer avaliação prévia.",
            ],
            respostaCorreta: 0,
            dica: "Pense no nível individual (micro) de análise, e não no crime em abstrato.",
            justificativa:
              "A Criminologia Clínica foca no indivíduo, buscando compreender os fatores psicossociais do delito para formular diagnósticos, prognósticos de reincidência e planos de tratamento individualizados.",
          },
          {
            id: 2,
            pergunta:
              "Para Jean Pinatel, o conceito clássico de 'estado perigoso' é composto por quais dois elementos fundamentais?",
            opcoes: [
              "Gravidade do delito e alarme social provocado.",
              "Capacidade delitiva e inadaptabilidade social.",
              "Periculosidade presumida e reincidência específica.",
              "Capacidade jurídica e grau de imputabilidade.",
            ],
            respostaCorreta: 1,
            dica: "Um elemento é o potencial de agir, o outro é a dificuldade de aceitar as normas sociais.",
            justificativa:
              "Segundo a criminologia clínica tradicional, o estado perigoso integra a capacidade delitiva (potencial destrutivo/violento) e a inadaptabilidade social (dificuldade de assimilar normas da comunidade).",
          },
          {
            id: 3,
            pergunta:
              "O exame criminológico, tal como concebido pela Criminologia Clínica moderna, caracteriza-se por:",
            opcoes: [
              "Ser realizado unicamente pelo juiz da causa, sem apoio técnico.",
              "Dispensar qualquer participação de profissionais de saúde mental.",
              "Ser um procedimento interdisciplinar, com pareceres de psicólogos, assistentes sociais, juristas e médicos.",
              "Limitar-se a um laudo psiquiátrico isolado de sanidade mental.",
            ],
            respostaCorreta: 2,
            dica: "Envolve uma equipa técnica, não um único profissional isolado.",
            justificativa:
              "O exame criminológico é interdisciplinar e envolve pareceres de psicólogos, assistentes sociais, juristas e médicos para compor um diagnóstico global do sujeito.",
          },
          {
            id: 4,
            pergunta:
              "Ao elaborar um prognóstico de reincidência, a avaliação criminológica moderna prioriza:",
            opcoes: [
              "O tipo de delito praticado como único critério de risco.",
              "A intuição clínica não estruturada do avaliador.",
              "Exclusivamente os antecedentes criminais e dados estáticos do passado.",
              "A combinação de fatores estáticos (histórico) e dinâmicos (necessidades criminógenas alteráveis).",
            ],
            respostaCorreta: 3,
            dica: "Pense em fatores que não mudam e em fatores que podem ser trabalhados em terapia.",
            justificativa:
              "As ferramentas modernas de avaliação de risco combinam fatores estáticos (imutáveis) com fatores dinâmicos (como abuso de substâncias ou atitudes antissociais), que podem ser trabalhados na reabilitação.",
          },
          {
            id: 5,
            pergunta:
              "Qual alternativa expressa corretamente a diferença entre 'capacidade delitiva' e 'vulnerabilidade social'?",
            opcoes: [
              "Capacidade delitiva refere-se ao potencial de execução do delito pelo agente; vulnerabilidade social refere-se à exposição do sujeito aos riscos do ambiente.",
              "Capacidade delitiva é um conceito de Direito Penal, enquanto vulnerabilidade é de Direito Processual.",
              "Ambas são sinónimos e indicam a periculosidade inata do indivíduo.",
              "Capacidade delitiva mede o dano causado à vítima; vulnerabilidade mede a gravidade da pena.",
            ],
            respostaCorreta: 0,
            dica: "Um conceito olha para o agente, o outro para o contexto que o rodeia.",
            justificativa:
              "A capacidade delitiva mede a predisposição/energia criminosa do autor, enquanto a vulnerabilidade social considera os fatores estruturais do contexto que o expõem à criminalização ou à vitimização.",
          },
          {
            id: 6,
            pergunta:
              "Quanto à utilização do exame criminológico na execução penal, é correto afirmar que:",
            opcoes: [
              "Substitui integralmente a decisão do juiz.",
              "Pode ser utilizado pelo juiz para fundamentar decisões, como a progressão de regime, quando justificado.",
              "É totalmente vedado por lei, em qualquer hipótese.",
              "Só pode ser usado para agravar a situação do condenado.",
            ],
            respostaCorreta: 1,
            dica: "O exame é um instrumento de apoio à decisão judicial, não um substituto dela.",
            justificativa:
              "Embora não seja exigido obrigatoriamente em todos os casos, o juiz pode determinar o exame criminológico de forma fundamentada para embasar decisões relativas à execução da pena.",
          },
          {
            id: 7,
            pergunta:
              "Dentre os fatores criminógenos dinâmicos (passíveis de intervenção), qual representa um foco prioritário para programas de reabilitação?",
            opcoes: [
              "Idade do primeiro contacto com o sistema penal.",
              "Género biológico do apenado.",
              "Crenças e atitudes de legitimação da violência.",
              "Histórico familiar de condenações.",
            ],
            respostaCorreta: 2,
            dica: "Pense no que pode ser mudado através de intervenção psicossocial.",
            justificativa:
              "Cognições e atitudes antissociais são fatores dinâmicos (necessidades criminógenas). Idade do primeiro delito e histórico familiar são fatores estáticos e imutáveis.",
          },
          {
            id: 8,
            pergunta:
              "O conceito de 'núcleo central da personalidade criminosa', proposto por Jean Pinatel, inclui componentes como:",
            opcoes: [
              "Introversão, hiperatividade, esquizofrenia e mania.",
              "Baixa inteligência, psicose clínica e compulsão motora.",
              "Tipologia física atlética, impulsividade e cleptomania.",
              "Egocentrismo, labilidade, agressividade e indiferença afetiva.",
            ],
            respostaCorreta: 3,
            dica: "São quatro traços de personalidade, não diagnósticos psiquiátricos.",
            justificativa:
              "Pinatel descreve a personalidade criminosa através de quatro traços articulados: egocentrismo, labilidade (impulsividade/inconstância), agressividade e indiferença afetiva.",
          },
          {
            id: 9,
            pergunta:
              "A finalidade da avaliação criminológica clínica, na execução penal, é:",
            opcoes: [
              "Subsidiar o tratamento, o prognóstico e a reinserção social do condenado, sem substituir o direito penal do facto.",
              "Substituir integralmente o processo penal.",
              "Determinar sozinha a duração da pena.",
              "Punir o infrator com base em traços de personalidade, independentemente do facto praticado.",
            ],
            respostaCorreta: 0,
            dica: "O Direito Penal moderno julga o facto praticado, não apenas a personalidade do autor.",
            justificativa:
              "O Direito Penal moderno pauta-se pelo direito penal do facto, e não do autor. A Criminologia Clínica atua na fase executória para fins de tratamento e ressocialização, não para agravar penas arbitrariamente.",
          },
          {
            id: 10,
            pergunta:
              "Em um parecer criminológico, qual elemento é essencial para a elaboração do Plano Individual de Atendimento (PIA) do condenado?",
            opcoes: [
              "A quantificação exata da indemnização devida à vítima.",
              "O mapeamento das vulnerabilidades e fatores de risco do apenado para propor oficinas, estudo e terapia.",
              "A recomendação de alteração do tipo penal fixado na sentença.",
              "O julgamento sumário do grau de culpa do réu.",
            ],
            respostaCorreta: 1,
            dica: "O plano deve orientar o percurso de reabilitação, não rever a sentença.",
            justificativa:
              "O parecer deve oferecer subsídios técnicos para traçar um plano de execução da pena focado no desenvolvimento do apenado e na redução das chances de reincidência.",
          },
          {
            id: 11,
            pergunta:
              "Qual é a principal crítica feita pela Criminologia Crítica ao modelo da Criminologia Clínica tradicional?",
            opcoes: [
              "O foco excessivo na defesa dos direitos das vítimas, em detrimento do réu.",
              "A recusa em trabalhar dentro de estabelecimentos prisionais.",
              "A patologização do delinquente e a negação dos fatores socioeconómicos da criminalidade.",
              "O uso excessivo de métodos quantitativos de análise de dados.",
            ],
            respostaCorreta: 2,
            dica: "Pense na oposição entre explicações individuais e explicações estruturais do crime.",
            justificativa:
              "A Criminologia Crítica acusa o modelo clínico tradicional de individualizar e medicalizar problemas que são predominantemente estruturais e sociais.",
          },
          {
            id: 12,
            pergunta:
              "O diagnóstico criminológico, na perspetiva clínica atual, caracteriza-se por:",
            opcoes: [
              "Limitar-se à catalogação de transtornos mentais segundo manuais psiquiátricos.",
              "Ignorar por completo a trajetória biográfica do sujeito.",
              "Ser produzido exclusivamente por juristas, sem apoio técnico.",
              "Buscar compreender o significado do ato delitivo na história de vida do indivíduo, indo além do diagnóstico psiquiátrico formal.",
            ],
            respostaCorreta: 3,
            dica: "Vai além de um simples rótulo clínico.",
            justificativa:
              "A análise criminológica vai além do diagnóstico psiquiátrico formal, interpretando a conduta desviante na dinâmica biopsicossocial da vida do sujeito.",
          },
          {
            id: 13,
            pergunta:
              "Dentre os instrumentos padronizados de avaliação de risco de violência mais reconhecidos internacionalmente, destaca-se o:",
            opcoes: [
              "HCR-20 (Historical Clinical Risk-20).",
              "Inventário de Desempenho Escolar.",
              "Código de Processo Penal Comentado.",
              "Teste de Rorschach, aplicado isoladamente.",
            ],
            respostaCorreta: 0,
            dica: "É uma sigla de avaliação estruturada de risco de violência.",
            justificativa:
              "O HCR-20 é uma guia de avaliação estruturada do risco de violência, amplamente validada no campo da criminologia e da psicologia forense.",
          },
          {
            id: 14,
            pergunta:
              "A prevenção terciária, em Criminologia Clínica, relaciona-se diretamente com:",
            opcoes: [
              "O patrulhamento ostensivo em áreas comerciais.",
              "Ações voltadas a evitar que indivíduos já apenados voltem a delinquir (evitar a reincidência).",
              "A iluminação de vias públicas e a segurança urbana.",
              "Campanhas educativas nas escolas sobre uso de drogas.",
            ],
            respostaCorreta: 1,
            dica: "Este nível de prevenção atua depois de já ter havido condenação.",
            justificativa:
              "A prevenção terciária atua após a ocorrência do crime e a condenação do autor, focando na reabilitação, na reinserção social e na não reincidência.",
          },
          {
            id: 15,
            pergunta:
              "A respeito da imputabilidade penal e da avaliação criminológica, é correto afirmar que:",
            opcoes: [
              "Só os inimputáveis podem ser submetidos a avaliação criminológica.",
              "A avaliação criminológica é facultativa apenas para reincidentes.",
              "Mesmo indivíduos imputáveis podem ser submetidos a avaliação e acompanhamento clínico/psicossocial durante a execução penal, com fins de ressocialização.",
              "A imputabilidade penal extingue totalmente a necessidade de acompanhamento criminológico durante a execução da pena.",
            ],
            respostaCorreta: 2,
            dica: "Ser responsável pelos próprios atos não elimina a necessidade de acompanhamento durante o cumprimento da pena.",
            justificativa:
              "Mesmo indivíduos imputáveis e plenamente responsáveis pelos seus atos passam por avaliação e intervenção clínica/psicossocial para fins de ressocialização no sistema prisional.",
          },
        ],
      },
      {
        id: "direito-processual-1",
        nome: "Direito Processual 1",
        questoes: [
          {
            id: 1,
            pergunta: "O princípio da presunção de inocência estabelece que:",
            opcoes: [
              "Ninguém será considerado culpado até o trânsito em julgado de sentença penal condenatória.",
              "O acusado deve provar a sua inocência desde o início do processo.",
              "A confissão do réu dispensa qualquer outra prova.",
              "Cabe sempre à defesa provar a autoria do crime.",
            ],
            respostaCorreta: 0,
            dica: "Pense em quem tem o ónus de provar a culpa e até quando o acusado é considerado inocente.",
            justificativa:
              "A presunção de inocência é garantia fundamental que impõe ao Estado o ónus de provar a culpa, mantendo o acusado como inocente até condenação definitiva.",
          },
          {
            id: 2,
            pergunta: "O inquérito policial tem natureza jurídica de:",
            opcoes: [
              "Recurso interposto pela defesa.",
              "Procedimento administrativo preparatório, de caráter inquisitivo, destinado a apurar autoria e materialidade.",
              "Processo judicial com contraditório pleno.",
              "Sentença condenatória provisória.",
            ],
            respostaCorreta: 1,
            dica: "É uma fase anterior ao processo judicial propriamente dito.",
            justificativa:
              "O inquérito policial é um procedimento administrativo, preparatório e inquisitivo, destinado a reunir elementos sobre a autoria e a materialidade do crime, antes da ação penal.",
          },
          {
            id: 3,
            pergunta: "O princípio do contraditório assegura às partes:",
            opcoes: [
              "A dispensa de citação do réu.",
              "A exclusão da defesa técnica em crimes graves.",
              "O direito de conhecer e se manifestar sobre todos os atos e provas produzidos no processo.",
              "O direito de recorrer apenas em segunda instância.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com o direito de reagir a tudo o que é produzido no processo.",
            justificativa:
              "O contraditório garante às partes o direito de tomar conhecimento e de se manifestar sobre os atos e provas produzidos, assegurando a paridade de armas processual.",
          },
          {
            id: 4,
            pergunta:
              "Para a decretação da prisão preventiva, como medida cautelar, exige-se:",
            opcoes: [
              "Requerimento exclusivo da vítima, sem análise judicial.",
              "Confissão espontânea do investigado.",
              "Mera suspeita informal, sem qualquer prova.",
              "Prova da materialidade e indícios suficientes de autoria, além de um requisito legal (garantia da ordem pública, econômica, instrução ou aplicação da lei penal).",
            ],
            respostaCorreta: 3,
            dica: "É preciso mais do que uma suspeita: prova + indícios + um fundamento legal específico.",
            justificativa:
              "A prisão preventiva exige prova da materialidade, indícios suficientes de autoria e a presença de ao menos um dos requisitos legais que justifiquem a cautela.",
          },
          {
            id: 5,
            pergunta: "Qual é a finalidade da citação no processo penal?",
            opcoes: [
              "Dar ciência formal ao acusado da acusação, viabilizando o exercício da ampla defesa.",
              "Encerrar a fase de instrução.",
              "Substituir a sentença condenatória.",
              "Determinar automaticamente a prisão do réu.",
            ],
            respostaCorreta: 0,
            dica: "É o ato que informa o réu de que está a ser processado.",
            justificativa:
              "A citação tem por finalidade dar ciência formal ao acusado da acusação existente, permitindo o exercício efetivo do direito de defesa.",
          },
          {
            id: 6,
            pergunta:
              "O sistema acusatório, adotado pela generalidade dos ordenamentos democráticos, caracteriza-se por:",
            opcoes: [
              "Inexistência de fase de instrução.",
              "Separação das funções de acusar, defender e julgar, atribuídas a sujeitos processuais distintos.",
              "Ausência de defesa técnica.",
              "Concentração das funções de acusação e julgamento numa só autoridade.",
            ],
            respostaCorreta: 1,
            dica: "Pense em três papéis distintos: quem acusa, quem defende e quem julga.",
            justificativa:
              "O sistema acusatório distingue-se pela separação orgânica entre as funções de acusação, defesa e julgamento, atribuídas a sujeitos processuais diferentes.",
          },
          {
            id: 7,
            pergunta:
              "As provas ilícitas, obtidas por meios que violam direitos fundamentais, são, em regra:",
            opcoes: [
              "Automaticamente convalidadas pelo decurso do tempo.",
              "Válidas apenas se favoráveis à acusação.",
              "Inadmissíveis no processo, bem como as provas delas derivadas, salvo exceções legais.",
              "Sempre admitidas, independentemente da forma de obtenção.",
            ],
            respostaCorreta: 2,
            dica: "Pense na chamada 'teoria dos frutos da árvore envenenada'.",
            justificativa:
              "As provas obtidas por meios ilícitos, bem como as que delas derivam, são, em regra, inadmissíveis no processo, salvaguardando os direitos fundamentais do acusado.",
          },
          {
            id: 8,
            pergunta:
              "A competência em razão da matéria é fixada, em regra, por:",
            opcoes: [
              "Local de residência da vítima.",
              "Acordo entre as partes.",
              "Livre escolha do Ministério Público.",
              "Critérios legais relacionados à natureza da infração penal.",
            ],
            respostaCorreta: 3,
            dica: "Depende do tipo de crime, definido previamente por lei.",
            justificativa:
              "A competência material é definida por critérios legais objetivos, relacionados à natureza e à gravidade da infração penal, não podendo ser escolhida livremente pelas partes.",
          },
          {
            id: 9,
            pergunta: "O flagrante delito autoriza a prisão do agente:",
            opcoes: [
              "No momento em que está a cometer a infração ou logo após, nos casos previstos em lei, independentemente de prévia ordem judicial.",
              "Apenas em crimes de menor gravidade.",
              "Exclusivamente após condenação transitada em julgado.",
              "Somente mediante mandado judicial prévio.",
            ],
            respostaCorreta: 0,
            dica: "É uma exceção à exigência geral de ordem judicial prévia para prender.",
            justificativa:
              "O flagrante delito é uma das exceções constitucionais à exigência de ordem judicial prévia, autorizando a prisão imediata de quem é surpreendido a cometer o crime.",
          },
          {
            id: 10,
            pergunta: "A ampla defesa desdobra-se, tradicionalmente, em:",
            opcoes: [
              "Apenas o direito ao silêncio.",
              "Defesa técnica (por advogado) e autodefesa (direito de audiência e presença do próprio acusado).",
              "Apenas a defesa técnica, excluída a autodefesa.",
              "Apenas o direito de recorrer.",
            ],
            respostaCorreta: 1,
            dica: "Há duas dimensões: a do profissional e a do próprio acusado.",
            justificativa:
              "A ampla defesa compreende a defesa técnica, exercida por advogado habilitado, e a autodefesa, que inclui o direito do acusado de ser ouvido e de acompanhar o processo.",
          },
          {
            id: 11,
            pergunta: "O princípio do juiz natural veda:",
            opcoes: [
              "O julgamento por tribunais colegiados.",
              "A distribuição aleatória de processos entre varas.",
              "A criação de tribunais ou juízos de exceção, designados especificamente para julgar determinado facto ou pessoa.",
              "A existência de tribunais superiores.",
            ],
            respostaCorreta: 2,
            dica: "Proíbe tribunais criados 'à medida' de um caso específico.",
            justificativa:
              "O juiz natural veda a criação de tribunais de exceção, garantindo que ninguém seja julgado por órgão constituído especialmente após a ocorrência do facto.",
          },
          {
            id: 12,
            pergunta:
              "A busca e apreensão domiciliar, como regra geral, depende de:",
            opcoes: [
              "Consentimento de qualquer vizinho.",
              "Autorização exclusiva do Ministério Público.",
              "Simples solicitação verbal da autoridade policial.",
              "Autorização judicial fundamentada, ressalvadas hipóteses de flagrante, desastre, socorro ou consentimento do morador.",
            ],
            respostaCorreta: 3,
            dica: "A inviolabilidade do domicílio só cede em situações excecionais previstas em lei.",
            justificativa:
              "A busca domiciliar exige, em regra, autorização judicial fundamentada, existindo exceções constitucionais como o flagrante delito, o desastre, a prestação de socorro ou o consentimento do morador.",
          },
          {
            id: 13,
            pergunta:
              "O que caracteriza o princípio da obrigatoriedade da ação penal pública?",
            opcoes: [
              "O Ministério Público, presentes os requisitos legais, não pode dispor livremente da propositura da ação penal, salvo exceções legalmente previstas.",
              "A ação penal pública pode ser retirada a qualquer momento, sem justificativa.",
              "O juiz inicia sempre o processo de ofício.",
              "A vítima decide, em qualquer crime, se o processo prossegue.",
            ],
            respostaCorreta: 0,
            dica: "Presentes os pressupostos legais, o órgão acusador tem, em regra, o dever de agir.",
            justificativa:
              "A obrigatoriedade impõe ao Ministério Público o dever de propor a ação penal pública sempre que presentes os pressupostos legais, não podendo dela dispor livremente, salvo exceções previstas em lei.",
          },
          {
            id: 14,
            pergunta:
              "A prova testemunhal, no processo penal, deve observar, entre outros, o princípio:",
            opcoes: [
              "Do sigilo absoluto, vedada a presença das partes.",
              "Da imediação, permitindo o contacto direto do julgador com o depoente.",
              "Da dispensa de compromisso legal.",
              "Da irrelevância do contraditório.",
            ],
            respostaCorreta: 1,
            dica: "O julgador deve ter contacto direto com quem depõe.",
            justificativa:
              "O princípio da imediação permite ao julgador o contacto direto com a testemunha, favorecendo uma avaliação mais fidedigna da credibilidade do depoimento.",
          },
          {
            id: 15,
            pergunta:
              "O habeas corpus é o instrumento processual adequado para:",
            opcoes: [
              "Anular contratos civis.",
              "Discutir exclusivamente questões patrimoniais.",
              "Tutelar a liberdade de locomoção ameaçada ou violada por ilegalidade ou abuso de poder.",
              "Substituir o recurso de apelação em qualquer hipótese.",
            ],
            respostaCorreta: 2,
            dica: "Protege especificamente a liberdade de ir e vir.",
            justificativa:
              "O habeas corpus é a garantia constitucional destinada especificamente a proteger a liberdade de locomoção contra ilegalidade ou abuso de poder.",
          },
        ],
      },
      {
        id: "direito-processual-2",
        nome: "Direito Processual 2",
        questoes: [
          {
            id: 1,
            pergunta: "O recurso de apelação, em regra, destina-se a:",
            opcoes: [
              "Substituir o inquérito policial.",
              "Anular a citação do réu.",
              "Impugnar sentenças e certas decisões interlocutórias, submetendo-as a reexame por instância superior.",
              "Suspender definitivamente o processo, sem possibilidade de retomada.",
            ],
            respostaCorreta: 2,
            dica: "É o principal recurso contra a decisão final de primeira instância.",
            justificativa:
              "A apelação é o recurso ordinário por excelência, destinado a levar a decisão de primeiro grau ao reexame de um tribunal superior.",
          },
          {
            id: 2,
            pergunta:
              "O trânsito em julgado de uma decisão penal ocorre quando:",
            opcoes: [
              "Não cabe mais recurso, tornando-se a decisão definitiva e imutável.",
              "A decisão passa a ser publicada em diário oficial.",
              "O réu confessa a autoria do crime.",
              "É proferida a sentença de primeira instância, independentemente de recurso.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com o esgotamento das possibilidades de recurso.",
            justificativa:
              "O trânsito em julgado ocorre quando a decisão se torna definitiva, por esgotamento ou renúncia aos recursos cabíveis, produzindo coisa julgada.",
          },
          {
            id: 3,
            pergunta: "A revisão criminal é cabível, tipicamente, quando:",
            opcoes: [
              "O réu está apenas insatisfeito com a pena aplicada.",
              "A vítima deseja aumentar a pena já fixada.",
              "O processo ainda está em fase de instrução.",
              "Surgem novas provas ou se demonstra erro judiciário após o trânsito em julgado de condenação.",
            ],
            respostaCorreta: 3,
            dica: "É um instrumento excecional, posterior ao trânsito em julgado, para corrigir erros graves.",
            justificativa:
              "A revisão criminal destina-se a rever condenações já transitadas em julgado, quando surgem novas provas ou se comprova erro judiciário, sempre em benefício do condenado.",
          },
          {
            id: 4,
            pergunta:
              "O princípio da celeridade processual busca, principalmente:",
            opcoes: [
              "Reduzir garantias processuais em nome da rapidez.",
              "Assegurar que o processo se desenvolva sem dilações indevidas, respeitando os prazos razoáveis.",
              "Eliminar a fase recursal.",
              "Impedir qualquer produção de prova pericial.",
            ],
            respostaCorreta: 1,
            dica: "É sobre tempo razoável, não sobre eliminar garantias.",
            justificativa:
              "A celeridade processual assegura que o processo tramite em prazo razoável, sem prejudicar as garantias fundamentais das partes.",
          },
          {
            id: 5,
            pergunta: "A prova pericial é especialmente relevante quando:",
            opcoes: [
              "As partes concordam em dispensar qualquer prova.",
              "Apenas questões de direito estão em discussão.",
              "O réu confessa integralmente o crime.",
              "O facto depende de conhecimento técnico ou científico especializado.",
            ],
            respostaCorreta: 3,
            dica: "Pense em situações que exigem um saber especializado, além do jurídico.",
            justificativa:
              "A prova pericial é utilizada quando a comprovação do facto depende de conhecimentos técnicos ou científicos que extrapolam o saber jurídico comum.",
          },
          {
            id: 6,
            pergunta:
              "O princípio da publicidade dos atos processuais tem como principal finalidade:",
            opcoes: [
              "Permitir o controlo social sobre a atuação do Poder Judiciário, salvo exceções legais de sigilo.",
              "Garantir o sigilo absoluto de todos os processos.",
              "Impedir o acesso da imprensa a qualquer julgamento.",
              "Beneficiar exclusivamente a acusação.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com a transparência da justiça perante a sociedade.",
            justificativa:
              "A publicidade processual permite o controlo social sobre a atuação judicial, existindo exceções legais de sigilo para proteger, por exemplo, a intimidade ou menores.",
          },
          {
            id: 7,
            pergunta:
              "A suspensão condicional do processo, quando prevista em lei, aplica-se, em regra, a:",
            opcoes: [
              "Todos os crimes, independentemente da gravidade.",
              "Somente crimes hediondos.",
              "Crimes de menor potencial ofensivo, mediante condições fixadas pelo juiz.",
              "Casos em que já houve condenação definitiva.",
            ],
            respostaCorreta: 2,
            dica: "É um benefício processual, tipicamente reservado a crimes de menor gravidade.",
            justificativa:
              "A suspensão condicional do processo é, em regra, um benefício aplicável a infrações de menor potencial ofensivo, condicionado ao cumprimento de determinadas exigências.",
          },
          {
            id: 8,
            pergunta:
              "O que se entende por 'nulidade absoluta' no processo penal?",
            opcoes: [
              "Um simples erro de digitação sem qualquer consequência processual.",
              "Vício que compromete garantias fundamentais e pode ser reconhecido a qualquer tempo, mesmo de ofício.",
              "Vício sanável apenas pela vontade das partes.",
              "Ausência total de qualquer defeito no processo.",
            ],
            respostaCorreta: 1,
            dica: "É o tipo de vício mais grave, ligado a garantias essenciais do processo.",
            justificativa:
              "A nulidade absoluta atinge garantias processuais fundamentais e pode ser reconhecida a qualquer momento, inclusive de ofício pelo juiz, por afetar o interesse público.",
          },
          {
            id: 9,
            pergunta:
              "O júri popular, onde existente, caracteriza-se, entre outros aspetos, por:",
            opcoes: [
              "Julgamento realizado exclusivamente por juízes togados.",
              "Ausência total de recurso contra a decisão.",
              "Aplicação apenas a crimes de natureza patrimonial.",
              "Participação de cidadãos leigos no julgamento de determinados crimes, geralmente dolosos contra a vida.",
            ],
            respostaCorreta: 3,
            dica: "Pense na participação popular na administração da justiça.",
            justificativa:
              "O júri popular caracteriza-se pela participação de cidadãos leigos, que decidem sobre a autoria e a culpa em determinados crimes, tipicamente os dolosos contra a vida.",
          },
          {
            id: 10,
            pergunta:
              "O princípio da economia processual busca, principalmente:",
            opcoes: [
              "Alcançar o maior resultado possível na aplicação do direito com o menor dispêndio de atividade processual.",
              "Eliminar a fase de instrução criminal.",
              "Reduzir o número de juízes nos tribunais.",
              "Impedir a produção de provas periciais custosas.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com eficiência processual, sem perder qualidade na aplicação da justiça.",
            justificativa:
              "A economia processual visa obter o máximo de resultado útil, na aplicação do direito, com o mínimo de atos e de dispêndio processual.",
          },
          {
            id: 11,
            pergunta:
              "A prisão temporária, quando prevista em lei, distingue-se da prisão preventiva por:",
            opcoes: [
              "Ser applied apenas após o trânsito em julgado.",
              "Não exigir qualquer decisão judicial.",
              "Ter caráter excecional e prazo determinado, voltada tipicamente à fase de investigação de certos crimes graves.",
              "Ser cabível em qualquer tipo de infração, sem restrição.",
            ],
            respostaCorreta: 2,
            dica: "Pense numa prisão de curta duração, ligada à fase investigativa.",
            justificativa:
              "A prisão temporária tem caráter excecional, prazo determinado e destina-se, em regra, a viabilizar investigações em crimes de maior gravidade.",
          },
          {
            id: 12,
            pergunta:
              "A colaboração premiada (ou delação premiada), como meio de obtenção de prova, caracteriza-se por:",
            opcoes: [
              "Ser aplicável apenas a testemunhas, nunca a coautores do crime.",
              "Um acordo entre o investigado/réu colaborador e a acusação, mediante benefícios processuais em troca de informações relevantes.",
              "Dispensar qualquer homologação judicial.",
              "Eliminar automaticamente a responsabilidade penal de todos os envolvidos.",
            ],
            respostaCorreta: 1,
            dica: "Envolve um acordo formal com benefícios em troca de informação útil à investigação.",
            justificativa:
              "A colaboração premiada é um acordo processual em que o investigado ou réu fornece informações relevantes à investigação ou ao processo, recebendo em contrapartida benefícios legais.",
          },
          {
            id: 13,
            pergunta:
              "O que caracteriza a chamada 'prova emprestada' no processo penal?",
            opcoes: [
              "Prova falsificada, deliberadamente introduzida no processo.",
              "Depoimento colhido exclusivamente por telefone.",
              "Prova cuja produção é sempre proibida por lei.",
              "Prova produzida em outro processo, trasladada para o processo em curso, respeitado o contraditório.",
            ],
            respostaCorreta: 3,
            dica: "É uma prova que 'vem de outro processo'.",
            justificativa:
              "A prova emprestada é aquela produzida originalmente noutro processo e trasladada para o processo em curso, sendo, em regra, exigido o respeito ao contraditório.",
          },
          {
            id: 14,
            pergunta:
              "A medida cautelar diversa da prisão (como monitoramento eletrónico ou comparecimento periódico em juízo) tem por objetivo:",
            opcoes: [
              "Assegurar finalidades processuais com menor restrição à liberdade do que a prisão.",
              "Substituir definitivamente qualquer julgamento futuro.",
              "Aumentar automaticamente a pena a ser applied.",
              "Ser aplicada apenas após condenação definitiva.",
            ],
            respostaCorreta: 0,
            dica: "É uma alternativa menos gravosa do que prender o investigado.",
            justificativa:
              "As medidas cautelares diversas da prisão visam assegurar as finalidades do processo (como a instrução ou a ordem pública) com menor restrição à liberdade individual.",
          },
          {
            id: 15,
            pergunta:
              "O sigilo do processo, quando decretado, justifica-se, tipicamente, para:",
            opcoes: [
              "Beneficiar exclusivamente o Ministério Público.",
              "Impedir qualquer defesa técnica do acusado.",
              "Proteger a intimidade das partes, a eficácia da investigação ou interesses de menores envolvidos.",
              "Tornar o processo permanentemente inacessível às partes.",
            ],
            respostaCorreta: 2,
            dica: "É uma exceção justificada, e não uma regra geral.",
            justificativa:
              "O sigilo processual, como exceção à publicidade, justifica-se em hipóteses específicas, como a proteção da intimidade, a eficácia investigativa ou o interesse de menores.",
          },
        ],
      },
      {
        id: "modelos-de-intervencao-em-criminologia",
        nome: "Modelos de Intervenção em Criminologia",
        questoes: [
          {
            id: 1,
            pergunta:
              "O modelo de intervenção conhecido como 'RNR' (Risco-Necessidade-Responsividade) orienta que os programas de reabilitação devem:",
            opcoes: [
              "Aplicar sempre a mesma intensidade de intervenção a todos os infratores.",
              "Ajustar a intensidade ao nível de risco, focar nas necessidades criminógenas e adaptar o método ao estilo de aprendizagem do sujeito.",
              "Ignorar completamente o risco de reincidência.",
              "Focar exclusivamente em fatores estáticos e imutáveis.",
            ],
            respostaCorreta: 1,
            dica: "As três palavras-chave do modelo indicam três critérios de ajuste da intervenção.",
            justificativa:
              "O modelo RNR estabelece que a intensidade da intervenção deve corresponder ao risco do sujeito, o conteúdo deve focar as necessidades criminógenas, e o método deve responder ao estilo de aprendizagem individual.",
          },
          {
            id: 2,
            pergunta:
              "O 'Modelo das Boas Vidas' (Good Lives Model), como alternativa ou complemento ao RNR, enfatiza:",
            opcoes: [
              "A punição severa como único meio de reabilitação.",
              "A exclusão social permanente do infrator.",
              "A ignorância das necessidades pessoais do sujeito.",
              "A construção de uma vida com significado através de meios socialmente aceitáveis, associada à redução do risco.",
            ],
            respostaCorreta: 3,
            dica: "Foca em objetivos de vida positivos, e não apenas na gestão de riscos.",
            justificativa:
              "O Modelo das Boas Vidas propõe ajudar o infrator a alcançar bens humanos fundamentais por vias socialmente aceitáveis, reduzindo assim a necessidade de recorrer ao crime.",
          },
          {
            id: 3,
            pergunta:
              "A prevenção situacional do crime baseia-se, principalmente, em:",
            opcoes: [
              "Reduzir as oportunidades para a prática do crime, alterando o ambiente físico e social.",
              "Tratar exclusivamente os fatores psicológicos do infrator.",
              "Aumentar a pena aplicada em abstrato.",
              "Ignorar o contexto onde o crime ocorre.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com o ambiente e as oportunidades, não com a personalidade do infrator.",
            justificativa:
              "A prevenção situacional foca-se na redução das oportunidades para o crime, através de alterações no ambiente físico, na vigilância e na gestão de espaços.",
          },
          {
            id: 4,
            pergunta:
              "As Terapias Cognitivo-Comportamentais (TCC), amplamente utilizadas em programas de intervenção criminológica, atuam sobre:",
            opcoes: [
              "Apenas os sintomas físicos do infrator.",
              "Exclusivamente a estrutura familiar do infrator.",
              "Padrões de pensamento distorcidos e comportamentos associados à conduta delitiva.",
              "Fatores genéticos imutáveis.",
            ],
            respostaCorreta: 2,
            dica: "O nome do modelo já indica onde atua: pensamento e comportamento.",
            justificativa:
              "As TCC trabalham a identificação e a reestruturação de padrões cognitivos distorcidos associados ao comportamento delitivo, promovendo mudanças comportamentais.",
          },
          {
            id: 5,
            pergunta:
              "A Justiça Restaurativa, como modelo alternativo de intervenção, prioriza:",
            opcoes: [
              "A exclusão total da vítima do processo.",
              "O aumento automático da pena de prisão.",
              "A eliminação de qualquer diálogo entre as partes envolvidas.",
              "A reparação do dano e a reconciliação entre vítima, ofensor e comunidade.",
            ],
            respostaCorreta: 3,
            dica: "O nome do modelo remete a 'restaurar' relações e danos.",
            justificativa:
              "A Justiça Restaurativa busca a reparação do dano causado e a reconciliação entre as partes, através do diálogo entre vítima, ofensor e comunidade.",
          },
          {
            id: 6,
            pergunta:
              "Os programas de mediação penal, no contexto restaurativo, caracterizam-se por:",
            opcoes: [
              "Impor decisões unilaterais sem qualquer diálogo.",
              "Promover encontro voluntário entre vítima e ofensor, mediado por um terceiro imparcial.",
              "Substituir automaticamente o processo penal em qualquer crime.",
              "Excluir por completo a participação do ofensor.",
            ],
            respostaCorreta: 1,
            dica: "A palavra-chave é 'mediação': um terceiro facilita o diálogo entre as partes.",
            justificativa:
              "A mediação penal promove o encontro voluntário e estruturado entre vítima e ofensor, com a facilitação de um mediador imparcial, visando à reparação e ao entendimento mútuo.",
          },
          {
            id: 7,
            pergunta:
              "O modelo de intervenção baseado em 'fatores de risco e proteção' pressupõe que:",
            opcoes: [
              "O comportamento delitivo depende exclusivamente de fatores biológicos.",
              "Não existem fatores capazes de proteger contra o crime.",
              "A probabilidade de conduta delitiva é influenciada pelo equilíbrio entre fatores que aumentam o risco e fatores que protegem o indivíduo.",
              "Apenas fatores económicos influenciam o comportamento delitivo.",
            ],
            respostaCorreta: 2,
            dica: "Pense numa balança entre elementos que aumentam e elementos que reduzem a probabilidade de delinquir.",
            justificativa:
              "O modelo de fatores de risco e proteção assume que a probabilidade de comportamento delitivo resulta da interação entre elementos que aumentam a vulnerabilidade e elementos que protegem o indivíduo.",
          },
          {
            id: 8,
            pergunta:
              "Os programas de prevenção primária, no âmbito da intervenção criminológica, dirigem-se, tipicamente, a:",
            opcoes: [
              "Toda a população, antes de qualquer manifestação de comportamento delitivo.",
              "Exclusivamente indivíduos já condenados.",
              "Apenas reincidentes de alta periculosidade.",
              "Somente vítimas de crimes violentos.",
            ],
            respostaCorreta: 0,
            dica: "É o nível de prevenção mais amplo e mais precoce.",
            justificativa:
              "A prevenção primária dirige-se à população em geral, antes de qualquer manifestação delitiva, através de medidas educativas, sociais e comunitárias.",
          },
          {
            id: 9,
            pergunta:
              "A abordagem de 'policiamento orientado para a resolução de problemas' (problem-oriented policing) caracteriza-se por:",
            opcoes: [
              "Reagir apenas a ocorrências pontuais, sem análise estrutural.",
              "Ignorar a colaboração com outras instituições.",
              "Focar exclusivamente na repressão penal, sem qualquer prevenção.",
              "Identificar padrões e causas subjacentes à criminalidade local, propondo soluções específicas e sustentáveis.",
            ],
            respostaCorreta: 3,
            dica: "O foco está em identificar e resolver as causas de um problema recorrente, não só reagir a incidentes isolados.",
            justificativa:
              "O policiamento orientado para a resolução de problemas busca analisar padrões e causas da criminalidade local, desenvolvendo respostas específicas e sustentáveis, em vez de meras reações pontuais.",
          },
          {
            id: 10,
            pergunta:
              "Os programas de reintegração social pós-prisional têm como um dos principais objetivos:",
            opcoes: [
              "Impedir que o ex-recluso tenha qualquer contacto com a sociedade.",
              "Facilitar o acesso a emprego, habitação e apoio psicossocial, reduzindo o risco de reincidência.",
              "Aumentar automaticamente o tempo de prisão.",
              "Excluir definitivamente o ex-recluso do mercado de trabalho.",
            ],
            respostaCorreta: 1,
            dica: "O foco é preparar a pessoa para uma vida fora do sistema prisional, reduzindo riscos futuros.",
            justificativa:
              "Os programas de reintegração social visam facilitar o acesso a condições básicas de vida digna, como emprego e habitação, e a apoio psicossocial, reduzindo o risco de reincidência.",
          },
          {
            id: 11,
            pergunta:
              "Os círculos de apoio e responsabilização (Circles of Support and Accountability), utilizados sobretudo com determinados grupos de infratores, funcionam através de:",
            opcoes: [
              "Isolamento absoluto do infrator, sem qualquer contacto social.",
              "Punição física direta pela comunidade.",
              "Voluntários da comunidade que acompanham e responsabilizam o infrator na sua reintegração, monitorizando riscos.",
              "Ausência de qualquer estrutura de apoio ou controlo.",
            ],
            respostaCorreta: 2,
            dica: "Envolvem voluntários da comunidade, com dupla função: apoiar e responsabilizar.",
            justificativa:
              "Os círculos de apoio e responsabilização reúnem voluntários da comunidade que acompanham o infrator na sua reintegração, oferecendo apoio e, simultaneamente, monitorizando fatores de risco.",
          },
          {
            id: 12,
            pergunta:
              "A intervenção multissistémica (baseada, por exemplo, na Terapia Multissistémica) caracteriza-se por:",
            opcoes: [
              "Atuar simultaneamente sobre diferentes contextos do sujeito, como família, escola, pares e comunidade.",
              "Intervir apenas sobre o indivíduo, isoladamente do seu contexto.",
              "Excluir totalmente a participação da família.",
              "Focar unicamente em fatores biológicos.",
            ],
            respostaCorreta: 0,
            dica: "O nome já indica: vários sistemas (contextos) são trabalhados ao mesmo tempo.",
            justificativa:
              "A intervenção multissistémica atua simultaneamente sobre múltiplos contextos que influenciam o comportamento do sujeito, como a família, a escola, o grupo de pares e a comunidade.",
          },
          {
            id: 13,
            pergunta:
              "A avaliação de eficácia de programas de intervenção criminológica ('o que funciona', ou what works) tornou-se relevante para:",
            opcoes: [
              "Justificar a manutenção de programas independentemente dos resultados obtidos.",
              "Eliminar toda e qualquer forma de avaliação científica.",
              "Substituir totalmente a necessidade de investigação criminológica.",
              "Identificar, com base em evidência empírica, quais intervenções efetivamente reduzem a reincidência.",
            ],
            respostaCorreta: 3,
            dica: "É um movimento baseado em evidências científicas sobre resultados reais.",
            justificativa:
              "O movimento 'what works' procura, com base em evidência empírica robusta, identificar quais programas efetivamente contribuem para a redução da reincidência.",
          },
          {
            id: 14,
            pergunta:
              "Os programas de intervenção precoce em contexto escolar, voltados à prevenção da delinquência juvenil, tendem a focar-se em:",
            opcoes: [
              "Punir severamente qualquer comportamento infantil considerado desviante.",
              "Excluir crianças com dificuldades comportamentais do sistema escolar.",
              "Desenvolver competências sociais, emocionais e académicas em crianças com fatores de risco identificados.",
              "Ignorar completamente o ambiente familiar da criança.",
            ],
            respostaCorreta: 2,
            dica: "O objetivo é desenvolver competências protetoras, não punir.",
            justificativa:
              "Os programas de intervenção precoce em contexto escolar visam desenvolver competências sociais, emocionais e académicas, fortalecendo fatores de proteção em crianças identificadas com fatores de risco.",
          },
          {
            id: 15,
            pergunta:
              "A abordagem de 'tolerância zero', enquanto modelo de intervenção policial, caracteriza-se por:",
            opcoes: [
              "Ausência total de policiamento em qualquer área.",
              "Repressão rigorosa mesmo de pequenas infrações, partindo do pressuposto de que desorganização gera criminalidade mais grave.",
              "Foco exclusivo em programas de reabilitação, sem qualquer repressão.",
              "Ignorar completamente pequenas infrações.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com a Teoria das Janelas Partidas: pequenos sinais de desordem geram criminalidade mais grave.",
            justificativa:
              "A abordagem de tolerância zero parte da premissa (associada à Teoria das Janelas Partidas) de que a repressão rigorosa de pequenas infrações previne a escalada para criminalidade mais grave.",
          },
        ],
      },
      {
        id: "psicopatologia-crianca-adolescente",
        nome: "Psicopatologia da Criança e do Adolescente",
        questoes: [
          {
            id: 1,
            pergunta:
              "O Transtorno de Oposição Desafiante (TOD), na infância, caracteriza-se principalmente por:",
            opcoes: [
              "Um padrão persistente de comportamento negativista, desafiador e hostil dirigido a figuras de autoridade.",
              "Ausência total de interação social.",
              "Comprometimento exclusivo da linguagem verbal.",
              "Défice intelectual grave e generalizado.",
            ],
            respostaCorreta: 0,
            dica: "Pense em desafio e oposição sistemática a regras e autoridades.",
            justificativa:
              "O TOD caracteriza-se por um padrão recorrente de comportamento negativista, desafiador, desobediente e hostil dirigido a figuras de autoridade.",
          },
          {
            id: 2,
            pergunta:
              "O Transtorno de Conduta, quando diagnosticado na adolescência, distingue-se do TOD por envolver, tipicamente:",
            opcoes: [
              "Apenas birras ocasionais sem consequências.",
              "Violação de direitos básicos de outras pessoas ou de normas sociais relevantes, como agressão ou destruição de propriedade.",
              "Exclusivamente dificuldades de concentração.",
              "Apenas atraso no desenvolvimento motor.",
            ],
            respostaCorreta: 1,
            dica: "É um quadro mais grave, que já envolve violação de direitos de terceiros.",
            justificativa:
              "O Transtorno de Conduta envolve um padrão repetitivo de comportamento que viola direitos básicos de terceiros ou normas sociais relevantes à idade, como agressão a pessoas ou animais e destruição de propriedade.",
          },
          {
            id: 3,
            pergunta:
              "A Perturbação de Hiperatividade e Défice de Atenção (PHDA/TDAH) caracteriza-se por um padrão persistente de:",
            opcoes: [
              "Isolamento social absoluto.",
              "Comportamento exclusivamente agressivo e violento.",
              "Desatenção e/ou hiperatividade-impulsividade que interfere no funcionamento e desenvolvimento.",
              "Perda total da capacidade de comunicação.",
            ],
            respostaCorreta: 2,
            dica: "O próprio nome do transtorno indica os dois eixos centrais do quadro.",
            justificativa:
              "A PHDA/TDAH caracteriza-se por um padrão persistente de desatenção e/ou hiperatividade-impulsividade, com impacto significativo no funcionamento escolar, social ou familiar.",
          },
          {
            id: 4,
            pergunta:
              "A relação entre negligência parental precoce e problemas de comportamento posteriores é, na literatura, considerada:",
            opcoes: [
              "Inexistente, sem qualquer evidência científica.",
              "A única causa possível de qualquer transtorno infantil.",
              "Relevante apenas em famílias de nível socioeconómico elevado.",
              "Um fator de risco relevante, embora não determinístico, para o desenvolvimento de problemas emocionais e comportamentais.",
            ],
            respostaCorreta: 3,
            dica: "Pense em 'fator de risco', não em causa única e inevitável.",
            justificativa:
              "A negligência parental precoce é reconhecida como um fator de risco relevante para o desenvolvimento de dificuldades emocionais e comportamentais, embora não seja determinística.",
          },
          {
            id: 5,
            pergunta:
              "O conceito de 'vinculação insegura' (attachment), desenvolvido a partir dos estudos de Bowlby, relaciona-se com:",
            opcoes: [
              "Padrões de relação precoce entre criança e cuidador que podem influenciar o desenvolvimento socioemocional posterior.",
              "Exclusivamente fatores genéticos, sem qualquer influência ambiental.",
              "A capacidade motora da criança.",
              "O desempenho académico isolado, sem relação com aspetos emocionais.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com a qualidade da relação afetiva entre criança e cuidador.",
            justificativa:
              "A teoria da vinculação de Bowlby explica como padrões precoces de relação entre a criança e o seu cuidador principal influenciam o desenvolvimento socioemocional futuro.",
          },
          {
            id: 6,
            pergunta:
              "Os traços de 'insensibilidade emocional' (callous-unemotional traits) na infância são, atualmente, associados a:",
            opcoes: [
              "Nenhuma relação com comportamento antissocial futuro.",
              "Um subgrupo de crianças com maior risco de desenvolver padrões antissociais mais persistentes e graves.",
              "Exclusivamente quadros de ansiedade generalizada.",
              "Melhor prognóstico de reabilitação em qualquer contexto.",
            ],
            respostaCorreta: 1,
            dica: "Estão ligados a um perfil de maior risco, com menor resposta empática.",
            justificativa:
              "Os traços de insensibilidade emocional identificam um subgrupo de crianças e jovens associado a trajetórias antissociais mais persistentes e graves ao longo do desenvolvimento.",
          },
          {
            id: 7,
            pergunta:
              "A distinção entre delinquência 'limitada à adolescência' e delinquência 'persistente ao longo da vida' (Moffitt) baseia-se, principalmente, em:",
            opcoes: [
              "O género do indivíduo, exclusivamente.",
              "A cor dos olhos do sujeito.",
              "A idade de início e a continuidade ou não do comportamento antissocial ao longo do curso de vida.",
              "O tipo de escola frequentada.",
            ],
            respostaCorreta: 2,
            dica: "Pense em quando começa o comportamento e se ele persiste depois da adolescência.",
            justificativa:
              "A tipologia de Moffitt distingue trajetórias com base no momento de início e na persistência (ou não) do comportamento antissocial ao longo do curso de vida.",
          },
          {
            id: 8,
            pergunta:
              "Os sintomas de perturbação de stress pós-traumático (PSPT) em crianças vítimas de abuso podem manifestar-se, entre outras formas, por:",
            opcoes: [
              "Total ausência de qualquer alteração comportamental ou emocional.",
              "Melhoria imediata e automática do desempenho escolar.",
              "Exclusivamente sintomas físicos sem qualquer componente emocional.",
              "Revivência do trauma, evitamento de estímulos associados e alterações na regulação emocional.",
            ],
            respostaCorreta: 3,
            dica: "Pense nos três grandes grupos de sintomas típicos do PSPT.",
            justificativa:
              "O PSPT em crianças pode manifestar-se através de revivência do trauma (flashbacks, pesadelos), evitamento de estímulos associados e alterações significativas na regulação emocional e comportamental.",
          },
          {
            id: 9,
            pergunta:
              "A avaliação psicopatológica de crianças e adolescentes em contexto forense deve, prioritariamente:",
            opcoes: [
              "Considerar o estádio de desenvolvimento e utilizar instrumentos validados e adequados à faixa etária.",
              "Aplicar sempre os mesmos instrumentos utilizados na avaliação de adultos.",
              "Ignorar o contexto familiar e social do menor.",
              "Basear-se exclusivamente na opinião informal de terceiros.",
            ],
            respostaCorreta: 0,
            dica: "A criança não é um 'adulto pequeno': a avaliação deve respeitar o seu momento de desenvolvimento.",
            justificativa:
              "A avaliação psicopatológica infanto-juvenil em contexto forense deve considerar o estádio de desenvolvimento e recorrer a instrumentos validados especificamente para essa faixa etária.",
          },
          {
            id: 10,
            pergunta:
              "O 'bullying', enquanto fenómeno relevante na psicopatologia infanto-juvenil, caracteriza-se por:",
            opcoes: [
              "Um conflito pontual e isolado entre pares, sem repetição.",
              "Um comportamento agressivo intencional, repetido ao longo do tempo, envolvendo desequilíbrio de poder entre agressor e vítima.",
              "Uma interação exclusivamente positiva entre colegas.",
              "Um fenómeno restrito ao ambiente digital.",
            ],
            respostaCorreta: 1,
            dica: "Três elementos-chave: intenção, repetição e desequilíbrio de poder.",
            justificativa:
              "O bullying define-se pela intencionalidade, pela repetição ao longo do tempo e pelo desequilíbrio de poder entre agressor e vítima, distinguindo-se de conflitos pontuais entre pares.",
          },
          {
            id: 11,
            pergunta:
              "As perturbações do neurodesenvolvimento, como a Perturbação do Espetro do Autismo, no contexto forense, exigem:",
            opcoes: [
              "Tratamento processual idêntico ao de qualquer outro caso, sem qualquer adaptação.",
              "Exclusão automática de qualquer intervenção terapêutica.",
              "Avaliação especializada, considerando o impacto das características do quadro no comportamento e na compreensão de normas sociais.",
              "Presunção automática de incapacidade total para qualquer ato da vida civil.",
            ],
            respostaCorreta: 2,
            dica: "Exige avaliação individualizada, e não presunções automáticas.",
            justificativa:
              "As perturbações do neurodesenvolvimento exigem avaliação forense especializada, considerando de que modo as características específicas do quadro podem influenciar a compreensão de normas e o comportamento.",
          },
          {
            id: 12,
            pergunta:
              "A exposição precoce e continuada a violência doméstica é considerada, na literatura, um fator associado a:",
            opcoes: [
              "Nenhum impacto relevante no desenvolvimento infantil.",
              "Melhoria automática das competências sociais da criança.",
              "Imunidade a qualquer forma de sofrimento psicológico futuro.",
              "Maior risco de dificuldades emocionais, comportamentais e, em alguns casos, de reprodução de padrões de violência.",
            ],
            respostaCorreta: 3,
            dica: "Pense em risco aumentado, não em imunidade ou benefício.",
            justificativa:
              "A exposição precoce e continuada à violência doméstica está associada a maior risco de dificuldades emocionais e comportamentais, podendo, nalguns casos, contribuir para a reprodução de padrões de violência.",
          },
          {
            id: 13,
            pergunta:
              "A depressão infantil, ao contrário de um estereótipo comum, pode manifestar-se através de:",
            opcoes: [
              "Irritabilidade, queixas somáticas ou isolamento, além de tristeza, exigindo atenção clínica cuidadosa.",
              "Apenas tristeza evidente e choro constante, sem qualquer outra manifestação.",
              "Melhoria súbita e generalizada do desempenho escolar.",
              "Ausência total de qualquer sintoma observável.",
            ],
            respostaCorreta: 0,
            dica: "Em crianças, a depressão nem sempre 'parece' tristeza clássica.",
            justificativa:
              "A depressão infantil pode manifestar-se de forma atípica, através de irritabilidade, queixas somáticas ou isolamento social, exigindo avaliação clínica cuidadosa para além da simples observação de tristeza.",
          },
          {
            id: 14,
            pergunta:
              "A intervenção precoce em crianças com sinais de risco comportamental tem como principal objetivo:",
            opcoes: [
              "Adiar qualquer forma de apoio até à idade adulta.",
              "Reduzir a probabilidade de consolidação de trajetórias antissociais mais graves ao longo do desenvolvimento.",
              "Rotular definitivamente a criança como delinquente.",
              "Substituir por completo o papel da família.",
            ],
            respostaCorreta: 1,
            dica: "Intervir cedo procura evitar que o problema se agrave ao longo do tempo.",
            justificativa:
              "A intervenção precoce visa reduzir a probabilidade de consolidação de trajetórias antissociais mais graves, atuando sobre fatores de risco identificados numa fase inicial do desenvolvimento.",
          },
          {
            id: 15,
            pergunta:
              "A avaliação da capacidade de um menor para participar num processo judicial (fitness/competência) deve considerar, entre outros fatores:",
            opcoes: [
              "Exclusivamente a idade cronológica, sem qualquer outro critério.",
              "Unicamente o tipo de crime imputado.",
              "A compreensão do processo, a capacidade de comunicar com a defesa e o desenvolvimento cognitivo e emocional do menor.",
              "A opinião isolada da vítima, sem qualquer avaliação técnica do menor.",
            ],
            respostaCorreta: 2,
            dica: "Vai além da idade: envolve compreensão do processo e capacidades cognitivo-emocionais.",
            justificativa:
              "A avaliação da competência de um menor para participar no processo deve considerar a sua compreensão do processo, a capacidade de comunicação com a defesa e o seu desenvolvimento cognitivo e emocional.",
          },
        ],
      },
      {
        id: "questoes-de-seguranca-1",
        nome: "Questões de Segurança 1",
        questoes: [
          {
            id: 1,
            pergunta:
              "O conceito de 'segurança pública', numa perspetiva ampla, refere-se a:",
            opcoes: [
              "Um conjunto de políticas e ações, envolvendo múltiplos atores, destinadas a garantir a proteção de pessoas e bens e a preservação da ordem.",
              "Apenas à atuação das forças policiais.",
              "Exclusivamente à segurança privada contratada por particulares.",
              "Apenas ao controlo de fronteiras internacionais.",
            ],
            respostaCorreta: 0,
            dica: "É um conceito amplo, que ultrapassa a atuação isolada da polícia.",
            justificativa:
              "A segurança pública, em sentido amplo, envolve um conjunto articulado de políticas e ações de diferentes atores institucionais e sociais, visando à proteção de pessoas, bens e à preservação da ordem.",
          },
          {
            id: 2,
            pergunta:
              "A distinção entre 'segurança objetiva' e 'sentimento de (in)segurança' relaciona-se com:",
            opcoes: [
              "Não existir qualquer diferença entre os dois conceitos.",
              "A diferença entre os índices reais de criminalidade e a perceção subjetiva de risco pela população.",
              "A segurança objetiva ser apenas uma sensação, sem base em dados.",
              "O sentimento de insegurança ser sempre proporcional aos índices reais de crime.",
            ],
            respostaCorreta: 1,
            dica: "Um conceito é medido por estatísticas; o outro é uma perceção, nem sempre coincidente com os números.",
            justificativa:
              "A segurança objetiva relaciona-se com dados e índices reais de criminalidade, enquanto o sentimento de insegurança é uma perceção subjetiva que pode não corresponder diretamente a esses dados.",
          },
          {
            id: 3,
            pergunta:
              "As políticas de 'policiamento de proximidade' caracterizam-se por:",
            opcoes: [
              "Isolamento total entre polícia e comunidade.",
              "Foco exclusivo em operações militarizadas de grande escala.",
              "Aproximação entre polícia e comunidade, valorizando a prevenção, o diálogo e a parceria local.",
              "Ausência de qualquer trabalho preventivo.",
            ],
            respostaCorreta: 2,
            dica: "O nome já indica: aproximar a polícia da comunidade.",
            justificativa:
              "O policiamento de proximidade caracteriza-se pela aproximação entre a polícia e a comunidade local, valorizando o diálogo, a prevenção e a construção de parcerias para a resolução de problemas.",
          },
          {
            id: 4,
            pergunta:
              "A videovigilância em espaços públicos, como medida de segurança, é frequentemente discutida em razão de:",
            opcoes: [
              "Não gerar qualquer tipo de controvérsia ou debate.",
              "Ser universalmente proibida em todos os ordenamentos jurídicos.",
              "Substituir totalmente a necessidade de policiamento humano.",
              "Um equilíbrio necessário entre a eficácia preventiva e o respeito pela privacidade e proteção de dados pessoais.",
            ],
            respostaCorreta: 3,
            dica: "Existe uma tensão entre dois valores: segurança e privacidade.",
            justificativa:
              "A videovigilância em espaços públicos exige um equilíbrio entre a sua eficácia preventiva e o respeito pelos direitos de privacidade e de proteção de dados pessoais dos cidadãos.",
          },
          {
            id: 5,
            pergunta:
              "O conceito de 'desenho ambiental para a prevenção do crime' (CPTED) parte do pressuposto de que:",
            opcoes: [
              "Alterações no desenho e na gestão do espaço físico podem reduzir oportunidades para a prática de crimes.",
              "O ambiente físico não tem qualquer influência sobre a criminalidade.",
              "Apenas o aumento do número de polícias reduz a criminalidade.",
              "O crime depende exclusivamente de fatores genéticos.",
            ],
            respostaCorreta: 0,
            dica: "Pense na relação entre urbanismo, desenho de espaços e oportunidades para o crime.",
            justificativa:
              "O CPTED (Crime Prevention Through Environmental Design) baseia-se na ideia de que o desenho e a gestão adequados do espaço físico podem reduzir as oportunidades para a prática de crimes.",
          },
          {
            id: 6,
            pergunta:
              "A cooperação entre polícia, autarquias e sociedade civil, em modelos integrados de segurança, é relevante porque:",
            opcoes: [
              "A polícia deve atuar sempre isoladamente, sem qualquer parceria.",
              "A criminalidade é um fenómeno multicausal, exigindo respostas articuladas entre diferentes atores.",
              "As autarquias não têm qualquer papel na segurança local.",
              "A sociedade civil não deve ser envolvida em questões de segurança.",
            ],
            respostaCorreta: 1,
            dica: "O crime tem múltiplas causas, por isso exige respostas de múltiplos atores.",
            justificativa:
              "Dado o carácter multicausal da criminalidade, os modelos integrados de segurança valorizam a cooperação entre polícia, autarquias e sociedade civil na construção de respostas articuladas.",
          },
          {
            id: 7,
            pergunta:
              "As estatísticas oficiais de criminalidade, enquanto instrumento de análise da segurança pública, apresentam como principal limitação:",
            opcoes: [
              "Serem sempre absolutamente precisas e completas.",
              "Não terem qualquer utilidade para o planeamento de políticas públicas.",
              "Não refletirem a totalidade da criminalidade real, devido à existência da 'cifra negra'.",
              "Serem produzidas exclusivamente por organizações privadas.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com os crimes que nunca chegam ao conhecimento oficial.",
            justificativa:
              "As estatísticas oficiais, embora relevantes, apresentam como limitação o facto de não refletirem a totalidade da criminalidade real, existindo sempre uma parcela não registada, conhecida como cifra negra.",
          },
          {
            id: 8,
            pergunta:
              "A auditoria de segurança local (diagnóstico local de segurança) tem como principal finalidade:",
            opcoes: [
              "Substituir por completo a atuação policial.",
              "Aumentar automaticamente o efetivo policial, sem qualquer análise prévia.",
              "Ignorar as particularidades de cada território.",
              "Identificar problemas específicos de segurança de um território, subsidiando políticas públicas locais direcionadas.",
            ],
            respostaCorreta: 3,
            dica: "É um diagnóstico que orienta políticas públicas ajustadas a um território específico.",
            justificativa:
              "A auditoria de segurança local visa identificar, de forma sistemática, os problemas específicos de um território, permitindo a formulação de políticas públicas de segurança ajustadas à realidade local.",
          },
          {
            id: 9,
            pergunta:
              "A criminalidade urbana e a criminalidade rural, do ponto de vista das políticas de segurança, tendem a exigir:",
            opcoes: [
              "Abordagens diferenciadas, considerando as especificidades demográficas, sociais e geográficas de cada contexto.",
              "Exatamente as mesmas estratégias, sem qualquer adaptação.",
              "Nenhuma estratégia de prevenção em qualquer dos casos.",
              "Apenas medidas de repressão penal, sem prevenção.",
            ],
            respostaCorreta: 0,
            dica: "Contextos diferentes exigem estratégias ajustadas às suas especificidades.",
            justificativa:
              "As diferenças demográficas, sociais e geográficas entre contextos urbanos e rurais exigem abordagens diferenciadas nas políticas de segurança pública.",
          },
          {
            id: 10,
            pergunta:
              "O 'medo do crime' (fear of crime), enquanto objeto de estudo, é relevante para as políticas de segurança porque:",
            opcoes: [
              "Não influencia de forma alguma o comportamento e a qualidade de vida da população.",
              "Pode afetar comportamentos, restringir a liberdade de circulação e reduzir a qualidade de vida, independentemente do risco real.",
              "É sempre idêntico ao risco real de vitimização.",
              "Deve ser completamente ignorado nas políticas públicas.",
            ],
            respostaCorreta: 1,
            dica: "O medo tem efeitos concretos na vida das pessoas, mesmo quando não corresponde ao risco real.",
            justificativa:
              "O medo do crime pode influenciar significativamente comportamentos, restringir a liberdade de circulação e reduzir a qualidade de vida, ainda que não corresponda diretamente ao risco real de vitimização.",
          },
          {
            id: 11,
            pergunta:
              "A gestão de multidões em grandes eventos, como componente da segurança pública, exige, entre outros aspetos:",
            opcoes: [
              "Ausência total de planeamento prévio.",
              "Exclusão de qualquer coordenação entre entidades públicas e privadas.",
              "Planeamento cuidadoso de fluxos, sinalização, comunicação e articulação entre entidades de segurança e organizadores.",
              "Improvisação exclusiva no momento do evento.",
            ],
            respostaCorreta: 2,
            dica: "Envolve planeamento prévio detalhado, não improviso.",
            justificativa:
              "A gestão de multidões exige planeamento cuidadoso de fluxos de circulação, sinalização, comunicação e articulação entre as diferentes entidades de segurança e os organizadores do evento.",
          },
          {
            id: 12,
            pergunta:
              "A relação entre desigualdade social e criminalidade, discutida amplamente na literatura, sugere que:",
            opcoes: [
              "A pobreza é, isoladamente, causa direta e automática do crime.",
              "Não existe qualquer relação estatisticamente relevante entre os dois fenómenos.",
              "A criminalidade ocorre exclusivamente em contextos economicamente desfavorecidos.",
              "A desigualdade e a privação relativa podem constituir fatores de risco associados a determinados tipos de criminalidade, num quadro multicausal.",
            ],
            respostaCorreta: 3,
            dica: "Pense em fator de risco associado, dentro de um quadro de múltiplas causas — não em causa única.",
            justificativa:
              "A literatura criminológica associa a desigualdade e a privação relativa a fatores de risco relevantes para determinados tipos de criminalidade, sempre no contexto de uma explicação multicausal.",
          },
          {
            id: 13,
            pergunta:
              "A tecnologia de reconhecimento facial, applied à segurança pública, levanta principalmente debates relacionados com:",
            opcoes: [
              "Privacidade, proteção de dados e risco de erros ou vieses discriminatórios.",
              "Nenhuma questão ética ou jurídica relevante.",
              "Ser uma tecnologia totalmente infalível e isenta de erros.",
              "Ausência de qualquer impacto sobre direitos fundamentais.",
            ],
            respostaCorreta: 0,
            dica: "Pense nos riscos associados a esta tecnologia, além da sua utilidade prática.",
            justificativa:
              "A utilização do reconhecimento facial em segurança pública suscita debates relevantes sobre privacidade, proteção de dados pessoais e o risco de erros ou vieses discriminatórios do sistema.",
          },
          {
            id: 14,
            pergunta:
              "As parcerias público-privadas em segurança, como a contratação de empresas de segurança privada, caracterizam-se por:",
            opcoes: [
              "Substituírem totalmente as competências exclusivas do Estado em matéria de uso legítimo da força.",
              "Complementarem, em determinadas áreas, a atuação da segurança pública estatal, dentro de limites legais definidos.",
              "Não terem qualquer regulamentação legal em nenhum ordenamento.",
              "Serem juridicamente equiparadas, em todos os aspetos, às forças policiais estatais.",
            ],
            respostaCorreta: 1,
            dica: "A segurança privada complementa, mas não substitui, funções exclusivas do Estado.",
            justificativa:
              "A segurança privada, sujeita a regulamentação legal, tende a complementar a atuação da segurança pública estatal em áreas específicas, sem substituir competências exclusivas do Estado, como o uso legítimo da força.",
          },
          {
            id: 15,
            pergunta:
              "Um plano municipal de segurança, enquanto instrumento de política pública, deve idealmente basear-se em:",
            opcoes: [
              "Decisões arbitrárias, sem qualquer diagnóstico prévio.",
              "Cópia integral e acrítica de planos de outras localidades, sem adaptação.",
              "Diagnóstico da realidade local, definição de objetivos, indicadores de monitorização e avaliação periódica de resultados.",
              "Ausência de qualquer envolvimento da comunidade.",
            ],
            respostaCorreta: 2,
            dica: "Um bom plano segue um ciclo: diagnosticar, planear, monitorizar e avaliar.",
            justificativa:
              "Um plano municipal de segurança eficaz deve fundamentar-se num diagnóstico da realidade local, na definição clara de objetivos e indicadores, e numa avaliação periódica dos resultados alcançados.",
          },
        ],
      },
      {
        id: "vitimologia-1",
        nome: "Vitimologia 1",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Vitimologia, enquanto área de estudo, dedica-se principalmente a:",
            opcoes: [
              "Estudar a vítima, o processo de vitimização e as suas consequências.",
              "Estudar exclusivamente a personalidade do agressor.",
              "Analisar apenas aspetos processuais penais, sem relação com a vítima.",
              "Ignorar completamente o impacto do crime sobre a vítima.",
            ],
            respostaCorreta: 0,
            dica: "O nome do campo de estudo já indica o seu principal objeto.",
            justificativa:
              "A Vitimologia é o ramo do saber criminológico dedicado ao estudo da vítima, do processo de vitimização e das suas consequências físicas, psicológicas e sociais.",
          },
          {
            id: 2,
            pergunta: "O conceito de 'vitimização secundária' refere-se a:",
            opcoes: [
              "Um segundo crime cometido pelo mesmo agressor contra a mesma vítima.",
              "O sofrimento adicional causado à vítima pela forma como é tratada pelo sistema de justiça e pelas instituições após o crime.",
              "A vitimização de familiares da vítima direta, exclusivamente.",
              "O dano físico imediato causado pelo crime.",
            ],
            respostaCorreta: 1,
            dica: "Pense no sofrimento causado depois do crime, pela forma como a vítima é tratada institucionalmente.",
            justificativa:
              "A vitimização secundária refere-se ao sofrimento adicional que a vítima experimenta em virtude da resposta inadequada das instituições e do sistema de justiça após a ocorrência do crime.",
          },
          {
            id: 3,
            pergunta: "A vitimização primária, por sua vez, corresponde a:",
            opcoes: [
              "O sofrimento causado pelo tratamento institucional posterior ao crime.",
              "A vitimização sofrida exclusivamente por vítimas indiretas.",
              "O dano direto resultante do próprio ato criminoso sofrido pela vítima.",
              "Um conceito sem qualquer relação com o crime praticado.",
            ],
            respostaCorreta: 2,
            dica: "É o dano imediato causado diretamente pelo crime.",
            justificativa:
              "A vitimização primária corresponde ao dano direto e imediato decorrente do ato criminoso sofrido pela vítima, seja de natureza física, psicológica, material ou social.",
          },
          {
            id: 4,
            pergunta:
              "A distinção entre 'vítima direta' e 'vítima indireta' baseia-se, principalmente, em:",
            opcoes: [
              "Não existir qualquer diferença relevante entre os dois conceitos.",
              "A vítima indireta ser sempre o próprio agressor.",
              "A vítima direta ser exclusivamente uma pessoa jurídica.",
              "A vítima direta é quem sofre diretamente o crime; a vítima indireta é quem sofre consequências em razão da sua relação com a vítima direta.",
            ],
            respostaCorreta: 3,
            dica: "Pense em quem sofre o crime diretamente e em quem sofre por tabela, devido à relação com a vítima.",
            justificativa:
              "A vítima direta é aquela que sofre diretamente os efeitos do crime, enquanto a vítima indireta sofre consequências decorrentes da sua relação (familiar, afetiva ou social) com a vítima direta.",
          },
          {
            id: 5,
            pergunta:
              "As tipologias vitimológicas clássicas (como as propostas por Mendelsohn ou von Hentig) procuraram, entre outros aspetos:",
            opcoes: [
              "Classificar as vítimas segundo o seu grau de contribuição ou proximidade com a situação de vitimização.",
              "Excluir completamente qualquer análise sobre a vítima.",
              "Atribuir sempre culpa exclusiva à vítima pelo crime sofrido.",
              "Ignorar totalmente a relação entre vítima e agressor.",
            ],
            respostaCorreta: 0,
            dica: "Estas tipologias analisam diferentes graus de proximidade ou contribuição da vítima na dinâmica do crime, sem necessariamente atribuir-lhe culpa.",
            justificativa:
              "As tipologias vitimológicas clássicas procuraram classificar as vítimas segundo o grau de proximidade, contribuição ou relação com a situação de vitimização, sem que isso implique atribuição automática de culpa.",
          },
          {
            id: 6,
            pergunta:
              "O 'estatuto da vítima', enquanto conjunto de direitos processuais, tipicamente prevê:",
            opcoes: [
              "A exclusão total da vítima de qualquer fase do processo penal.",
              "Direitos de informação, proteção, apoio e participação da vítima ao longo do processo penal.",
              "Que a vítima assuma o papel de julgadora no processo.",
              "A supressão de qualquer direito da vítima em nome da celeridade processual.",
            ],
            respostaCorreta: 1,
            dica: "Envolve direitos concretos garantidos à vítima ao longo do processo.",
            justificativa:
              "O estatuto da vítima tipicamente assegura direitos de informação, proteção, apoio psicossocial e participação da vítima nas diferentes fases do processo penal.",
          },
          {
            id: 7,
            pergunta:
              "A 'revitimização' (ou revitimização institucional) pode ocorrer, por exemplo, quando:",
            opcoes: [
              "A vítima recebe apoio psicológico adequado e coordenado.",
              "As instituições evitam qualquer contacto desnecessário com a vítima.",
              "A vítima é obrigada a relatar repetidamente o crime a diferentes instituições, sem qualquer cuidado ou coordenação.",
              "O processo é conduzido com total respeito pela dignidade da vítima.",
            ],
            respostaCorreta: 2,
            dica: "Pense em repetição desnecessária de relatos, sem qualquer cuidado institucional.",
            justificativa:
              "A revitimização institucional pode ocorrer quando a vítima é submetida repetidamente a relatar o crime a diferentes instâncias, sem coordenação nem cuidado, agravando o seu sofrimento.",
          },
          {
            id: 8,
            pergunta:
              "Os serviços de apoio à vítima têm como principal função:",
            opcoes: [
              "Substituir integralmente o papel do sistema de justiça penal.",
              "Determinar a culpabilidade do agressor.",
              "Aplicar diretamente sanções penais ao agressor.",
              "Prestar apoio psicológico, social, jurídico e informativo à vítima ao longo do processo de recuperação.",
            ],
            respostaCorreta: 3,
            dica: "O foco está no apoio à vítima, não em funções judiciais.",
            justificativa:
              "Os serviços de apoio à vítima têm como função central prestar apoio psicológico, social, jurídico e informativo, acompanhando a vítima ao longo do seu processo de recuperação.",
          },
          {
            id: 9,
            pergunta:
              "O 'ciclo de violência', frequentemente utilizado para explicar dinâmicas de violência doméstica, é composto tipicamente por fases como:",
            opcoes: [
              "Acumulação de tensão, explosão/agressão e lua de mel/reconciliação, que tende a repetir-se ciclicamente.",
              "Um único episódio isolado, sem qualquer padrão de repetição.",
              "Fases exclusivamente positivas, sem qualquer momento de conflito.",
              "Um modelo aplicável apenas a crimes patrimoniais.",
            ],
            respostaCorreta: 0,
            dica: "Envolve três fases que se repetem: tensão, explosão e reconciliação.",
            justificativa:
              "O ciclo de violência descreve um padrão frequentemente identificado em relações abusivas, composto por fases de acumulação de tensão, explosão/agressão e reconciliação, que tende a repetir-se.",
          },
          {
            id: 10,
            pergunta:
              "A avaliação de risco em vítimas de violência doméstica visa, principalmente:",
            opcoes: [
              "Determinar a pena a aplicar ao agressor.",
              "Identificar fatores associados a um risco elevado de nova agressão ou de escalada da violência, orientando medidas de proteção.",
              "Substituir totalmente o papel do sistema judicial.",
              "Avaliar exclusivamente a personalidade da vítima, sem relação com o risco de nova violência.",
            ],
            respostaCorreta: 1,
            dica: "O objetivo é antecipar riscos futuros e orientar medidas protetoras.",
            justificativa:
              "A avaliação de risco em contexto de violência doméstica visa identificar fatores associados a um risco elevado de reincidência ou de escalada da violência, subsidiando a definição de medidas de proteção adequadas.",
          },
          {
            id: 11,
            pergunta:
              "O conceito de 'vulnerabilidade vitimal' relaciona-se com:",
            opcoes: [
              "A culpa exclusiva da vítima pela ocorrência do crime.",
              "A ausência total de qualquer risco de vitimização.",
              "Fatores individuais, sociais ou situacionais que aumentam a probabilidade de determinada pessoa ser vitimizada.",
              "Um conceito aplicável apenas a crimes económicos.",
            ],
            respostaCorreta: 2,
            dica: "Pense em fatores que aumentam a exposição ao risco, sem implicar culpa da vítima.",
            justificativa:
              "A vulnerabilidade vitimal refere-se a fatores individuais, sociais ou situacionais que aumentam a probabilidade de vitimização, sem que isso implique qualquer atribuição de culpa à vítima.",
          },
          {
            id: 12,
            pergunta:
              "A indemnização à vítima, no contexto da Justiça Restaurativa e de programas específicos de reparação, tem como objetivo principal:",
            opcoes: [
              "Substituir toda e qualquer forma de sanção penal ao agressor.",
              "Punir exclusivamente o agressor, sem qualquer benefício à vítima.",
              "Ser aplicada apenas em crimes de natureza patrimonial.",
              "Reparar, na medida do possível, os danos materiais e morais sofridos pela vítima.",
            ],
            respostaCorreta: 3,
            dica: "O foco está na reparação do dano sofrido pela vítima.",
            justificativa:
              "A indemnização à vítima, no âmbito de programas de reparação, tem como objetivo principal compensar, na medida do possível, os danos materiais e morais decorrentes do crime sofrido.",
          },
          {
            id: 13,
            pergunta:
              "O direito da vítima a ser informada sobre o andamento do processo penal relaciona-se, principalmente, com:",
            opcoes: [
              "A garantia de transparência e de participação ativa da vítima ao longo do processo.",
              "A obrigação da vítima de investigar o crime por conta própria.",
              "A exclusão total da vítima de qualquer informação processual.",
              "Uma prerrogativa exclusiva do agressor.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com transparência processual e participação da vítima.",
            justificativa:
              "O direito à informação processual garante à vítima transparência sobre o andamento do processo e viabiliza a sua participação ativa nas fases em que a lei o permite.",
          },
          {
            id: 14,
            pergunta:
              "A vitimologia crítica, em diálogo com a criminologia crítica, questiona, entre outros aspetos:",
            opcoes: [
              "A existência de qualquer sofrimento causado às vítimas.",
              "A construção social do conceito de 'vítima ideal' e as desigualdades no reconhecimento e tratamento de diferentes vítimas.",
              "A necessidade de qualquer apoio institucional às vítimas.",
              "A relevância do estudo da vitimização enquanto fenómeno social.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com quem é socialmente reconhecido (ou não) como 'vítima legítima'.",
            justificativa:
              "A vitimologia crítica questiona a construção social do conceito de 'vítima ideal' e evidencia as desigualdades existentes no reconhecimento e no tratamento de diferentes grupos de vítimas.",
          },
          {
            id: 15,
            pergunta:
              "A escuta e o atendimento inicial à vítima, logo após a ocorrência do crime, devem, idealmente:",
            opcoes: [
              "Ser realizados sem qualquer preparação técnica dos profissionais envolvidos.",
              "Priorizar exclusivamente a rapidez, independentemente do impacto emocional na vítima.",
              "Ser conduzidos com sensibilidade, evitando julgamentos e a exposição desnecessária a novos relatos traumáticos.",
              "Ignorar completamente o estado emocional da vítima.",
            ],
            respostaCorreta: 2,
            dica: "Deve equilibrar as necessidades processuais com o cuidado emocional da vítima.",
            justificativa:
              "O atendimento inicial à vítima deve ser conduzido com sensibilidade e formação técnica adequada, evitando julgamentos e minimizando a exposição desnecessária a relatos repetidos e potencialmente traumáticos.",
          },
        ],
      },
      {
        id: "vitimologia-2",
        nome: "Vitimologia 2",
        questoes: [
          {
            id: 1,
            pergunta:
              "Os inquéritos de vitimização, enquanto instrumento metodológico, têm como principal vantagem:",
            opcoes: [
              "Captar dados sobre criminalidade não reportada às autoridades, complementando as estatísticas oficiais.",
              "Substituir totalmente a necessidade de estatísticas oficiais.",
              "Serem completamente isentos de qualquer limitação metodológica.",
              "Focar exclusivamente em crimes já julgados definitivamente.",
            ],
            respostaCorreta: 0,
            dica: "Permitem captar aquilo que não chega ao conhecimento oficial: a cifra negra.",
            justificativa:
              "Os inquéritos de vitimização permitem captar dados sobre criminalidade não reportada às autoridades, complementando e enriquecendo a análise obtida através das estatísticas oficiais.",
          },
          {
            id: 2,
            pergunta:
              "A vitimização de crianças e adolescentes, em contexto de abuso intrafamiliar, apresenta como especial desafio:",
            opcoes: [
              "A elevada facilidade de deteção e denúncia em todos os casos.",
              "A relação de dependência e confiança com o agressor, que pode dificultar a revelação e a denúncia.",
              "A inexistência de qualquer impacto psicológico na criança.",
              "A ausência total de instrumentos de avaliação especializados.",
            ],
            respostaCorreta: 1,
            dica: "Pense na dificuldade que a criança pode ter em denunciar alguém de quem depende afetivamente.",
            justificativa:
              "A relação de dependência afetiva e de confiança entre a criança e o agressor, frequentemente um familiar, constitui um desafio particular à revelação e à denúncia do abuso.",
          },
          {
            id: 3,
            pergunta:
              "A entrevista forense com crianças vítimas de abuso deve, idealmente, seguir protocolos que:",
            opcoes: [
              "Utilizem exclusivamente perguntas fechadas e sugestivas.",
              "Sejam conduzidas sem qualquer formação especializada do entrevistador.",
              "Minimizem a sugestionabilidade e reduzam o número de entrevistas repetidas e potencialmente traumáticas.",
              "Não considerem o estádio de desenvolvimento da criança.",
            ],
            respostaCorreta: 2,
            dica: "Deve reduzir riscos de contaminação do relato e evitar múltiplas repetições.",
            justificativa:
              "Os protocolos de entrevista forense com crianças visam minimizar a sugestionabilidade, reduzir o número de entrevistas repetidas e proteger a criança de exposição desnecessária a revitimização.",
          },
          {
            id: 4,
            pergunta:
              "A vitimização de idosos, enquanto grupo específico, é frequentemente associada a fatores de vulnerabilidade como:",
            opcoes: [
              "Ausência total de qualquer fator de vulnerabilidade específico.",
              "Maior capacidade física de defesa em relação a outros grupos etários.",
              "Impossibilidade absoluta de qualquer forma de exploração financeira.",
              "Isolamento social, dependência física ou financeira e menor acesso à informação.",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se com condições que aumentam a exposição de idosos a diferentes formas de exploração.",
            justificativa:
              "A vitimização de idosos está frequentemente associada a fatores como o isolamento social, a dependência física ou financeira de terceiros e o menor acesso à informação, que aumentam a sua vulnerabilidade.",
          },
          {
            id: 5,
            pergunta:
              "O tráfico de pessoas, do ponto de vista vitimológico, caracteriza-se por:",
            opcoes: [
              "Situações de exploração, frequentemente associadas a coação, engano ou abuso de vulnerabilidade da vítima.",
              "Consentimento pleno e informado da vítima em todas as fases do processo.",
              "Ocorrer exclusivamente entre desconhecidos, nunca envolvendo pessoas conhecidas da vítima.",
              "Ausência total de qualquer impacto psicológico duradouro na vítima.",
            ],
            respostaCorreta: 0,
            dica: "Pense nos elementos típicos: exploração, coação, engano ou abuso de vulnerabilidade.",
            justificativa:
              "O tráfico de pessoas caracteriza-se por situações de exploração da vítima, frequentemente associadas a coação, engano ou abuso de uma situação de vulnerabilidade, comprometendo a genuína liberdade de consentimento.",
          },
          {
            id: 6,
            pergunta:
              "A síndrome de Estocolmo, enquanto fenómeno psicológico associado a certas situações de vitimização, caracteriza-se por:",
            opcoes: [
              "Total ausência de qualquer vínculo emocional entre vítima e agressor.",
              "O desenvolvimento de laços emocionais positivos da vítima em relação ao agressor, num contexto de dependência e sobrevivência.",
              "Um fenómeno exclusivamente relacionado com crimes de natureza económica.",
              "A imediata denúncia do agressor pela vítima, sem qualquer ambivalência.",
            ],
            respostaCorreta: 1,
            dica: "Envolve uma reação psicológica paradoxal de vínculo emocional com o próprio agressor.",
            justificativa:
              "A síndrome de Estocolmo descreve o desenvolvimento de laços emocionais positivos da vítima em relação ao agressor, num contexto de forte dependência, medo e busca de sobrevivência.",
          },
          {
            id: 7,
            pergunta:
              "A vitimização secundária no contexto de crimes sexuais pode manifestar-se, entre outras formas, através de:",
            opcoes: [
              "Total ausência de qualquer contacto institucional com a vítima.",
              "Apoio psicológico adequado durante todo o processo.",
              "Questionamentos inadequados sobre o comportamento ou vestuário da vítima, e exposição pública desnecessária.",
              "Proteção rigorosa da identidade da vítima em todas as fases.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com práticas institucionais que culpabilizam ou expõem desnecessariamente a vítima.",
            justificativa:
              "A vitimização secundária, em crimes sexuais, pode manifestar-se através de questionamentos inadequados que culpabilizam a vítima ou de exposição pública desnecessária, agravando o seu sofrimento.",
          },
          {
            id: 8,
            pergunta:
              "As 'salas de apoio à vítima' ou 'salas amigas da criança', em contexto forense, têm como objetivo principal:",
            opcoes: [
              "Substituir integralmente a necessidade de processo judicial.",
              "Impedir totalmente a participação da vítima no processo.",
              "Ser utilizadas exclusivamente por agressores adultos.",
              "Proporcionar um ambiente acolhedor e adequado para a recolha de depoimentos, reduzindo o impacto traumático da revitimização.",
            ],
            respostaCorreta: 3,
            dica: "O objetivo é tornar a recolha do depoimento menos traumática, num ambiente adequado.",
            justificativa:
              "As salas de apoio à vítima, especialmente voltadas a crianças, visam proporcionar um ambiente acolhedor e tecnicamente adequado para a recolha de depoimentos, reduzindo o risco de revitimização.",
          },
          {
            id: 9,
            pergunta:
              "A avaliação do dano psicológico sofrido pela vítima, em contexto pericial, tem como principal finalidade:",
            opcoes: [
              "Determinar de forma técnica a extensão do impacto emocional e psicológico decorrente do crime, subsidiando decisões judiciais.",
              "Substituir totalmente o julgamento da culpabilidade do agressor.",
              "Ser realizada sem qualquer metodologia técnica específica.",
              "Atribuir automaticamente culpa à vítima pelo sofrimento sentido.",
            ],
            respostaCorreta: 0,
            dica: "Foca-se em avaliar tecnicamente o impacto emocional/psicológico do crime.",
            justificativa:
              "A avaliação pericial do dano psicológico visa determinar, de forma técnica e fundamentada, a extensão do impacto emocional sofrido pela vítima, servindo de subsídio a decisões judiciais, nomeadamente quanto à reparação.",
          },
          {
            id: 10,
            pergunta:
              "Os programas de apoio a vítimas de crimes violentos frequentemente incluem, entre outras componentes:",
            opcoes: [
              "Exclusivamente apoio financeiro, sem qualquer componente psicológica.",
              "Acompanhamento psicológico especializado, apoio jurídico e orientação sobre direitos e recursos disponíveis.",
              "Ausência total de qualquer acompanhamento profissional.",
              "Apoio dirigido exclusivamente ao agressor.",
            ],
            respostaCorreta: 1,
            dica: "Envolvem múltiplas dimensões de apoio: psicológica, jurídica e informativa.",
            justificativa:
              "Os programas de apoio a vítimas de crimes violentos tendem a integrar acompanhamento psicológico especializado, apoio jurídico e orientação sobre direitos e recursos disponíveis à vítima.",
          },
          {
            id: 11,
            pergunta:
              "A confidencialidade no atendimento a vítimas de violência sexual é relevante, principalmente, para:",
            opcoes: [
              "Impedir totalmente qualquer investigação criminal do caso.",
              "Beneficiar exclusivamente o agressor.",
              "Preservar a segurança e a dignidade da vítima, favorecendo a confiança necessária para a revelação e o acompanhamento adequado.",
              "Ser dispensável em qualquer circunstância.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com a construção de confiança para que a vítima se sinta segura em relatar o ocorrido.",
            justificativa:
              "A confidencialidade no atendimento a vítimas de violência sexual é fundamental para preservar a sua segurança e dignidade, favorecendo a confiança necessária para a revelação e o acompanhamento técnico adequado.",
          },
          {
            id: 12,
            pergunta:
              "A revitimização judicial pode ser reduzida, entre outras medidas, através de:",
            opcoes: [
              "Multiplicação do número de audiências em que a vítima é obrigada a repetir o relato.",
              "Exposição pública detalhada dos factos, sem qualquer proteção da identidade.",
              "Ausência total de qualquer adaptação processual às necessidades da vítima.",
              "Depoimento único ou reduzido, com recurso a meios técnicos como videoconferência, sempre que legalmente possível.",
            ],
            respostaCorreta: 3,
            dica: "Pense em medidas que reduzem a necessidade de a vítima repetir o relato várias vezes.",
            justificativa:
              "Medidas como o depoimento único, reduzido, ou o uso de meios técnicos como a videoconferência, quando legalmente previstas, contribuem para reduzir a revitimização judicial da vítima.",
          },
          {
            id: 13,
            pergunta:
              "A vitimização de trabalhadores em contexto de exploração laboral (trabalho forçado) partilha, com outras formas de vitimização, o elemento de:",
            opcoes: [
              "Abuso de uma posição de vulnerabilidade ou dependência económica da vítima.",
              "Consentimento pleno e livre da vítima em todas as circunstâncias.",
              "Ausência de qualquer relação de poder entre as partes envolvidas.",
              "Ocorrência exclusiva em contextos legais e regulamentados.",
            ],
            respostaCorreta: 0,
            dica: "Pense na exploração de uma posição de fragilidade económica ou social da vítima.",
            justificativa:
              "A exploração laboral partilha com outras formas de vitimização o abuso de uma posição de vulnerabilidade ou dependência económica, que compromete a genuína liberdade de escolha da vítima.",
          },
          {
            id: 14,
            pergunta:
              "A criação de redes de referenciação entre instituições (saúde, justiça, ação social, educação) no apoio à vítima tem como principal vantagem:",
            opcoes: [
              "Aumentar desnecessariamente a burocracia sem qualquer benefício à vítima.",
              "Permitir uma resposta articulada e mais eficaz às necessidades multidimensionais da vítima.",
              "Substituir totalmente a necessidade de intervenção especializada.",
              "Concentrar todo o apoio numa única instituição, excluindo as demais.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com a coordenação entre diferentes instituições em benefício da vítima.",
            justificativa:
              "As redes de referenciação entre diferentes instituições permitem uma resposta mais articulada e eficaz às necessidades multidimensionais da vítima, evitando lacunas e sobreposições no apoio prestado.",
          },
          {
            id: 15,
            pergunta:
              "O direito da vítima à reparação, num sentido amplo, pode incluir:",
            opcoes: [
              "Apenas a reparação financeira, excluindo qualquer outra forma de reconhecimento do dano sofrido.",
              "Exclusivamente a punição do agressor, sem qualquer benefício direto à vítima.",
              "Reparação material, mas também formas simbólicas de reconhecimento do dano sofrido e restauração da dignidade da vítima.",
              "Um direito aplicável apenas a vítimas de crimes patrimoniais.",
            ],
            respostaCorreta: 2,
            dica: "Vai além do dinheiro: pode incluir reconhecimento simbólico do sofrimento.",
            justificativa:
              "O direito à reparação, em sentido amplo, pode compreender tanto a reparação material quanto formas simbólicas de reconhecimento do dano sofrido, contribuindo para a restauração da dignidade da vítima.",
          },
        ],
      },
      {
        id: "sistemas-penitenciarios",
        nome: "Sistemas Penitenciários",
        questoes: [
          {
            id: 1,
            pergunta:
              "O sistema penitenciário 'progressivo', historicamente relevante, caracteriza-se por:",
            opcoes: [
              "Manter o recluso sempre no mesmo regime de cumprimento de pena, sem qualquer alteração.",
              "Prever a passagem gradual do recluso por diferentes fases ou regimes, com maior liberdade à medida que demonstra progresso.",
              "Aplicar exclusivamente o isolamento celular contínuo, sem qualquer evolução.",
              "Eliminar totalmente qualquer forma de avaliação do comportamento do recluso.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "O nome já indica: há uma progressão gradual entre diferentes fases.",
            justificativa:
              "O sistema progressivo caracteriza-se pela passagem gradual do recluso por diferentes fases de execução da pena, com aumento progressivo de liberdade e responsabilidade, condicionado ao seu comportamento.",
          },
          {
            id: 2,
            pergunta:
              "A distinção entre regime fechado, semiaberto e aberto de cumprimento de pena relaciona-se, principalmente, com:",
            opcoes: [
              "O grau de restrição da liberdade e de contacto com o exterior imposto ao recluso.",
              "O tipo de alimentação fornecida ao recluso.",
              "A cor do uniforme utilizado no estabelecimento prisional.",
              "A idade exclusiva do recluso.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Relaciona-se com o grau de restrição de liberdade em cada regime.",
            justificativa:
              "A distinção entre os diferentes regimes de cumprimento de pena baseia-se, essencialmente, no grau de restrição da liberdade e no nível de contacto permitido com o exterior.",
          },
          {
            id: 3,
            pergunta:
              "O princípio da individualização da pena, no âmbito da execução penal, determina que:",
            opcoes: [
              "Todos os reclusos devem cumprir a pena exatamente da mesma forma, sem qualquer distinção.",
              "A pena deve ser sempre agravada com base na condição pessoal do recluso.",
              "A execução da pena deve considerar as características e necessidades específicas de cada recluso.",
              "A individualização aplica-se apenas na fase de julgamento, sem qualquer relevância na execução.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "Relaciona-se com o tratamento adaptado às características de cada pessoa.",
            justificativa:
              "O princípio da individualização determina que a execução da pena deve ser adaptada às características, necessidades e ao percurso específico de cada recluso, e não aplicada de forma uniforme.",
          },
          {
            id: 4,
            pergunta:
              "A superlotação prisional, enquanto problema estrutural de muitos sistemas penitenciários, está frequentemente associada a:",
            opcoes: [
              "Nenhum impacto relevante sobre a qualidade das condições de detenção.",
              "Melhoria automática das condições de vida dos reclusos.",
              "Redução automática dos índices de reincidência.",
              "Deterioração das condições de detenção, aumento de tensões e maiores dificuldades na implementação de programas de reabilitação.",
            ],
            respostaCorreta: 3, // Opção D
            dica: "Pense nos efeitos negativos de ter mais reclusos do que a capacidade do estabelecimento permite.",
            justificativa:
              "A superlotação prisional está associada à deterioração das condições de detenção, ao aumento de tensões internas e a maiores dificuldades na implementação eficaz de programas de reabilitação.",
          },
          {
            id: 5,
            pergunta:
              "O trabalho prisional, enquanto instrumento de execução penal, cumpre, entre outras, a função de:",
            opcoes: [
              "Ser uma forma disfarçada de castigo físico ao recluso.",
              "Contribuir para a disciplina, a aquisição de competências e a preparação para a reintegração social.",
              "Substituir integralmente qualquer outro programa de reabilitação.",
              "Ser obrigatoriamente não remunerado, em qualquer sistema.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "Relaciona-se com o desenvolvimento de competências úteis para a vida após a prisão.",
            justificativa:
              "O trabalho prisional, quando bem estruturado, contribui para a disciplina, a aquisição de competências profissionais e a preparação do recluso para a reintegração social após a libertação.",
          },
          {
            id: 6,
            pergunta:
              "As saídas precárias ou licenças de saída, previstas em determinados sistemas penitenciários, têm como principal objetivo:",
            opcoes: [
              "Permitir contacto gradual do recluso com o exterior, favorecendo a preparação para a liberdade.",
              "Substituir integralmente o cumprimento da pena.",
              "Ser aplicadas exclusivamente a reclusos em regime fechado.",
              "Aumentar automaticamente a duração total da pena.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Servem para preparar gradualmente o recluso para a vida em liberdade.",
            justificativa:
              "As saídas precárias ou licenças permitem um contacto gradual e controlado do recluso com o exterior, contribuindo para a sua preparação progressiva para a liberdade.",
          },
          {
            id: 7,
            pergunta:
              "A assistência à família do recluso, prevista em muitos sistemas penitenciários, é relevante porque:",
            opcoes: [
              "Não tem qualquer relação com o sucesso da reintegração social do recluso.",
              "Deve ser sempre excluída, para evitar qualquer contacto com o exterior.",
              "A manutenção de vínculos familiares saudáveis é frequentemente associada a melhores resultados na reintegração pós-prisional.",
              "É juridicamente irrelevante em todos os sistemas penitenciários.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "Pense na importância dos laços familiares para o processo de reintegração.",
            justificativa:
              "A manutenção de vínculos familiares saudáveis durante o cumprimento da pena é frequentemente associada a melhores resultados na reintegração social do recluso após a libertação.",
          },
          {
            id: 8,
            pergunta:
              "A saúde mental em contexto prisional é um tema relevante, considerando que:",
            opcoes: [
              "A população prisional apresenta, em vários estudos, uma prevalência de perturbações mentais superior à da população geral.",
              "Não existe qualquer diferença entre a prevalência de perturbações mentais dentro e fora do sistema prisional.",
              "Os estabelecimentos prisionais dispensam totalmente qualquer cuidado de saúde mental.",
              "A saúde mental dos reclusos não tem qualquer relação com o risco de reincidência.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Vários estudos apontam para uma diferença relevante em relação à população geral.",
            justificativa:
              "Diversos estudos indicam que a população prisional apresenta uma prevalência de perturbações mentais superior à da população geral, exigindo atenção específica dos sistemas de saúde prisional.",
          },
          {
            id: 9,
            pergunta:
              "As Regras Mínimas das Nações Unidas para o Tratamento de Reclusos (conhecidas como Regras de Mandela) estabelecem, entre outros aspetos, padrões relativos a:",
            opcoes: [
              "A total ausência de qualquer regulamentação sobre as condições de detenção.",
              "A obrigatoriedade de isolamento celular contínuo para todos os reclusos.",
              "A eliminação total de qualquer direito de defesa dos reclusos.",
              "Condições dignas de detenção, acesso a cuidados de saúde e vedação de tratamentos cruéis, desumanos ou degradantes.",
            ],
            respostaCorreta: 3, // Opção D
            dica: "São diretrizes internacionais sobre condições mínimas dignas de detenção.",
            justificativa:
              "As Regras de Mandela estabelecem padrões internacionais mínimos relativos a condições dignas de detenção, acesso a cuidados de saúde e à proibição de tratamentos cruéis, desumanos ou degradantes.",
          },
          {
            id: 10,
            pergunta:
              "A monitorização eletrónica, enquanto alternativa ao encarceramento tradicional, permite:",
            opcoes: [
              "Substituir totalmente a necessidade de qualquer avaliação judicial.",
              "O cumprimento de determinadas penas ou medidas fora do estabelecimento prisional, com controlo à distância.",
              "Aumentar automaticamente a duração da pena aplicada.",
              "Ser aplicada exclusivamente a crimes de elevada gravidade.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "Permite o cumprimento de determinadas penas fora da prisão, com supervisão à distância.",
            justificativa:
              "A monitorização eletrónica permite, em determinados casos previstos em lei, o cumprimento de penas ou medidas fora do estabelecimento prisional, mantendo controlo e supervisão à distância.",
          },
          {
            id: 11,
            pergunta:
              "Os programas educativos em contexto prisional (alfabetização, ensino formal, formação profissional) têm como principal finalidade:",
            opcoes: [
              "Ocupar o tempo dos reclusos sem qualquer objetivo de reintegração.",
              "Substituir totalmente o cumprimento da pena.",
              "Contribuir para o desenvolvimento pessoal, profissional e social do recluso, favorecendo a reintegração pós-libertação.",
              "Ser dispensados sempre que a taxa de ocupação prisional é elevada.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "O objetivo central é preparar o recluso para uma vida mais estruturada após a saída.",
            justificativa:
              "Os programas educativos em contexto prisional visam o desenvolvimento pessoal, profissional e social do recluso, contribuindo significativamente para a sua reintegração após a libertação.",
          },
          {
            id: 12,
            pergunta:
              "O modelo de 'prisões abertas' (ou de baixa segurança), existente em alguns sistemas, caracteriza-se por:",
            opcoes: [
              "Ausência total de qualquer estrutura ou disciplina interna.",
              "Menor restrição física e maior responsabilização do recluso, destinado a perfis de menor risco.",
              "Ser aplicado exclusivamente a reclusos de alta periculosidade.",
              "Eliminar totalmente qualquer forma de acompanhamento técnico.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "É um regime de menor restrição, voltado a perfis de menor risco.",
            justificativa:
              "As prisões abertas caracterizam-se por menor restrição física e maior responsabilização do recluso, sendo, em regra, destinadas a perfis identificados como de menor risco.",
          },
          {
            id: 13,
            pergunta:
              "A gestão diferenciada de reclusos por nível de risco e necessidade, em muitos sistemas penitenciários modernos, visa principalmente:",
            opcoes: [
              "Aplicar sempre o mesmo tratamento a todos os reclusos, independentemente do perfil.",
              "Excluir completamente qualquer critério de avaliação individual.",
              "Aumentar indiscriminadamente o nível de segurança de todos os estabelecimentos.",
              "Otimizar recursos e intervenções, direcionando programas adequados ao perfil de risco e às necessidades de cada recluso.",
            ],
            respostaCorreta: 3, // Opção D
            dica: "Relaciona-se com direcionar recursos e programas conforme o perfil de cada recluso.",
            justificativa:
              "A gestão diferenciada por nível de risco e necessidade permite otimizar recursos, direcionando intervenções mais adequadas ao perfil específico de cada recluso, aumentando a eficácia da execução penal.",
          },
          {
            id: 14,
            pergunta:
              "O acompanhamento pós-libertação (como a liberdade condicional supervisionada) tem como principal objetivo:",
            opcoes: [
              "Assegurar transição gradual e monitorizada para a vida em liberdade, apoiando a reintegração e reduzindo o risco de reincidência.",
              "Prolongar indefinidamente a restrição da liberdade do ex-recluso.",
              "Substituir integralmente qualquer outra forma de apoio social.",
              "Ser aplicado apenas a reclusos que nunca beneficiaram de qualquer programa prisional.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Serve para acompanhar e apoiar a transição gradual para a vida em liberdade.",
            justificativa:
              "O acompanhamento pós-libertação visa assegurar uma transição gradual e monitorizada para a vida em liberdade, apoiando a reintegração social e reduzindo o risco de reincidência.",
          },
          {
            id: 15,
            pergunta:
              "A inspeção e fiscalização externa dos estabelecimentos prisionais, por órgãos independentes, é relevante para:",
            opcoes: [
              "Impedir totalmente qualquer acesso de entidades externas às prisões.",
              "Substituir integralmente a administração interna do estabelecimento prisional.",
              "Garantir a transparência, o respeito pelos direitos dos reclusos e a deteção de eventuais irregularidades.",
              "Ser considerada uma prática dispensável em qualquer sistema penitenciário moderno.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "Relaciona-se com controlo externo e transparência sobre as condições prisionais.",
            justificativa:
              "A inspeção e fiscalização externa dos estabelecimentos prisionais, por órgãos independentes, contribui para garantir transparência, o respeito pelos direitos dos reclusos e a deteção de eventuais irregularidades.",
          },
        ],
      },
      {
        id: "praticas-forenses",
        nome: "Práticas Forenses",
        questoes: [
          {
            id: 1,
            pergunta:
              "A cadeia de custódia da prova, em contexto forense, tem como principal finalidade:",
            opcoes: [
              "Documentar e garantir a integridade da prova desde a sua recolha até a sua apresentação em juízo.",
              "Permitir que qualquer pessoa manipule livremente a prova recolhida.",
              "Substituir totalmente a necessidade de perícia técnica.",
              "Ser aplicável apenas a provas documentais, excluindo vestígios físicos.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Relaciona-se com rastreabilidade e integridade da prova ao longo de todo o processo.",
            justificativa:
              "A cadeia de custódia documenta todas as etapas de manuseio da prova, desde a recolha até a apresentação em juízo, garantindo a sua integridade e idoneidade probatória.",
          },
          {
            id: 2,
            pergunta:
              "O laudo pericial, enquanto documento técnico produzido por um perito, deve caracterizar-se, entre outros aspetos, por:",
            opcoes: [
              "Conclusões baseadas exclusivamente na opinião pessoal do perito, sem qualquer fundamentação técnica.",
              "Fundamentação técnica clara, objetividade e imparcialidade na análise realizada.",
              "Ausência total de metodologia científica.",
              "Ser sempre favorável à parte que solicitou a perícia.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "O perito deve ser tecnicamente rigoroso e imparcial.",
            justificativa:
              "O laudo pericial deve apresentar fundamentação técnica clara, objetividade metodológica e imparcialidade, de modo a subsidiar de forma fidedigna a decisão judicial.",
          },
          {
            id: 3,
            pergunta:
              "A perícia criminal no local do crime tem como um dos principais objetivos:",
            opcoes: [
              "Alterar o cenário para facilitar a investigação.",
              "Substituir totalmente o depoimento de testemunhas.",
              "Preservar, documentar e analisar tecnicamente os vestígios existentes, reconstituindo a dinâmica dos factos.",
              "Determinar diretamente a culpabilidade do suspeito, sem necessidade de julgamento.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "O foco está em preservar e analisar vestígios, não em substituir o julgamento.",
            justificativa:
              "A perícia no local do crime visa preservar, documentar e analisar tecnicamente os vestígios existentes, contribuindo para a reconstituição da dinâmica dos factos ocorridos.",
          },
          {
            id: 4,
            pergunta:
              "A entrevista cognitiva, enquanto técnica utilizada na recolha de depoimentos, caracteriza-se por:",
            opcoes: [
              "Utilizar perguntas fechadas e sugestivas de forma sistemática.",
              "Ser aplicada exclusivamente a suspeitos, nunca a testemunhas.",
              "Dispensar qualquer formação técnica do entrevistador.",
              "Facilitar a recordação de memórias através de técnicas específicas, minimizando o risco de contaminação do relato.",
            ],
            respostaCorreta: 3, // Opção D
            dica: "É uma técnica estruturada para melhorar a qualidade e a precisão da recordação.",
            justificativa:
              "A entrevista cognitiva é uma técnica estruturada que facilita a recordação de memórias através de estratégias específicas, minimizando o risco de contaminação e de falsas memórias no relato.",
          },
          {
            id: 5,
            pergunta:
              "A elaboração de um relatório pericial psicológico em contexto forense deve, essencialmente:",
            opcoes: [
              "Apresentar dados objetivos, metodologia utilizada e conclusões fundamentadas, dentro dos limites da avaliação realizada.",
              "Determinar diretamente a culpabilidade jurídica do avaliado.",
              "Ser redigido sem qualquer referência à metodologia utilizada.",
              "Basear-se exclusivamente na impressão subjetiva do perito, sem qualquer instrumento técnico.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Deve ser transparente quanto à metodologia e limitar-se ao que a avaliação técnica permite concluir.",
            justificativa:
              "O relatório pericial psicológico deve apresentar de forma clara os dados obtidos, a metodologia utilizada e conclusões devidamente fundamentadas, respeitando os limites técnicos da avaliação realizada.",
          },
          {
            id: 6,
            pergunta:
              "A credibilidade do testemunho, do ponto de vista da psicologia forense, pode ser influenciada, entre outros fatores, por:",
            opcoes: [
              "Nenhum fator relevante, sendo sempre absolutamente fiável.",
              "Fatores relacionados com a memória, o tempo decorrido desde o evento e possíveis processos de sugestionabilidade.",
              "Exclusivamente a idade da testemunha, sem qualquer outro fator relevante.",
              "Ser sempre inteiramente coincidente com os factos reais, sem qualquer margem de erro.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "Pense em fatores que afetam a fidedignidade de qualquer relato baseado em memória.",
            justificativa:
              "A credibilidade do testemunho pode ser influenciada por fatores relacionados com o funcionamento da memória, o tempo decorrido desde o evento e processos de sugestionabilidade, entre outros elementos técnicos avaliados pela psicologia forense.",
          },
          {
            id: 7,
            pergunta:
              "A avaliação de simulação (malingering) em contexto pericial forense é relevante para:",
            opcoes: [
              "Confirmar automaticamente a veracidade de qualquer relato apresentado.",
              "Ser aplicada exclusivamente a vítimas, nunca a suspeitos ou arguidos.",
              "Identificar possíveis tentativas de exagero ou fabricação de sintomas, com implicações na análise pericial.",
              "Substituir totalmente a necessidade de qualquer outra avaliação técnica.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "Relaciona-se com identificar sintomas exagerados ou fabricados, quando presentes.",
            justificativa:
              "A avaliação de simulação é relevante para identificar eventuais tentativas de exagero ou fabricação de sintomas, informação com implicações diretas na análise e nas conclusões periciais.",
          },
          {
            id: 8,
            pergunta:
              "O princípio da imparcialidade do perito, em contexto forense, exige que:",
            opcoes: [
              "O perito favoreça sempre a parte que contratou os seus serviços.",
              "O perito omita informações desfavoráveis à parte contratante.",
              "A imparcialidade seja dispensável em perícias privadas.",
              "As conclusões técnicas sejam formuladas de forma objetiva, independentemente de quem tenha solicitado a perícia.",
            ],
            respostaCorreta: 3, // Opção D
            dica: "A objetividade técnica deve prevalecer, independentemente de quem contratou o perito.",
            justificativa:
              "A imparcialidade pericial exige que as conclusões técnicas sejam formuladas com objetividade e rigor científico, independentemente da parte que tenha solicitado ou custeado a perícia.",
          },
          {
            id: 9,
            pergunta:
              "A elaboração de um relatório social forense, frequentemente solicitado em processos de família e menores, tem como objetivo principal:",
            opcoes: [
              "Fornecer informação técnica sobre o contexto familiar e social relevante para a decisão judicial.",
              "Determinar diretamente a decisão final do processo, substituindo o juiz.",
              "Ser elaborado sem qualquer contacto direto com os envolvidos.",
              "Focar-se exclusivamente em aspetos económicos, sem qualquer outra dimensão.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "O relatório apoia a decisão judicial, mas não a substitui.",
            justificativa:
              "O relatório social forense fornece informação técnica relevante sobre o contexto familiar e social das partes envolvidas, subsidiando, mas não substituindo, a decisão do julgador.",
          },
          {
            id: 10,
            pergunta:
              "A tomada de fotografias e a documentação visual em perícias forenses têm como principal função:",
            opcoes: [
              "Substituir totalmente a necessidade de qualquer laudo escrito.",
              "Registar de forma objetiva e verificável elementos relevantes para a análise técnica e para o processo judicial.",
              "Ser realizada sem qualquer critério técnico ou metodológico.",
              "Servir apenas como material de arquivo pessoal do perito.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "Serve para documentar de forma objetiva e verificável elementos técnicos relevantes.",
            justificativa:
              "A documentação visual em perícias forenses tem como função registar, de forma objetiva e verificável, elementos relevantes que apoiam a análise técnica e a compreensão do processo judicial.",
          },
          {
            id: 11,
            pergunta:
              "O depoimento do perito em audiência de julgamento, quando solicitado, tem como principal função:",
            opcoes: [
              "Substituir integralmente o laudo pericial escrito previamente apresentado.",
              "Emitir juízo definitivo sobre a culpabilidade do réu.",
              "Esclarecer, de forma técnica e acessível, as conclusões do laudo pericial perante o tribunal.",
              "Ser dispensado de qualquer compromisso com a verdade técnica.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "O perito esclarece tecnicamente as suas conclusões, sem decidir a causa.",
            justificativa:
              "O depoimento do perito em audiência tem como função esclarecer, de forma técnica e acessível ao tribunal, as conclusões previamente apresentadas no laudo pericial.",
          },
          {
            id: 12,
            pergunta:
              "A avaliação da capacidade parental, em contexto forense, deve basear-se, principalmente, em:",
            opcoes: [
              "Impressões subjetivas e imediatas do avaliador, sem qualquer metodologia.",
              "Exclusivamente a situação económica da família.",
              "Um único encontro breve, sem qualquer análise complementar.",
              "Instrumentos técnicos validados, observação estruturada e análise do contexto familiar, evitando juízos baseados em preconceitos.",
            ],
            respostaCorreta: 3, // Opção D
            dica: "Deve seguir metodologia técnica rigorosa, evitando julgamentos baseados em preconceitos.",
            justificativa:
              "A avaliação da capacidade parental deve fundamentar-se em instrumentos técnicos validados, observação estruturada e análise cuidadosa do contexto familiar, afastando juízos baseados em preconceitos pessoais.",
          },
          {
            id: 13,
            pergunta:
              "O princípio do contraditório em matéria pericial permite, tipicamente, que as partes:",
            opcoes: [
              "Sejam impedidas de qualquer contacto com o conteúdo do laudo pericial.",
              "Questionem, apresentem contraperícia ou solicitem esclarecimentos sobre as conclusões técnicas apresentadas.",
              "Alterem diretamente o conteúdo do laudo pericial já elaborado.",
              "Sejam automaticamente vinculadas às conclusões periciais, sem qualquer possibilidade de contestação.",
            ],
            respostaCorreta: 1, // Opção B
            dica: "As partes podem questionar tecnicamente a prova pericial, e não apenas aceitá-la.",
            justificativa:
              "O contraditório em matéria pericial permite às partes questionar, solicitar esclarecimentos ou apresentar contraperícia relativamente às conclusões técnicas apresentadas, garantindo o equilíbrio processual.",
          },
          {
            id: 14,
            pergunta:
              "A prática forense multidisciplinar, envolvendo profissionais do direito, da psicologia e do serviço social, é valorizada porque:",
            opcoes: [
              "Torna o processo desnecessariamente mais lento, sem qualquer benefício técnico.",
              "Elimina totalmente a necessidade de decisão judicial.",
              "Permite uma análise mais completa e integrada de situações complexas que envolvem diferentes dimensões da vida das pessoas.",
              "Substituir integralmente a atuação de qualquer profissional isoladamente.",
            ],
            respostaCorreta: 2, // Opção C
            dica: "A combinação de diferentes olhares técnicos enriquece a análise de casos complexos.",
            justificativa:
              "A prática forense multidisciplinar permite uma análise mais completa e integrada de situações complexas, combinando diferentes perspetivas técnicas relevantes para a decisão judicial.",
          },
          {
            id: 15,
            pergunta:
              "A ética profissional na prática forense exige, entre outros aspetos:",
            opcoes: [
              "Respeito pela confidencialidade, rigor técnico e limites claros quanto ao alcance das conclusões apresentadas.",
              "Total liberdade para emitir opiniões pessoais sem qualquer base técnica.",
              "Ausência de qualquer responsabilidade profissional pelas conclusões emitidas.",
              "Priorizar sempre os interesses da parte que contrata o profissional, independentemente da verdade técnica.",
            ],
            respostaCorreta: 0, // Opção A
            dica: "Envolve confidencialidade, rigor técnico e honestidade sobre os limites da própria avaliação.",
            justificativa:
              "A ética profissional na prática forense exige o respeito pela confidencialidade, o rigor técnico-científico e a clareza quanto aos limites das conclusões, preservando a integridade da atuação pericial.",
          },
        ],
      },
    ],
  },
  {
    id: "mod-4",
    titulo:
      "Nível 4: Crime Organizado e Criminalidade Económica (Profissional / Forense)",
    disciplinas: [
      {
        id: "crime-organizado-criminalidade-economica",
        nome: "Crime Organizado e Criminalidade Económica",
        questoes: [
          {
            id: 1,
            pergunta:
              "O crime organizado, em sentido técnico, distingue-se da criminalidade comum, principalmente, por:",
            opcoes: [
              "Ser sempre praticado por um único indivíduo, sem qualquer estrutura.",
              "Envolver estrutura estável, divisão de tarefas e finalidade de obtenção de vantagem, geralmente ao longo do tempo.",
              "Ocorrer exclusivamente em ambiente digital.",
              "Não ter qualquer relação com a obtenção de lucro.",
            ],
            respostaCorreta: 1,
            dica: "Pense em estrutura, permanência e finalidade lucrativa.",
            justificativa:
              "O crime organizado caracteriza-se por uma estrutura relativamente estável, divisão de funções entre os seus membros e a finalidade de obtenção de vantagens, geralmente de forma continuada.",
          },
          {
            id: 2,
            pergunta:
              "O branqueamento de capitais (lavagem de dinheiro) tem como principal objetivo:",
            opcoes: [
              "Aumentar diretamente a pena aplicada a um crime já julgado.",
              "Reduzir a quantidade de dinheiro em circulação na economia.",
              "Dar aparência lícita a bens ou valores obtidos através de atividade criminosa.",
              "Facilitar exclusivamente o pagamento de impostos em atraso.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com 'limpar' a origem ilícita de bens ou valores.",
            justificativa:
              "O branqueamento de capitais visa dar aparência lícita a bens, direitos ou valores provenientes, direta ou indiretamente, de atividade criminosa, dificultando a identificação da sua origem.",
          },
          {
            id: 3,
            pergunta:
              "As três fases clássicas do processo de branqueamento de capitais são geralmente descritas como:",
            opcoes: [
              "Colocação, ocultação/dissimulação e integração.",
              "Investigação, acusação e julgamento.",
              "Planeamento, execução e prescrição.",
              "Denúncia, inquérito e sentença.",
            ],
            respostaCorreta: 0,
            dica: "Pense em introduzir o dinheiro no sistema, disfarçar a origem e, por fim, reintroduzi-lo como lícito.",
            justificativa:
              "O processo de branqueamento é habitualmente descrito em três fases: colocação (introdução dos fundos no sistema financeiro), ocultação/dissimulação (movimentações para dificultar o rastreio) e integração (reintrodução dos fundos como aparentemente lícitos).",
          },
          {
            id: 4,
            pergunta:
              "A criminalidade económica, em sentido amplo, caracteriza-se, entre outros aspetos, por:",
            opcoes: [
              "Ser exclusivamente praticada por pessoas em situação de pobreza extrema.",
              "Não ter qualquer impacto na confiança nas instituições económicas.",
              "Limitar-se a crimes de furto simples em espaço público.",
              "Envolver, tipicamente, condutas praticadas no exercício de atividades económicas ou profissionais, com finalidade de vantagem patrimonial.",
            ],
            respostaCorreta: 3,
            dica: "Pense em crimes ligados ao exercício de atividades económicas, empresariais ou profissionais.",
            justificativa:
              "A criminalidade económica engloba condutas ilícitas praticadas, tipicamente, no contexto de atividades económicas, empresariais ou profissionais, com finalidade de obtenção de vantagem patrimonial indevida.",
          },
          {
            id: 5,
            pergunta:
              "A corrupção, enquanto forma de criminalidade económica, pode ser caracterizada, de modo geral, como:",
            opcoes: [
              "Um fenómeno exclusivamente ligado à esfera privada, sem qualquer relação com o setor público.",
              "O abuso de posição de poder ou confiança para obtenção de vantagem indevida, própria ou de terceiro.",
              "Uma conduta sempre isenta de qualquer consequência penal.",
              "Um conceito sem qualquer relevância para a criminologia.",
            ],
            respostaCorreta: 1,
            dica: "Envolve abuso de posição de confiança ou poder para benefício indevido.",
            justificativa:
              "A corrupção caracteriza-se, de modo geral, pelo abuso de uma posição de poder ou de confiança, em benefício próprio ou de terceiro, em detrimento do interesse público ou institucional.",
          },
          {
            id: 6,
            pergunta:
              "A criminalidade de 'colarinho branco' (white-collar crime), conceito desenvolvido por Edwin Sutherland, refere-se, essencialmente, a:",
            opcoes: [
              "Crimes cometidos exclusivamente por menores de idade.",
              "Crimes violentos praticados em ambiente doméstico.",
              "Crimes praticados por pessoas de elevado estatuto socioeconómico, no exercício da sua atividade profissional.",
              "Um conceito sem qualquer aplicação prática na criminologia contemporânea.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com crimes ligados ao estatuto profissional e social do agente.",
            justificativa:
              "O conceito de criminalidade de colarinho branco, desenvolvido por Sutherland, refere-se a crimes praticados por pessoas de elevado estatuto socioeconómico, no exercício da sua atividade profissional.",
          },
          {
            id: 7,
            pergunta:
              "As organizações criminosas transnacionais caracterizam-se, entre outros aspetos, por:",
            opcoes: [
              "Atuarem exclusivamente dentro das fronteiras de um único país, sem qualquer ligação internacional.",
              "Desenvolverem atividades ilícitas que ultrapassam fronteiras nacionais, exigindo cooperação internacional na investigação.",
              "Não terem qualquer capacidade de adaptação a mudanças legais ou tecnológicas.",
              "Serem sempre estruturas extremamente pequenas e informais.",
            ],
            respostaCorreta: 1,
            dica: "O elemento 'transnacional' indica atuação além das fronteiras nacionais.",
            justificativa:
              "As organizações criminosas transnacionais desenvolvem atividades que ultrapassam as fronteiras de um único país, o que exige, para o seu combate, uma efetiva cooperação internacional entre autoridades.",
          },
          {
            id: 8,
            pergunta:
              "O tráfico de estupefacientes, quando associado ao crime organizado, envolve tipicamente:",
            opcoes: [
              "Uma atividade sempre isolada e sem qualquer ligação a outras formas de criminalidade.",
              "A ausência total de qualquer componente económica.",
              "Um fenómeno restrito exclusivamente ao consumo individual.",
              "Uma estrutura logística e financeira complexa, abrangendo produção, transporte e distribuição.",
            ],
            respostaCorreta: 3,
            dica: "Pense na cadeia logística e financeira associada ao tráfico em larga escala.",
            justificativa:
              "O tráfico de estupefacientes associado ao crime organizado envolve, tipicamente, uma estrutura logística e financeira complexa, abrangendo desde a produção até a distribuição final.",
          },
          {
            id: 9,
            pergunta:
              "Os 'paraísos fiscais', frequentemente associados a esquemas de criminalidade económica, caracterizam-se, entre outros fatores, por:",
            opcoes: [
              "Regimes fiscais favoráveis e, por vezes, menor transparência, o que pode facilitar a ocultação de bens e a evasão fiscal.",
              "Regimes de elevada transparência e partilha automática de informação fiscal com todos os países.",
              "Aplicação de impostos extremamente elevados sobre qualquer rendimento.",
              "Total inexistência de qualquer sistema financeiro.",
            ],
            respostaCorreta: 0,
            dica: "Pense em regimes fiscais atrativos e, por vezes, com menor transparência.",
            justificativa:
              "Os paraísos fiscais caracterizam-se, entre outros fatores, por regimes fiscais favoráveis e, nalguns casos, por menor transparência, o que pode facilitar esquemas de ocultação de bens e evasão fiscal.",
          },
          {
            id: 10,
            pergunta:
              "As Unidades de Informação Financeira (UIF), existentes em diversos países, têm como principal função:",
            opcoes: [
              "Julgar diretamente processos de branqueamento de capitais.",
              "Substituir totalmente a atuação do Ministério Público.",
              "Recolher, analisar e disseminar informação relativa a operações financeiras suspeitas de branqueamento de capitais ou financiamento do terrorismo.",
              "Gerir diretamente os bens apreendidos em processos criminais.",
            ],
            respostaCorreta: 2,
            dica: "São órgãos de análise financeira, não órgãos judiciais.",
            justificativa:
              "As Unidades de Informação Financeira têm como função principal recolher, analisar e disseminar informação sobre operações financeiras suspeitas de branqueamento de capitais ou financiamento do terrorismo, apoiando a investigação.",
          },
          {
            id: 11,
            pergunta:
              "A fraude fiscal, enquanto modalidade de criminalidade económica, caracteriza-se, essencialmente, por:",
            opcoes: [
              "O cumprimento integral e voluntário de todas as obrigações fiscais.",
              "Condutas destinadas a reduzir ou eliminar ilicitamente a obrigação tributária devida ao Estado.",
              "Um fenómeno sem qualquer impacto nas finanças públicas.",
              "Uma prática exclusivamente lícita de planeamento fiscal.",
            ],
            respostaCorreta: 1,
            dica: "Envolve condutas ilícitas para reduzir o valor de impostos devidos.",
            justificativa:
              "A fraude fiscal caracteriza-se por condutas ilícitas destinadas a reduzir ou eliminar, de forma indevida, a obrigação tributária devida ao Estado, causando prejuízo às finanças públicas.",
          },
          {
            id: 12,
            pergunta:
              "A criminalidade informática associada à criminalidade económica (como a fraude em sistemas de pagamento) tem crescido, entre outros fatores, devido a:",
            opcoes: [
              "A total ausência de sistemas informáticos no comércio atual.",
              "A diminuição do número de utilizadores de serviços digitais em todo o mundo.",
              "A impossibilidade absoluta de qualquer rastreamento de transações digitais.",
              "A crescente digitalização das transações financeiras e comerciais, que amplia as oportunidades e a escala de atuação.",
            ],
            respostaCorreta: 3,
            dica: "Pense na relação entre digitalização crescente e novas oportunidades para o crime económico.",
            justificativa:
              "A crescente digitalização das transações financeiras e comerciais amplia as oportunidades e a escala de atuação de esquemas de criminalidade económica praticados através de meios informáticos.",
          },
          {
            id: 13,
            pergunta:
              "A extinção de vantagem económica obtida através de atividade criminosa (perda de bens ou confisco) tem como principal finalidade:",
            opcoes: [
              "Permitir que o agente mantenha integralmente os proveitos do crime.",
              "Impedir que o crime seja economicamente compensador, retirando ao agente os proveitos obtidos ilicitamente.",
              "Substituir totalmente a pena de prisão aplicável.",
              "Beneficiar exclusivamente terceiros sem qualquer relação com o processo.",
            ],
            respostaCorreta: 1,
            dica: "O princípio é: o crime não deve compensar economicamente.",
            justificativa:
              "A perda de bens ou o confisco de vantagens obtidas ilicitamente visa impedir que o crime seja economicamente compensador, retirando ao agente os proveitos auferidos através da atividade criminosa.",
          },
          {
            id: 14,
            pergunta:
              "A infiltração de organizações criminosas em setores económicos legais (como a construção civil ou a restauração) é frequentemente associada a:",
            opcoes: [
              "Uma estratégia de branqueamento de capitais e de legitimação da atividade criminosa perante a sociedade.",
              "Uma prática sem qualquer relação com o branqueamento de capitais.",
              "Uma total incapacidade de tais organizações de gerir negócios legais.",
              "Uma atividade exclusivamente filantrópica sem finalidade económica.",
            ],
            respostaCorreta: 0,
            dica: "Pense em como negócios legítimos podem servir para disfarçar dinheiro ilícito.",
            justificativa:
              "A infiltração de organizações criminosas em setores económicos legais está frequentemente associada a estratégias de branqueamento de capitais e à legitimação da atividade criminosa perante a sociedade.",
          },
          {
            id: 15,
            pergunta:
              "A cooperação judiciária internacional, em matéria de crime organizado e criminalidade económica, é especialmente relevante porque:",
            opcoes: [
              "Todos os países possuem exatamente as mesmas leis penais, sem qualquer necessidade de cooperação.",
              "A investigação destes crimes nunca envolve elementos de prova localizados no estrangeiro.",
              "Estes crimes frequentemente ultrapassam fronteiras nacionais, exigindo articulação entre diferentes sistemas de justiça.",
              "A cooperação internacional é juridicamente proibida em qualquer circunstância.",
            ],
            respostaCorreta: 2,
            dica: "Estes crimes frequentemente têm uma dimensão internacional, exigindo articulação entre países.",
            justificativa:
              "Dada a frequente dimensão transnacional do crime organizado e da criminalidade económica, a cooperação judiciária internacional é essencial para uma investigação e resposta penal eficazes.",
          },
        ],
      },

      {
        id: "criminalistica",
        nome: "Criminalística",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Criminalística, enquanto ciência auxiliar da investigação criminal, dedica-se, essencialmente, a:",
            opcoes: [
              "Estudar exclusivamente o comportamento social do criminoso.",
              "Aplicar métodos técnico-científicos à análise de vestígios materiais, com vista a esclarecer factos relacionados com um crime.",
              "Determinar diretamente a pena a aplicar ao condenado.",
              "Substituir totalmente o papel do Ministério Público.",
            ],
            respostaCorreta: 1,
            dica: "Foca-se na análise técnico-científica de vestígios materiais.",
            justificativa:
              "A Criminalística aplica métodos técnico-científicos à análise de vestígios materiais deixados num local de crime, contribuindo para o esclarecimento dos factos investigados.",
          },
          {
            id: 2,
            pergunta:
              "O princípio da 'troca' (ou princípio de Locard), fundamental para a Criminalística, afirma que:",
            opcoes: [
              "Não existe qualquer relação entre o agressor e a vítima em contexto de crime.",
              "Os vestígios materiais desaparecem imediatamente após o crime.",
              "Todo contacto entre dois elementos deixa vestígios recíprocos.",
              "Apenas impressões digitais têm valor probatório em qualquer investigação.",
            ],
            respostaCorreta: 2,
            dica: "É conhecido como 'princípio da troca': todo contacto deixa um vestígio.",
            justificativa:
              "O princípio de Locard estabelece que todo contacto entre dois elementos (pessoas, objetos, ambientes) deixa vestígios recíprocos, fundamento essencial da análise criminalística.",
          },
          {
            id: 3,
            pergunta:
              "A preservação do local de crime, na fase inicial da investigação, é fundamental porque:",
            opcoes: [
              "Permite que qualquer pessoa remova livremente objetos do local.",
              "É juridicamente irrelevante para o processo penal.",
              "Torna dispensável qualquer análise pericial posterior.",
              "Evita a contaminação ou perda de vestígios relevantes para a investigação.",
            ],
            respostaCorreta: 3,
            dica: "O objetivo é evitar que vestígios importantes se percam ou se contaminem.",
            justificativa:
              "A preservação adequada do local de crime é essencial para evitar a contaminação, alteração ou perda de vestígios relevantes que possam contribuir para o esclarecimento dos factos.",
          },
          {
            id: 4,
            pergunta:
              "A dactiloscopia, enquanto técnica criminalística clássica, baseia-se, principalmente, em:",
            opcoes: [
              "Análise de padrões papilares das impressões digitais, considerados individuais e permanentes.",
              "Análise exclusiva do sangue encontrado no local do crime.",
              "Estudo do comportamento verbal do suspeito.",
              "Reconstituição facial a partir de restos ósseos.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com impressões digitais e os seus padrões característicos.",
            justificativa:
              "A dactiloscopia baseia-se na análise dos padrões papilares das impressões digitais, considerados individuais, permanentes e imutáveis ao longo da vida da pessoa.",
          },
          {
            id: 5,
            pergunta:
              "A balística forense, como ramo da Criminalística, dedica-se, entre outros aspetos, a:",
            opcoes: [
              "Estudar exclusivamente documentos escritos.",
              "Analisar armas de fogo, projéteis e vestígios de disparo, contribuindo para a reconstituição de eventos.",
              "Analisar apenas substâncias tóxicas em amostras biológicas.",
              "Determinar diretamente a culpabilidade do suspeito, sem qualquer outra prova.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com armas de fogo e vestígios balísticos.",
            justificativa:
              "A balística forense dedica-se à análise técnica de armas de fogo, projéteis e vestígios de disparo, contribuindo para a reconstituição de eventos relacionados com o uso de armas.",
          },
          {
            id: 6,
            pergunta:
              "A análise de ADN, enquanto ferramenta criminalística, permite, entre outros aspetos:",
            opcoes: [
              "Determinar diretamente a intenção criminosa do agente.",
              "Substituir totalmente qualquer outra forma de prova no processo.",
              "Identificar indivíduos com elevado grau de precisão, a partir de vestígios biológicos.",
              "Ser aplicada exclusivamente em crimes de natureza patrimonial.",
            ],
            respostaCorreta: 2,
            dica: "É uma técnica de identificação de indivíduos a partir de material biológico.",
            justificativa:
              "A análise de ADN permite identificar indivíduos com elevado grau de precisão a partir de vestígios biológicos encontrados, sendo uma ferramenta fundamental na investigação criminal moderna.",
          },
          {
            id: 7,
            pergunta:
              "A tanatologia forense, enquanto área relacionada com a Criminalística e a Medicina Legal, dedica-se ao estudo:",
            opcoes: [
              "Dos fenómenos relacionados com a morte, incluindo a determinação da causa e da data provável do óbito.",
              "Exclusivamente de crimes económicos.",
              "Do comportamento de suspeitos vivos em interrogatório.",
              "Da reabilitação de reclusos em contexto prisional.",
            ],
            respostaCorreta: 0,
            dica: "O prefixo 'tanato-' remete para 'morte'.",
            justificativa:
              "A tanatologia forense dedica-se ao estudo dos fenómenos relacionados com a morte, incluindo a determinação da causa, da data provável do óbito e outras circunstâncias relevantes.",
          },
          {
            id: 8,
            pergunta:
              "A grafoscopia (ou exame documentoscópico), como técnica pericial, é utilizada, principalmente, para:",
            opcoes: [
              "Determinar a presença de substâncias tóxicas no organismo.",
              "Reconstituir a trajetória de um projétil de arma de fogo.",
              "Analisar vestígios biológicos deixados numa cena de crime.",
              "Analisar a autenticidade de assinaturas e documentos, identificando possíveis falsificações.",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se com a análise de escrita, assinaturas e documentos.",
            justificativa:
              "A grafoscopia (ou exame documentoscópico) analisa a autenticidade de assinaturas e documentos, identificando possíveis falsificações através de técnicas comparativas especializadas.",
          },
          {
            id: 9,
            pergunta:
              "A entomologia forense, enquanto ferramenta criminalística, utiliza o estudo de insetos para:",
            opcoes: [
              "Determinar exclusivamente a identidade civil da vítima.",
              "Estimar o intervalo pós-morte (tempo decorrido desde a morte) num cadáver.",
              "Analisar registos financeiros de uma empresa.",
              "Substituir totalmente a necessidade de autópsia médico-legal.",
            ],
            respostaCorreta: 1,
            dica: "O ciclo de vida de certos insetos ajuda a estimar há quanto tempo ocorreu a morte.",
            justificativa:
              "A entomologia forense utiliza o conhecimento sobre o ciclo de vida de insetos que colonizam cadáveres para estimar, com maior precisão, o intervalo pós-morte.",
          },
          {
            id: 10,
            pergunta:
              "A reconstituição do facto (ou reconstituição criminal) tem como principal objetivo:",
            opcoes: [
              "Substituir totalmente o depoimento de testemunhas presenciais.",
              "Impor automaticamente uma condenação ao suspeito.",
              "Simular, com base nas provas e vestígios disponíveis, a dinâmica provável de ocorrência do crime.",
              "Ser realizada sem qualquer base técnica ou científica.",
            ],
            respostaCorreta: 2,
            dica: "Procura recriar, com base em evidências, como o crime provavelmente ocorreu.",
            justificativa:
              "A reconstituição do facto visa simular, com base nas provas e vestígios disponíveis, a dinâmica provável de ocorrência do crime, contribuindo para o esclarecimento da investigação.",
          },
          {
            id: 11,
            pergunta:
              "A análise de vestígios de sangue (bloodstain pattern analysis), enquanto técnica criminalística, permite, entre outros aspetos:",
            opcoes: [
              "Inferir informações sobre a dinâmica do evento, como posição relativa dos envolvidos e tipo de agressão.",
              "Determinar automaticamente a nacionalidade da vítima.",
              "Substituir totalmente qualquer outro tipo de vestígio biológico.",
              "Ser aplicada apenas em crimes de natureza económica.",
            ],
            respostaCorreta: 0,
            dica: "Os padrões de sangue podem revelar detalhes sobre como o evento ocorreu.",
            justificativa:
              "A análise de padrões de manchas de sangue permite inferir informações relevantes sobre a dinâmica do evento, como a posição relativa dos envolvidos e o tipo de agressão sofrida.",
          },
          {
            id: 12,
            pergunta:
              "A informática forense, enquanto ramo especializado da Criminalística, dedica-se, principalmente, a:",
            opcoes: [
              "Criar novos programas informáticos para uso comercial.",
              "Substituir totalmente a necessidade de outras perícias criminalísticas.",
              "Analisar exclusivamente documentos em suporte de papel.",
              "Recolher, preservar e analisar dados eletrónicos com valor probatório, respeitando protocolos técnicos rigorosos.",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se com a análise técnica de dados eletrónicos com valor probatório.",
            justificativa:
              "A informática forense dedica-se à recolha, preservação e análise de dados eletrónicos com valor probatório, seguindo protocolos técnicos rigorosos para garantir a integridade da prova digital.",
          },
          {
            id: 13,
            pergunta:
              "O 'perfil geográfico' do criminoso, técnica utilizada em investigações de crimes em série, baseia-se, principalmente, em:",
            opcoes: [
              "Determinar exclusivamente características físicas do agressor.",
              "Analisar a localização espacial dos crimes cometidos para inferir a provável área de residência ou atuação do agente.",
              "Substituir totalmente qualquer outra técnica de investigação.",
              "Analisar apenas o perfil económico das vítimas.",
            ],
            respostaCorreta: 1,
            dica: "Foca-se na localização geográfica dos crimes, e não em características pessoais do agente.",
            justificativa:
              "O perfil geográfico analisa a distribuição espacial de uma série de crimes atribuídos ao mesmo autor, para inferir a provável área de residência ou de atuação habitual do agente.",
          },
          {
            id: 14,
            pergunta:
              "A garantia da cadeia de custódia é especialmente crítica na Criminalística porque:",
            opcoes: [
              "Permite que qualquer pessoa não autorizada manipule livremente os vestígios recolhidos.",
              "É totalmente dispensável na análise de vestígios digitais.",
              "Assegura que a prova recolhida no local do crime mantenha a sua integridade e validade até à apresentação em juízo.",
              "Serve apenas para fins de arquivo administrativo interno.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se diretamente com a integridade e a validade da prova ao longo do processo.",
            justificativa:
              "A cadeia de custódia é crítica na Criminalística porque assegura que a prova recolhida mantenha a sua integridade e validade técnica e jurídica, desde a recolha até a apresentação em juízo.",
          },
          {
            id: 15,
            pergunta:
              "A interpretação de vestígios de calçado ou pneus, enquanto técnica criminalística, pode contribuir, entre outros aspetos, para:",
            opcoes: [
              "Associar o vestígio a um modelo específico de calçado ou pneu, e, em certos casos, a um exemplar individual.",
              "Determinar automaticamente a identidade civil do suspeito.",
              "Substituir totalmente a análise de ADN em qualquer investigação.",
              "Ser irrelevante para qualquer processo de investigação criminal.",
            ],
            respostaCorreta: 0,
            dica: "Pode ajudar a associar o vestígio a um tipo específico, ou até a um exemplar individual.",
            justificativa:
              "A análise de vestígios de calçado ou pneus pode contribuir para associar o vestígio a um modelo específico e, nalguns casos, a características individualizadoras de um exemplar concreto.",
          },
        ],
      },
      {
        id: "criminologia-desenvolvimental",
        nome: "Criminologia Desenvolvimental",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Criminologia Desenvolvimental dedica-se, essencialmente, a:",
            opcoes: [
              "Estudar exclusivamente crimes económicos.",
              "Compreender o início, a continuidade e o abandono do comportamento antissocial ao longo do curso de vida.",
              "Analisar apenas fatores biológicos, excluindo qualquer influência social.",
              "Focar-se unicamente na fase adulta, ignorando a infância e a adolescência.",
            ],
            respostaCorreta: 1,
            dica: "O foco está na trajetória do comportamento antissocial ao longo da vida.",
            justificativa:
              "A Criminologia Desenvolvimental estuda o início, a continuidade e o abandono (desistência) do comportamento antissocial ao longo do curso de vida do indivíduo, considerando fatores de diferentes fases desenvolvimentais.",
          },
          {
            id: 2,
            pergunta:
              "A tipologia de Moffitt, que distingue trajetórias 'limitadas à adolescência' e 'persistentes ao longo da vida', propõe que:",
            opcoes: [
              "Todos os delinquentes seguem exatamente o mesmo padrão de trajetória criminal.",
              "A delinquência juvenil nunca cessa espontaneamente.",
              "Existem trajetórias distintas de comportamento antissocial, associadas a diferentes fatores e prognósticos.",
              "Não existe qualquer diferença relevante entre os padrões de início precoce e início tardio.",
            ],
            respostaCorreta: 2,
            dica: "A ideia central é que existem diferentes 'caminhos' possíveis, com diferentes causas e prognósticos.",
            justificativa:
              "A tipologia de Moffitt propõe a existência de trajetórias distintas de comportamento antissocial, com diferentes fatores associados e diferentes prognósticos de continuidade ao longo da vida.",
          },
          {
            id: 3,
            pergunta:
              "O conceito de 'pontos de viragem' (turning points), na perspetiva desenvolvimental de Sampson e Laub, refere-se a:",
            opcoes: [
              "Eventos ou circunstâncias de vida (como emprego estável ou casamento) capazes de alterar a trajetória criminal de um indivíduo.",
              "Um conceito exclusivamente biológico, sem qualquer influência social.",
              "A idade exata em que todo indivíduo inicia a atividade criminosa.",
              "Um fenómeno relevante apenas para crimes económicos.",
            ],
            respostaCorreta: 0,
            dica: "Pense em acontecimentos de vida que podem mudar o rumo da trajetória de uma pessoa.",
            justificativa:
              "O conceito de pontos de viragem refere-se a eventos ou circunstâncias significativas da vida adulta, como o emprego estável ou o casamento, capazes de contribuir para a alteração da trajetória criminal de um indivíduo.",
          },
          {
            id: 4,
            pergunta:
              "A desistência do crime (desistance), enquanto processo estudado pela Criminologia Desenvolvimental, é entendida, atualmente, como:",
            opcoes: [
              "Um evento súbito e instantâneo, sem qualquer processo prévio.",
              "Um fenómeno impossível de ocorrer em indivíduos com trajetória criminal persistente.",
              "Algo determinado exclusivamente por fatores genéticos.",
              "Um processo gradual, frequentemente associado a mudanças identitárias e de contexto social ao longo do tempo.",
            ],
            respostaCorreta: 3,
            dica: "Não é vista como um evento único, mas como um processo gradual.",
            justificativa:
              "A desistência do crime é atualmente entendida como um processo gradual, frequentemente associado a mudanças identitárias, sociais e de contexto ao longo do tempo, e não como um evento súbito.",
          },
          {
            id: 5,
            pergunta:
              "Os fatores de risco precoces, identificados por estudos longitudinais em Criminologia Desenvolvimental, incluem, entre outros:",
            opcoes: [
              "Exclusivamente fatores relacionados com a idade adulta.",
              "Problemas de comportamento na infância, práticas parentais inconsistentes e insucesso escolar precoce.",
              "Apenas fatores de natureza económica, sem qualquer relação com o comportamento infantil.",
              "Nenhum fator identificável antes da idade adulta.",
            ],
            respostaCorreta: 1,
            dica: "Pense em fatores identificáveis já na infância.",
            justificativa:
              "Estudos longitudinais identificam diversos fatores de risco precoces, como problemas de comportamento na infância, práticas parentais inconsistentes e insucesso escolar, associados a maior probabilidade de trajetórias antissociais.",
          },
          {
            id: 6,
            pergunta:
              "Os estudos longitudinais, metodologia central na Criminologia Desenvolvimental, caracterizam-se por:",
            opcoes: [
              "Recolher dados apenas num único momento, sem qualquer acompanhamento posterior.",
              "Focar-se exclusivamente em dados estatísticos oficiais de criminalidade.",
              "Acompanhar os mesmos indivíduos ao longo do tempo, permitindo observar mudanças e continuidades no comportamento.",
              "Ser aplicáveis apenas a estudos de curta duração, inferiores a um ano.",
            ],
            respostaCorreta: 2,
            dica: "O termo 'longitudinal' remete para acompanhamento ao longo do tempo.",
            justificativa:
              "Os estudos longitudinais acompanham os mesmos indivíduos ao longo de um período de tempo prolongado, permitindo observar mudanças e continuidades no comportamento antissocial ao longo do desenvolvimento.",
          },
          {
            id: 7,
            pergunta:
              "A relação entre comportamento antissocial precoce e delinquência posterior é, na literatura desenvolvimental, geralmente descrita como:",
            opcoes: [
              "Determinística, ou seja, toda criança com comportamento antissocial precoce tornar-se-á, obrigatoriamente, delinquente.",
              "Inexistente, sem qualquer relação estatística relevante.",
              "Relevante apenas em contextos socioeconómicos elevados.",
              "Probabilística, representando um fator de risco relevante, mas não uma inevitabilidade.",
            ],
            respostaCorreta: 3,
            dica: "Pense em 'fator de risco', e não em 'destino inevitável'.",
            justificativa:
              "A relação entre comportamento antissocial precoce e delinquência posterior é entendida como probabilística, constituindo um fator de risco relevante, mas não determinístico.",
          },
          {
            id: 8,
            pergunta:
              "A 'continuidade heterotípica' do comportamento antissocial refere-se a:",
            opcoes: [
              "A manutenção de um traço subjacente que se manifesta de formas diferentes consoante a fase de desenvolvimento.",
              "A repetição exatamente do mesmo comportamento específico ao longo de toda a vida.",
              "Um conceito exclusivo da criminalidade económica.",
              "A total ausência de qualquer continuidade comportamental ao longo do tempo.",
            ],
            respostaCorreta: 0,
            dica: "A manifestação muda de forma, mas o traço de base permanece.",
            justificativa:
              "A continuidade heterotípica refere-se à manutenção de um traço subjacente (por exemplo, dificuldades de autorregulação) que se manifesta de formas diferentes consoante a fase de desenvolvimento do indivíduo.",
          },
          {
            id: 9,
            pergunta:
              "A influência do grupo de pares na adolescência, segundo a perspetiva desenvolvimental, é frequentemente associada a:",
            opcoes: [
              "Nenhuma influência relevante sobre o comportamento antissocial.",
              "Um possível fator de risco ou de proteção, consoante as características do grupo de pares.",
              "Uma influência apenas positiva, nunca associada a comportamentos de risco.",
              "Um fator relevante apenas na fase adulta.",
            ],
            respostaCorreta: 1,
            dica: "O grupo de pares pode ser tanto um fator de risco quanto um fator protetor.",
            justificativa:
              "A influência do grupo de pares na adolescência pode constituir tanto um fator de risco quanto um fator de proteção, dependendo das características e do comportamento predominante do grupo.",
          },
          {
            id: 10,
            pergunta:
              "A abordagem do 'curso de vida' (life-course), na Criminologia Desenvolvimental, valoriza especialmente:",
            opcoes: [
              "A análise estática de um único momento da vida do indivíduo.",
              "Exclusivamente fatores biológicos determinantes desde o nascimento.",
              "A interação entre fatores individuais e contextuais ao longo de diferentes fases da vida.",
              "A irrelevância de qualquer mudança de comportamento ao longo do tempo.",
            ],
            respostaCorreta: 2,
            dica: "Foca-se na interação dinâmica entre indivíduo e contexto, ao longo de diferentes fases da vida.",
            justificativa:
              "A abordagem do curso de vida valoriza a análise da interação entre fatores individuais e contextuais ao longo de diferentes fases da vida, reconhecendo a possibilidade de mudança e continuidade.",
          },
          {
            id: 11,
            pergunta:
              "Os programas de intervenção precoce, orientados pela investigação desenvolvimental, justificam-se, principalmente, porque:",
            opcoes: [
              "Intervir nas fases iniciais do desenvolvimento pode reduzir a probabilidade de consolidação de trajetórias antissociais.",
              "Não existe qualquer evidência científica sobre a sua eficácia.",
              "São aplicáveis exclusivamente a adultos com longo histórico criminal.",
              "Substituem totalmente a necessidade de qualquer intervenção familiar.",
            ],
            respostaCorreta: 0,
            dica: "Intervir cedo pode evitar a consolidação de padrões antissociais mais graves.",
            justificativa:
              "Os programas de intervenção precoce justificam-se pela evidência de que atuar nas fases iniciais do desenvolvimento pode reduzir significativamente a probabilidade de consolidação de trajetórias antissociais.",
          },
          {
            id: 12,
            pergunta:
              "A relação entre autorregulação (autocontrolo) na infância e comportamento antissocial posterior é, segundo diversos estudos:",
            opcoes: [
              "Inexistente, sem qualquer relação estatisticamente relevante.",
              "Relevante apenas em contextos económicos privilegiados.",
              "Relevante, sendo o baixo autocontrolo associado a maior risco de comportamento antissocial ao longo da vida.",
              "Determinada exclusivamente por fatores ambientais, sem qualquer componente desenvolvimental.",
            ],
            respostaCorreta: 2,
            dica: "Pense na Teoria Geral do Crime, que associa baixo autocontrolo a maior risco de delinquência.",
            justificativa:
              "Diversos estudos, incluindo a Teoria Geral do Crime, associam níveis mais baixos de autorregulação/autocontrolo na infância a um maior risco de comportamento antissocial ao longo da vida.",
          },
          {
            id: 13,
            pergunta:
              "A investigação desenvolvimental sobre delinquência juvenil sublinha, entre outros aspetos, a importância de:",
            opcoes: [
              "Considerar múltiplos contextos (família, escola, pares, comunidade) na compreensão do comportamento antissocial.",
              "Analisar exclusivamente fatores individuais, ignorando qualquer contexto social.",
              "Ignorar completamente o papel da escola no desenvolvimento infantil.",
              "Focar-se apenas em fatores biológicos hereditários.",
            ],
            respostaCorreta: 0,
            dica: "A abordagem é ecológica: considera múltiplos contextos em interação.",
            justificativa:
              "A investigação desenvolvimental sublinha a importância de considerar múltiplos contextos, como a família, a escola, o grupo de pares e a comunidade, na compreensão do comportamento antissocial.",
          },
          {
            id: 14,
            pergunta:
              "O conceito de 'cascata desenvolvimental' refere-se, na Criminologia Desenvolvimental, a:",
            opcoes: [
              "Um evento único e isolado, sem qualquer relação com fases anteriores do desenvolvimento.",
              "Um processo em que dificuldades numa fase do desenvolvimento aumentam a probabilidade de novas dificuldades em fases posteriores.",
              "Um conceito aplicável apenas à criminalidade económica.",
              "A ausência total de qualquer relação entre diferentes fases da vida.",
            ],
            respostaCorreta: 1,
            dica: "Pense num efeito em cadeia: uma dificuldade leva a outra, numa sequência ao longo do desenvolvimento.",
            justificativa:
              "O conceito de cascata desenvolvimental descreve um processo em que dificuldades numa determinada fase do desenvolvimento aumentam a probabilidade de surgirem novas dificuldades em fases posteriores.",
          },
          {
            id: 15,
            pergunta:
              "A avaliação de risco em contexto de justiça juvenil, informada pela Criminologia Desenvolvimental, deve considerar, entre outros aspetos:",
            opcoes: [
              "Exclusivamente a gravidade abstrata do delito praticado.",
              "Apenas a idade cronológica do jovem, sem qualquer outro fator.",
              "A ausência de qualquer relação com fatores familiares ou sociais.",
              "O estádio de desenvolvimento do jovem, os fatores de risco e de proteção presentes no seu contexto de vida.",
            ],
            respostaCorreta: 3,
            dica: "Deve considerar o desenvolvimento do jovem e o conjunto de fatores de risco e proteção presentes.",
            justificativa:
              "A avaliação de risco em contexto de justiça juvenil deve considerar o estádio de desenvolvimento do jovem e o conjunto de fatores de risco e de proteção presentes no seu contexto de vida, e não apenas a gravidade do delito.",
          },
        ],
      },
      {
        id: "intervencao-comportamentos-antissociais-delinquentes",
        nome: "Intervenção nos Comportamentos Antissociais e Delinquentes",
        questoes: [
          {
            id: 1,
            pergunta:
              "A intervenção baseada em evidência, no âmbito dos comportamentos antissociais, caracteriza-se por:",
            opcoes: [
              "Utilizar exclusivamente a intuição do profissional, sem qualquer suporte empírico.",
              "Basear-se em programas cuja eficácia foi comprovada através de investigação científica rigorosa.",
              "Aplicar sempre o mesmo programa, independentemente do perfil do sujeito.",
              "Ignorar completamente os resultados de investigações anteriores.",
            ],
            respostaCorreta: 1,
            dica: "O termo 'baseada em evidência' remete diretamente para investigação científica.",
            justificativa:
              "A intervenção baseada em evidência fundamenta-se em programas cuja eficácia foi comprovada através de investigação científica rigorosa, aumentando a probabilidade de resultados positivos.",
          },
          {
            id: 2,
            pergunta:
              "O treino de competências parentais, enquanto estratégia de intervenção em comportamentos antissociais infantis, visa, principalmente:",
            opcoes: [
              "Substituir totalmente o papel dos pais na educação da criança.",
              "Aumentar o uso de punições físicas como principal estratégia educativa.",
              "Fortalecer práticas educativas consistentes e positivas, reduzindo fatores de risco associados ao comportamento disruptivo.",
              "Ser aplicado exclusivamente a famílias de nível socioeconómico elevado.",
            ],
            respostaCorreta: 2,
            dica: "O foco é fortalecer competências educativas positivas dos pais.",
            justificativa:
              "O treino de competências parentais visa fortalecer práticas educativas consistentes e positivas, reduzindo fatores de risco associados ao comportamento disruptivo infantil.",
          },
          {
            id: 3,
            pergunta:
              "As terapias cognitivo-comportamentais, aplicadas a jovens com comportamento antissocial, procuram, principalmente:",
            opcoes: [
              "Identificar e modificar padrões de pensamento e comportamento associados à conduta antissocial.",
              "Ignorar completamente os pensamentos do jovem, focando-se apenas no comportamento observável.",
              "Substituir totalmente qualquer forma de acompanhamento familiar.",
              "Ser aplicadas exclusivamente em contexto de internamento.",
            ],
            respostaCorreta: 0,
            dica: "Atua tanto sobre pensamentos quanto sobre comportamentos.",
            justificativa:
              "As terapias cognitivo-comportamentais procuram identificar e modificar padrões de pensamento distorcidos e comportamentos associados à conduta antissocial, promovendo alternativas mais adaptativas.",
          },
          {
            id: 4,
            pergunta:
              "Os programas multissistémicos de intervenção familiar, no tratamento de comportamentos antissociais graves em jovens, caracterizam-se por:",
            opcoes: [
              "Focar-se exclusivamente no jovem, isolado do seu contexto familiar e social.",
              "Excluir totalmente a participação da escola no processo de intervenção.",
              "Aplicar-se apenas a crianças com idade inferior a cinco anos.",
              "Intervir simultaneamente em diferentes contextos da vida do jovem, como família, escola e comunidade.",
            ],
            respostaCorreta: 3,
            dica: "Envolvem múltiplos sistemas em torno do jovem, não apenas o próprio indivíduo isoladamente.",
            justificativa:
              "Os programas multissistémicos intervêm simultaneamente em diferentes contextos da vida do jovem, como a família, a escola e a comunidade, reconhecendo a natureza multidimensional do problema.",
          },
          {
            id: 5,
            pergunta:
              "A gestão de contingências, enquanto técnica comportamental utilizada em programas de intervenção, baseia-se, essencialmente, em:",
            opcoes: [
              "Aplicar exclusivamente punições físicas ao comportamento indesejado.",
              "Reforçar sistematicamente comportamentos positivos e reduzir o reforço de comportamentos problemáticos.",
              "Ignorar completamente qualquer comportamento manifestado pelo indivíduo.",
              "Ser aplicável apenas em contexto prisional.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com o uso sistemático de reforços para modelar comportamento.",
            justificativa:
              "A gestão de contingências baseia-se na aplicação sistemática de reforços a comportamentos positivos e na redução do reforço a comportamentos problemáticos, promovendo mudança comportamental gradual.",
          },
          {
            id: 6,
            pergunta:
              "A avaliação funcional do comportamento, utilizada frequentemente em contexto escolar e clínico, tem como objetivo:",
            opcoes: [
              "Determinar automaticamente a punição adequada, sem qualquer análise prévia.",
              "Substituir totalmente a necessidade de qualquer intervenção terapêutica.",
              "Identificar os antecedentes e as consequências que mantêm um determinado comportamento problemático.",
              "Ser aplicada exclusivamente a comportamentos de natureza académica.",
            ],
            respostaCorreta: 2,
            dica: "Foca-se em identificar 'o quê' antecede e 'o quê' mantém o comportamento problemático.",
            justificativa:
              "A avaliação funcional do comportamento visa identificar os antecedentes e as consequências que mantêm um comportamento problemático, orientando a intervenção mais adequada a cada caso.",
          },
          {
            id: 7,
            pergunta:
              "Os programas de competências sociais, direcionados a jovens com comportamento antissocial, procuram desenvolver, entre outras, competências de:",
            opcoes: [
              "Resolução de conflitos, empatia e comunicação assertiva.",
              "Isolamento social prolongado.",
              "Evitamento total de qualquer interação social.",
              "Confronto físico como principal forma de resolução de problemas.",
            ],
            respostaCorreta: 0,
            dica: "O foco é desenvolver competências positivas de relacionamento interpessoal.",
            justificativa:
              "Os programas de competências sociais visam desenvolver capacidades como a resolução de conflitos, a empatia e a comunicação assertiva, reduzindo a probabilidade de recurso a comportamentos antissociais.",
          },
          {
            id: 8,
            pergunta:
              "A mentoria (mentoring), enquanto estratégia de intervenção junto de jovens em risco, caracteriza-se por:",
            opcoes: [
              "Substituir totalmente a necessidade de qualquer acompanhamento familiar.",
              "Ser aplicada exclusivamente em contexto prisional.",
              "Envolver, necessariamente, apenas profissionais de saúde mental.",
              "Estabelecer uma relação de apoio contínuo entre um jovem e um adulto de referência, com efeitos positivos potenciais no seu desenvolvimento.",
            ],
            respostaCorreta: 3,
            dica: "Envolve uma relação de acompanhamento próximo entre um adulto de referência e o jovem.",
            justificativa:
              "A mentoria estabelece uma relação de apoio contínuo entre um jovem e um adulto de referência, podendo ter efeitos positivos no seu desenvolvimento e na redução de fatores de risco.",
          },
          {
            id: 9,
            pergunta:
              "A intervenção em contexto escolar, dirigida à prevenção de comportamentos antissociais, pode incluir, entre outras medidas:",
            opcoes: [
              "Exclusão automática e definitiva de qualquer aluno com comportamento disruptivo.",
              "Programas antibullying, promoção de clima escolar positivo e desenvolvimento de competências socioemocionais.",
              "Ausência total de qualquer regra ou estrutura escolar.",
              "Ignorar completamente sinais precoces de dificuldades comportamentais.",
            ],
            respostaCorreta: 1,
            dica: "Foca-se em prevenção positiva, e não em exclusão automática do aluno.",
            justificativa:
              "A intervenção escolar preventiva pode incluir programas antibullying, promoção de um clima escolar positivo e o desenvolvimento de competências socioemocionais nos alunos.",
          },
          {
            id: 10,
            pergunta:
              "Os programas de intervenção em meio prisional, dirigidos a jovens infratores, procuram, entre outros objetivos:",
            opcoes: [
              "Isolar totalmente o jovem de qualquer contacto humano.",
              "Substituir totalmente a necessidade de qualquer processo judicial.",
              "Trabalhar competências cognitivas, emocionais e sociais, preparando o jovem para uma reintegração positiva.",
              "Ignorar completamente as necessidades específicas dos jovens em relação aos adultos.",
            ],
            respostaCorreta: 2,
            dica: "O foco é preparar o jovem para uma reintegração positiva, respeitando a sua especificidade etária.",
            justificativa:
              "Os programas de intervenção com jovens infratores em contexto institucional procuram trabalhar competências cognitivas, emocionais e sociais, preparando-os para uma reintegração social positiva.",
          },
          {
            id: 11,
            pergunta:
              "A eficácia de um programa de intervenção em comportamentos antissociais é habitualmente avaliada, entre outros indicadores, através de:",
            opcoes: [
              "Redução da reincidência e melhoria de indicadores comportamentais, sociais ou académicos do participante.",
              "Aumento automático do número de participantes inscritos no programa.",
              "Custo financeiro do programa, exclusivamente.",
              "Popularidade do programa nas redes sociais.",
            ],
            respostaCorreta: 0,
            dica: "Pense em resultados concretos relacionados com o comportamento do participante.",
            justificativa:
              "A eficácia de um programa de intervenção é habitualmente avaliada através de indicadores como a redução da reincidência e a melhoria de aspetos comportamentais, sociais ou académicos do participante.",
          },
          {
            id: 12,
            pergunta:
              "A abordagem integrada de intervenção (envolvendo escola, família, saúde e justiça) é valorizada, principalmente, porque:",
            opcoes: [
              "Torna o processo de intervenção desnecessariamente mais lento, sem qualquer benefício.",
              "Elimina totalmente a necessidade de avaliação individual do jovem.",
              "É aplicável apenas em contextos rurais.",
              "O comportamento antissocial é frequentemente multideterminado, exigindo respostas articuladas entre diferentes áreas.",
            ],
            respostaCorreta: 3,
            dica: "O comportamento antissocial tem múltiplas causas, por isso exige respostas de múltiplas áreas.",
            justificativa:
              "Dado o carácter multideterminado do comportamento antissocial, a abordagem integrada entre escola, família, saúde e justiça é valorizada por permitir respostas mais articuladas e eficazes.",
          },
          {
            id: 13,
            pergunta:
              "A motivação para a mudança, enquanto fator relevante na intervenção com jovens delinquentes, pode ser trabalhada através de:",
            opcoes: [
              "Imposição autoritária de mudanças, sem qualquer diálogo com o jovem.",
              "Técnicas de entrevista motivacional, que exploram ambivalências e reforçam a autonomia do próprio jovem.",
              "Ausência total de qualquer envolvimento do jovem no processo.",
              "Ignorar completamente os objetivos pessoais do jovem.",
            ],
            respostaCorreta: 1,
            dica: "A entrevista motivacional trabalha com a própria motivação interna do jovem, sem imposições.",
            justificativa:
              "A entrevista motivacional é uma técnica que explora as ambivalências do jovem em relação à mudança, reforçando a sua autonomia e motivação intrínseca para adotar comportamentos mais adaptativos.",
          },
          {
            id: 14,
            pergunta:
              "A intervenção com base no modelo RNR (Risco-Necessidade-Responsividade), aplicada a jovens delinquentes, defende que:",
            opcoes: [
              "Todos os jovens devem receber exatamente a mesma intensidade e tipo de intervenção.",
              "O risco de reincidência é irrelevante para o planeamento da intervenção.",
              "A intensidade da intervenção deve corresponder ao nível de risco, e o conteúdo deve focar as necessidades criminógenas específicas.",
              "As necessidades criminógenas nunca devem ser consideradas na intervenção.",
            ],
            respostaCorreta: 2,
            dica: "Recorde o significado das siglas: Risco, Necessidade e Responsividade.",
            justificativa:
              "O modelo RNR defende que a intensidade da intervenção deve corresponder ao nível de risco do jovem e que o conteúdo deve focar-se nas necessidades criminógenas específicas identificadas em cada caso.",
          },
          {
            id: 15,
            pergunta:
              "A continuidade da intervenção após a saída de um jovem de um programa institucional (follow-up) é importante, principalmente, porque:",
            opcoes: [
              "Permite consolidar os ganhos obtidos e apoiar a transição para a vida em comunidade, reduzindo o risco de recaída.",
              "É juridicamente proibida em qualquer sistema de justiça juvenil.",
              "Substitui totalmente a necessidade de qualquer intervenção anterior.",
              "É irrelevante para o sucesso do processo de reabilitação.",
            ],
            respostaCorreta: 0,
            dica: "O acompanhamento posterior ajuda a manter os resultados obtidos e a apoiar a transição.",
            justificativa:
              "O acompanhamento pós-intervenção (follow-up) permite consolidar os ganhos obtidos durante o programa e apoiar a transição do jovem para a vida em comunidade, reduzindo o risco de recaída.",
          },
        ],
      },
      {
        id: "medicina-legal",
        nome: "Medicina Legal",
        questoes: [
          {
            id: 1,
            pergunta:
              "A Medicina Legal, enquanto especialidade médica, dedica-se, essencialmente, a:",
            opcoes: [
              "Substituir totalmente a atuação do juiz na decisão de um processo.",
              "Aplicar conhecimentos médicos à resolução de questões de natureza jurídica.",
              "Tratar exclusivamente doenças infecciosas em contexto hospitalar.",
              "Determinar diretamente a pena a aplicar a um condenado.",
            ],
            respostaCorreta: 1,
            dica: "Aplica conhecimento médico para responder a questões jurídicas.",
            justificativa:
              "A Medicina Legal aplica conhecimentos médicos e científicos à resolução de questões de natureza jurídica, servindo de auxílio técnico ao sistema de justiça.",
          },
          {
            id: 2,
            pergunta: "A autópsia médico-legal tem como principais objetivos:",
            opcoes: [
              "Substituir totalmente qualquer investigação criminal.",
              "Determinar exclusivamente a idade da vítima.",
              "Ser realizada apenas em casos de morte natural.",
              "Determinar a causa e as circunstâncias da morte, quando exigido por lei ou por decisão judicial.",
            ],
            respostaCorreta: 3,
            dica: "O foco central é esclarecer a causa e as circunstâncias da morte.",
            justificativa:
              "A autópsia médico-legal tem como principal objetivo determinar a causa e as circunstâncias da morte, especialmente em casos de morte violenta, suspeita ou de causa desconhecida.",
          },
          {
            id: 3,
            pergunta:
              "A tanatocronologia, ramo da Medicina Legal, dedica-se a:",
            opcoes: [
              "Estimar o tempo decorrido desde a morte, com base em sinais cadavéricos específicos.",
              "Analisar exclusivamente crimes económicos.",
              "Determinar a identidade civil de uma pessoa viva.",
              "Substituir totalmente a necessidade de perícia toxicológica.",
            ],
            respostaCorreta: 0,
            dica: "O prefixo 'crono-' remete para tempo.",
            justificativa:
              "A tanatocronologia dedica-se à estimativa do tempo decorrido desde a morte, com base em sinais cadavéricos como o arrefecimento, a rigidez e as manchas de hipóstase, entre outros.",
          },
          {
            id: 4,
            pergunta:
              "Os sinais cadavéricos tardios (como a putrefação) são relevantes na Medicina Legal porque:",
            opcoes: [
              "Não têm qualquer utilidade para a investigação médico-legal.",
              "Auxiliam na estimativa de intervalos de tempo mais alargados desde a morte.",
              "Determinam automaticamente a identidade da vítima.",
              "Substituem totalmente qualquer outro tipo de exame pericial.",
            ],
            respostaCorreta: 1,
            dica: "São particularmente úteis quando já passou algum tempo desde a morte.",
            justificativa:
              "Os sinais cadavéricos tardios, como a putrefação, são especialmente relevantes para auxiliar na estimativa de intervalos de tempo mais alargados desde a ocorrência da morte.",
          },
          {
            id: 5,
            pergunta:
              "A toxicologia forense, enquanto ramo da Medicina Legal, dedica-se, principalmente, a:",
            opcoes: [
              "Determinar exclusivamente lesões traumáticas visíveis.",
              "Analisar apenas documentos escritos suspeitos de falsificação.",
              "Identificar e quantificar substâncias tóxicas, drogas ou medicamentos em amostras biológicas, relevantes para investigações forenses.",
              "Substituir totalmente a autópsia médico-legal.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com a identificação de substâncias tóxicas ou drogas no organismo.",
            justificativa:
              "A toxicologia forense dedica-se à identificação e quantificação de substâncias tóxicas, drogas ou medicamentos em amostras biológicas, contribuindo para o esclarecimento de investigações forenses.",
          },
          {
            id: 6,
            pergunta:
              "O exame de sanidade mental, realizado em contexto forense, tem como principal objetivo:",
            opcoes: [
              "Avaliar a capacidade de imputabilidade e a compreensão do caráter ilícito do facto por parte do examinado.",
              "Determinar diretamente a pena a ser aplicada ao réu.",
              "Substituir totalmente qualquer avaliação psicológica complementar.",
              "Ser realizado exclusivamente após a condenação definitiva.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com a avaliação da imputabilidade penal do examinado.",
            justificativa:
              "O exame de sanidade mental visa avaliar a capacidade de imputabilidade do examinado e a sua compreensão do carácter ilícito do facto praticado, subsidiando a decisão judicial.",
          },
          {
            id: 7,
            pergunta:
              "A perícia de lesões corporais (exame de ofensas à integridade física) deve, entre outros aspetos, avaliar:",
            opcoes: [
              "Exclusivamente a personalidade da vítima.",
              "Apenas a situação financeira do agressor.",
              "A opinião subjetiva do examinador, sem qualquer critério técnico.",
              "A natureza, a extensão e a gravidade das lesões sofridas, bem como o mecanismo provável de produção.",
            ],
            respostaCorreta: 3,
            dica: "Foca-se em características técnicas objetivas das lesões.",
            justificativa:
              "A perícia de lesões corporais deve avaliar tecnicamente a natureza, a extensão e a gravidade das lesões sofridas, bem como o mecanismo provável de produção, com relevância para o processo penal.",
          },
          {
            id: 8,
            pergunta:
              "A determinação da idade biológica, em contexto médico-legal, é especialmente relevante, entre outros casos, quando:",
            opcoes: [
              "A idade civil está sempre corretamente documentada, sem qualquer dúvida.",
              "Existem dúvidas sobre a idade civil de um indivíduo, com implicações jurídicas relevantes (por exemplo, imputabilidade penal).",
              "Não existe qualquer relevância jurídica associada à idade do indivíduo.",
              "É aplicável exclusivamente a casos de criminalidade económica.",
            ],
            respostaCorreta: 1,
            dica: "É especialmente útil quando há incerteza sobre a idade civil real de alguém.",
            justificativa:
              "A determinação da idade biológica é relevante em casos de dúvida sobre a idade civil de um indivíduo, com implicações jurídicas relevantes, como, por exemplo, questões de imputabilidade penal.",
          },
          {
            id: 9,
            pergunta:
              "A perícia médico-legal em casos de agressão sexual deve, entre outros cuidados, priorizar:",
            opcoes: [
              "A rapidez do exame, independentemente do impacto emocional na vítima.",
              "A exclusão total de qualquer contacto com a vítima.",
              "A recolha rigorosa de vestígios biológicos, com respeito pela dignidade e pelo bem-estar da vítima.",
              "A ausência de qualquer protocolo técnico específico.",
            ],
            respostaCorreta: 2,
            dica: "Deve equilibrar rigor técnico com o respeito pela pessoa examinada.",
            justificativa:
              "A perícia médico-legal em casos de agressão sexual deve priorizar a recolha rigorosa de vestígios biológicos, sempre com respeito pela dignidade, pelo consentimento informado e pelo bem-estar psicológico da vítima.",
          },
          {
            id: 10,
            pergunta:
              "A antropologia forense, ramo relacionado com a Medicina Legal, dedica-se, principalmente, a:",
            opcoes: [
              "Analisar restos ósseos humanos para fins de identificação e determinação de características biológicas.",
              "Analisar exclusivamente documentos financeiros suspeitos.",
              "Substituir totalmente a necessidade de análise de ADN em qualquer caso.",
              "Determinar diretamente a culpabilidade de um suspeito.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com a análise de restos ósseos humanos.",
            justificativa:
              "A antropologia forense dedica-se à análise de restos ósseos humanos, com vista à identificação da vítima e à determinação de características biológicas como sexo, idade e estatura estimada.",
          },
          {
            id: 11,
            pergunta:
              "A avaliação do dano corporal (incapacidade permanente ou temporária) em contexto médico-legal serve, principalmente, para:",
            opcoes: [
              "Substituir totalmente a decisão judicial sobre a culpabilidade.",
              "Fundamentar tecnicamente decisões relativas à responsabilidade civil e/ou penal e à eventual reparação devida.",
              "Determinar diretamente o valor da pena de prisão a aplicar.",
              "Ser irrelevante para efeitos de indemnização à vítima.",
            ],
            respostaCorreta: 1,
            dica: "Fundamenta tecnicamente decisões sobre responsabilidade e eventual reparação.",
            justificativa:
              "A avaliação do dano corporal fornece fundamentação técnica relevante para decisões relativas à responsabilidade civil e/ou penal, bem como à eventual reparação devida à vítima.",
          },
          {
            id: 12,
            pergunta:
              "A identificação de vítimas em situações de catástrofe (identificação de vítimas de desastres, DVI) baseia-se, entre outros métodos, em:",
            opcoes: [
              "Exclusivamente na opinião não técnica de familiares.",
              "Ausência total de qualquer metodologia científica padronizada.",
              "Análise exclusiva de documentos financeiros das vítimas.",
              "Comparação de dados antemortem e postmortem, incluindo registos dentários, impressões digitais e análise de ADN.",
            ],
            respostaCorreta: 3,
            dica: "Envolve comparação de dados antes e depois da morte, através de vários métodos técnicos.",
            justificativa:
              "A identificação de vítimas em situações de catástrofe baseia-se na comparação sistemática de dados antemortem e postmortem, utilizando métodos como registos dentários, impressões digitais e análise de ADN.",
          },
          {
            id: 13,
            pergunta:
              "A perícia médico-legal em contexto de violência doméstica deve, entre outros aspetos, documentar:",
            opcoes: [
              "Exclusivamente aspetos económicos do agregado familiar.",
              "As lesões físicas presentes, o mecanismo provável de produção e o eventual impacto psicológico associado, sempre que aplicável.",
              "Apenas a opinião pessoal do perito, sem qualquer registo técnico das lesões.",
              "A ausência de qualquer lesão, independentemente do relato da vítima.",
            ],
            respostaCorreta: 1,
            dica: "Deve documentar tecnicamente lesões, mecanismo de produção e, quando relevante, o impacto psicológico.",
            justificativa:
              "A perícia médico-legal em casos de violência doméstica deve documentar tecnicamente as lesões físicas presentes, o mecanismo provável de produção e, quando relevante, o impacto psicológico associado à vítima.",
          },
          {
            id: 14,
            pergunta:
              "O sigilo profissional do médico legista, em relação aos dados obtidos durante uma perícia, deve, em regra:",
            opcoes: [
              "Ser totalmente inexistente, podendo o perito divulgar livremente qualquer informação.",
              "Aplicar-se apenas a casos de criminalidade económica.",
              "Ser respeitado, salvo nos limites legais que impõem a comunicação de informação relevante às autoridades competentes.",
              "Impedir totalmente a apresentação de laudos periciais em juízo.",
            ],
            respostaCorreta: 2,
            dica: "Existe um dever de sigilo, mas com limites legais definidos.",
            justificativa:
              "O sigilo profissional do médico legista deve, em regra, ser respeitado, existindo, contudo, limites legais que impõem a comunicação de informação relevante às autoridades competentes, no âmbito da sua função pericial.",
          },
          {
            id: 15,
            pergunta:
              "A Medicina Legal, ao articular-se com o Direito, contribui, essencialmente, para:",
            opcoes: [
              "Substituir totalmente a função do julgador.",
              "Determinar diretamente a inocência ou culpabilidade do réu, sem qualquer outra prova.",
              "Ser aplicável exclusivamente em processos de natureza civil.",
              "Fornecer fundamentação técnico-científica que apoia decisões judiciais em matérias que exigem conhecimento médico especializado.",
            ],
            respostaCorreta: 3,
            dica: "Fornece fundamentação técnica, mas não substitui a decisão do juiz.",
            justificativa:
              "A Medicina Legal contribui, essencialmente, para fornecer fundamentação técnico-científica que apoia decisões judiciais em matérias que exigem conhecimento médico especializado, sem substituir a função do julgador.",
          },
        ],
      },
      {
        id: "modelos-de-policia",
        nome: "Modelos de Polícia",
        questoes: [
          {
            id: 1,
            pergunta:
              "O modelo de 'policiamento tradicional' (ou reativo) caracteriza-se, essencialmente, por:",
            opcoes: [
              "Ausência total de patrulhamento em qualquer contexto.",
              "Foco na resposta a ocorrências já registadas, com menor ênfase na prevenção estruturada.",
              "Substituição total das forças policiais por entidades privadas.",
              "Prioridade absoluta à prevenção comunitária, sem qualquer resposta a ocorrências.",
            ],
            respostaCorreta: 1,
            dica: "É um modelo mais centrado em reagir a ocorrências já registadas.",
            justificativa:
              "O policiamento tradicional (ou reativo) caracteriza-se pelo foco na resposta a ocorrências já registadas, com menor ênfase numa abordagem preventiva estruturada.",
          },
          {
            id: 2,
            pergunta:
              "O modelo de 'policiamento comunitário' (community policing) enfatiza, principalmente:",
            opcoes: [
              "O isolamento total da polícia em relação à população.",
              "A utilização exclusiva de meios repressivos, sem qualquer diálogo com a comunidade.",
              "A construção de parcerias entre polícia e comunidade, valorizando a prevenção e a resolução colaborativa de problemas locais.",
              "A eliminação de qualquer forma de patrulhamento a pé.",
            ],
            respostaCorreta: 2,
            dica: "O nome do modelo remete para uma forte ligação com a comunidade local.",
            justificativa:
              "O policiamento comunitário enfatiza a construção de parcerias entre polícia e comunidade, valorizando a prevenção, o diálogo e a resolução colaborativa de problemas locais de segurança.",
          },
          {
            id: 3,
            pergunta:
              "O policiamento orientado para a resolução de problemas (problem-oriented policing) distingue-se por:",
            opcoes: [
              "Analisar causas subjacentes a padrões recorrentes de criminalidade, desenvolvendo respostas específicas e sustentáveis.",
              "Reagir exclusivamente a incidentes pontuais, sem qualquer análise de padrões.",
              "Ignorar totalmente a colaboração com outras entidades.",
              "Focar-se apenas em operações de grande escala, sem qualquer intervenção local.",
            ],
            respostaCorreta: 0,
            dica: "O foco está na análise de causas de problemas recorrentes, e não em reações isoladas.",
            justificativa:
              "O policiamento orientado para a resolução de problemas caracteriza-se pela análise das causas subjacentes a padrões recorrentes de criminalidade, procurando respostas específicas e sustentáveis.",
          },
          {
            id: 4,
            pergunta:
              "O modelo de 'policiamento orientado por informações' (intelligence-led policing) baseia-se, principalmente, em:",
            opcoes: [
              "Ignorar completamente qualquer forma de análise de dados na atuação policial.",
              "Basear-se exclusivamente na intuição individual dos agentes, sem qualquer análise técnica.",
              "Aplicar-se apenas a crimes de natureza patrimonial de pequena escala.",
              "Utilizar análise de dados e informações para orientar de forma estratégica a alocação de recursos e as prioridades operacionais.",
            ],
            respostaCorreta: 3,
            dica: "O nome já indica: 'informações' orientam as decisões estratégicas.",
            justificativa:
              "O policiamento orientado por informações (intelligence-led policing) baseia-se na análise sistemática de dados para orientar estrategicamente a alocação de recursos e as prioridades operacionais da polícia.",
          },
          {
            id: 5,
            pergunta:
              "A abordagem 'tolerância zero', enquanto modelo de policiamento, fundamenta-se, essencialmente, na ideia de que:",
            opcoes: [
              "Nenhuma infração, por menor que seja, deve ser sequer registada pela polícia.",
              "Pequenos sinais de desordem urbana podem contribuir para a escalada de criminalidade mais grave, exigindo repressão rigorosa mesmo de infrações menores.",
              "A polícia deve ignorar completamente pequenas infrações, focando-se apenas em crimes graves.",
              "É um modelo idêntico ao policiamento comunitário, sem qualquer diferença relevante.",
            ],
            respostaCorreta: 1,
            dica: "Está associada à Teoria das Janelas Partidas.",
            justificativa:
              "A abordagem de tolerância zero fundamenta-se na ideia, associada à Teoria das Janelas Partidas, de que pequenos sinais de desordem podem contribuir para a escalada de criminalidade mais grave, justificando repressão rigorosa de pequenas infrações.",
          },
          {
            id: 6,
            pergunta:
              "O 'policiamento de proximidade', enquanto estratégia frequentemente associada ao modelo comunitário, caracteriza-se por:",
            opcoes: [
              "Ausência total de qualquer contacto entre a polícia e a comunidade.",
              "Concentração exclusiva de recursos em operações de grande escala.",
              "Maior contacto direto e regular entre agentes policiais e a população local.",
              "Eliminação de qualquer forma de patrulhamento visível.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com maior proximidade e contacto regular com a comunidade.",
            justificativa:
              "O policiamento de proximidade caracteriza-se pelo contacto direto e regular entre agentes policiais e a população local, favorecendo a confiança mútua e a prevenção colaborativa.",
          },
          {
            id: 7,
            pergunta:
              "A accountability (prestação de contas) da atividade policial é relevante porque:",
            opcoes: [
              "Contribui para a transparência, o controlo democrático e a confiança pública na atuação policial.",
              "É irrelevante para a legitimidade da atuação policial.",
              "Substitui totalmente a necessidade de formação técnica dos agentes.",
              "Deve ser aplicada exclusivamente em contextos de criminalidade económica.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com transparência e controlo democrático sobre a atividade policial.",
            justificativa:
              "A prestação de contas (accountability) da atividade policial contribui significativamente para a transparência, o controlo democrático e a confiança pública na atuação das forças de segurança.",
          },
          {
            id: 8,
            pergunta:
              "Os modelos de polícia militarizada, presentes em determinados contextos, são frequentemente discutidos em razão de:",
            opcoes: [
              "Não gerarem qualquer debate académico ou social.",
              "Serem universalmente aceites como o modelo ideal em qualquer contexto.",
              "Excluírem totalmente qualquer forma de treino especializado.",
              "Tensões entre eficácia operacional em contextos de elevado risco e o potencial impacto na relação de confiança com a comunidade.",
            ],
            respostaCorreta: 3,
            dica: "Existe uma tensão entre eficácia em situações de risco e a relação de confiança com a comunidade.",
            justificativa:
              "Os modelos de polícia militarizada geram frequentemente debate em razão da tensão entre a sua eficácia operacional em contextos de elevado risco e o potencial impacto negativo na relação de confiança com a comunidade.",
          },
          {
            id: 9,
            pergunta:
              "A formação contínua dos agentes policiais, em áreas como direitos humanos e gestão de conflitos, é relevante porque:",
            opcoes: [
              "É totalmente dispensável em qualquer modelo de policiamento.",
              "Contribui para uma atuação mais qualificada, proporcional e respeitadora dos direitos fundamentais.",
              "Reduz automaticamente a eficácia operacional das forças de segurança.",
              "Aplica-se exclusivamente a investigações de crime económico.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com uma atuação mais qualificada e respeitadora de direitos fundamentais.",
            justificativa:
              "A formação contínua dos agentes policiais em áreas como direitos humanos e gestão de conflitos contribui para uma atuação mais qualificada, proporcional e respeitadora dos direitos fundamentais dos cidadãos.",
          },
          {
            id: 10,
            pergunta:
              "O modelo de 'polícia de proximidade orientada para dados' combina, essencialmente:",
            opcoes: [
              "Exclusão total de qualquer análise estatística na atividade policial.",
              "Ausência total de contacto direto com a comunidade.",
              "Elementos de contacto comunitário com o uso sistemático de análise de dados para orientar a atuação.",
              "Foco exclusivo em operações de grande escala, sem qualquer trabalho local.",
            ],
            respostaCorreta: 2,
            dica: "Combina proximidade com a comunidade e uso de dados para orientar decisões.",
            justificativa:
              "Este modelo híbrido combina elementos de contacto comunitário e proximidade com o uso sistemático de análise de dados, procurando aliar prevenção comunitária e eficácia baseada em evidência.",
          },
          {
            id: 11,
            pergunta:
              "A avaliação do desempenho policial, quando baseada exclusivamente em número de detenções, apresenta como principal limitação:",
            opcoes: [
              "Não refletir necessariamente a qualidade preventiva e a eficácia real na redução da criminalidade e no reforço da confiança pública.",
              "Ser sempre um indicador perfeito e completo do trabalho policial.",
              "Não ter qualquer relação com a atuação dos agentes.",
              "Ser aplicável apenas em contextos de criminalidade económica.",
            ],
            respostaCorreta: 0,
            dica: "Focar-se apenas em número de detenções pode ignorar outros aspetos importantes, como prevenção e confiança pública.",
            justificativa:
              "A avaliação do desempenho policial baseada exclusivamente no número de detenções apresenta a limitação de não refletir necessariamente a qualidade preventiva do trabalho policial nem o reforço da confiança pública.",
          },
          {
            id: 12,
            pergunta:
              "A cooperação entre diferentes forças de segurança e outras entidades (autarquias, escolas, serviços sociais) em modelos integrados de policiamento visa, principalmente:",
            opcoes: [
              "Concentrar toda a responsabilidade de segurança numa única entidade isolada.",
              "Responder de forma mais eficaz a problemas complexos de segurança, que raramente têm uma única causa isolada.",
              "Eliminar totalmente a necessidade de policiamento tradicional.",
              "Excluir a comunidade de qualquer papel na definição de prioridades locais.",
            ],
            respostaCorreta: 1,
            dica: "Reconhece que problemas de segurança complexos raramente têm uma única causa isolada.",
            justificativa:
              "A cooperação entre diferentes entidades em modelos integrados de policiamento visa responder de forma mais eficaz a problemas complexos de segurança, reconhecendo a sua natureza multicausal.",
          },
          {
            id: 13,
            pergunta:
              "A relação entre legitimidade policial e cooperação da comunidade sugere, segundo diversos estudos, que:",
            opcoes: [
              "A legitimidade policial não tem qualquer relação com a cooperação da população.",
              "A cooperação da comunidade depende exclusivamente do número de agentes policiais existentes.",
              "Uma polícia percebida como legítima e justa tende a obter maior cooperação e confiança por parte da comunidade.",
              "A perceção de legitimidade é irrelevante para a eficácia policial.",
            ],
            respostaCorreta: 2,
            dica: "Uma polícia vista como legítima costuma obter maior cooperação da comunidade.",
            justificativa:
              "Diversos estudos indicam que uma força policial percebida como legítima e justa tende a obter maior cooperação e confiança por parte da comunidade, favorecendo a eficácia da sua atuação.",
          },
          {
            id: 14,
            pergunta:
              "O uso de tecnologia (como câmaras corporais e sistemas de georreferenciação de ocorrências) na atividade policial contribui, entre outros aspetos, para:",
            opcoes: [
              "Eliminação total da necessidade de qualquer contacto humano na resposta a ocorrências.",
              "Substituição integral do policiamento tradicional em qualquer contexto.",
              "Ausência total de qualquer questão relacionada com privacidade.",
              "Maior transparência, capacidade de análise de padrões criminais e responsabilização da atuação policial.",
            ],
            respostaCorreta: 3,
            dica: "Contribui para transparência e melhor análise de padrões, mas não substitui o fator humano.",
            justificativa:
              "O uso de tecnologia na atividade policial contribui para maior transparência, melhor capacidade de análise de padrões criminais e maior responsabilização da atuação dos agentes.",
          },
          {
            id: 15,
            pergunta:
              "A escolha de um modelo de policiamento por parte de uma autoridade de segurança deve, idealmente, considerar:",
            opcoes: [
              "As características específicas do território, os problemas locais identificados e os recursos disponíveis.",
              "Exclusivamente modelos aplicados noutros países, sem qualquer adaptação ao contexto local.",
              "Um único modelo universal, aplicável indistintamente a qualquer contexto.",
              "Ausência total de qualquer diagnóstico prévio da realidade local.",
            ],
            respostaCorreta: 0,
            dica: "A escolha do modelo deve ser ajustada à realidade específica do território.",
            justificativa:
              "A escolha de um modelo de policiamento deve considerar as características específicas do território, os problemas locais identificados através de diagnóstico e os recursos efetivamente disponíveis.",
          },
        ],
      },
      {
        id: "organizacao-judiciaria-praticas-juridicas-forenses",
        nome: "Organização Judiciária e Práticas Jurídicas e Forenses",
        questoes: [
          {
            id: 1,
            pergunta:
              "A organização judiciária, num Estado de Direito, tem como principal finalidade:",
            opcoes: [
              "Substituir totalmente a atuação do poder legislativo.",
              "Estruturar a distribuição de competências entre os diferentes tribunais e órgãos de administração da justiça.",
              "Determinar diretamente as penas aplicáveis a cada crime.",
              "Eliminar a necessidade de qualquer recurso judicial.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se com a estrutura e distribuição de competências entre tribunais.",
            justificativa:
              "A organização judiciária estrutura a distribuição de competências entre os diferentes tribunais e órgãos de administração da justiça, assegurando o funcionamento ordenado do sistema judicial.",
          },
          {
            id: 2,
            pergunta:
              "O princípio da hierarquia dos tribunais, presente na generalidade dos sistemas judiciais, permite:",
            opcoes: [
              "Que todos os tribunais tenham exatamente a mesma competência, sem qualquer distinção.",
              "A eliminação total de qualquer possibilidade de recurso.",
              "A existência de instâncias de recurso, possibilitando o reexame de decisões por tribunais superiores.",
              "Que decisões de primeira instância sejam sempre definitivas e irrecorríveis.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com a possibilidade de recorrer a instâncias superiores.",
            justificativa:
              "A hierarquia dos tribunais permite a existência de instâncias de recurso, possibilitando o reexame de decisões judiciais por tribunais superiores, reforçando as garantias processuais.",
          },
          {
            id: 3,
            pergunta:
              "O Ministério Público, na generalidade dos ordenamentos, tem como uma das principais funções:",
            opcoes: [
              "Promover a ação penal e defender a legalidade democrática e determinados interesses públicos.",
              "Substituir totalmente a função do juiz na decisão do processo.",
              "Representar exclusivamente os interesses do arguido.",
              "Ser responsável pela execução direta das penas privativas de liberdade.",
            ],
            respostaCorreta: 0,
            dica: "É o órgão responsável por promover a ação penal, entre outras funções.",
            justificativa:
              "O Ministério Público tem, entre as suas principais funções, a promoção da ação penal e a defesa da legalidade democrática e de determinados interesses públicos relevantes.",
          },
          {
            id: 4,
            pergunta:
              "A independência do poder judicial, enquanto princípio fundamental do Estado de Direito, garante, essencialmente:",
            opcoes: [
              "Que os juízes possam decidir livremente, sem qualquer vinculação à lei.",
              "A subordinação total do poder judicial ao poder executivo.",
              "A ausência de qualquer forma de responsabilização dos juízes.",
              "Que os juízes decidam com base na lei e nas provas, sem interferências indevidas de outros poderes.",
            ],
            respostaCorreta: 3,
            dica: "Relaciona-se com decisões livres de interferências externas indevidas, mas sempre vinculadas à lei.",
            justificativa:
              "A independência do poder judicial garante que os juízes decidam com base na lei e nas provas apresentadas, livres de interferências indevidas de outros poderes ou de terceiros.",
          },
          {
            id: 5,
            pergunta:
              "A advocacia, enquanto profissão jurídica, desempenha, entre outras, a função de:",
            opcoes: [
              "Substituir totalmente a função do juiz na decisão da causa.",
              "Assegurar a defesa técnica dos interesses das partes no processo judicial.",
              "Determinar diretamente as penas aplicáveis.",
              "Representar exclusivamente os interesses do Estado.",
            ],
            respostaCorreta: 1,
            dica: "O advogado defende tecnicamente os interesses da parte que representa.",
            justificativa:
              "A advocacia desempenha a função essencial de assegurar a defesa técnica dos interesses das partes no processo judicial, contribuindo para o equilíbrio processual e o exercício do direito de defesa.",
          },
          {
            id: 6,
            pergunta:
              "A distinção entre 'jurisdição voluntária' e 'jurisdição contenciosa' relaciona-se, principalmente, com:",
            opcoes: [
              "O tipo de pena aplicável ao caso em concreto.",
              "A nacionalidade das partes envolvidas.",
              "A existência ou não de um litígio efetivo entre as partes envolvidas no processo.",
              "A ausência total de qualquer intervenção judicial em ambos os casos.",
            ],
            respostaCorreta: 2,
            dica: "Pense na diferença entre haver ou não um conflito de interesses entre as partes.",
            justificativa:
              "A jurisdição contenciosa pressupõe a existência de um litígio entre as partes, enquanto a jurisdição voluntária, em regra, não implica um conflito efetivo de interesses.",
          },
          {
            id: 7,
            pergunta:
              "Os tribunais especializados (como tribunais de família e menores, ou tribunais de trabalho) justificam-se, principalmente, por:",
            opcoes: [
              "Permitirem maior conhecimento técnico e sensibilidade em matérias específicas, favorecendo decisões mais adequadas.",
              "Excluírem totalmente a aplicação da lei geral.",
              "Serem obrigatoriamente compostos apenas por não juristas.",
              "Não terem qualquer relação com a proteção de direitos fundamentais.",
            ],
            respostaCorreta: 0,
            dica: "A especialização permite maior conhecimento técnico em áreas específicas do Direito.",
            justificativa:
              "Os tribunais especializados justificam-se por permitirem maior conhecimento técnico e sensibilidade em matérias específicas, favorecendo decisões judiciais mais adequadas às particularidades de cada área.",
          },
          {
            id: 8,
            pergunta:
              "A prática do exame direto e do contra-exame de testemunhas, em audiência de julgamento, tem como principal finalidade:",
            opcoes: [
              "Impedir totalmente que a defesa questione qualquer testemunha.",
              "Substituir totalmente a prova documental existente no processo.",
              "Determinar automaticamente a culpabilidade do arguido.",
              "Permitir que ambas as partes explorem e testem a credibilidade e a consistência dos depoimentos prestados.",
            ],
            respostaCorreta: 3,
            dica: "Ambas as partes têm oportunidade de testar a credibilidade dos depoimentos.",
            justificativa:
              "O exame direto e o contra-exame de testemunhas permitem que ambas as partes explorem e testem a credibilidade e a consistência dos depoimentos prestados, reforçando o contraditório.",
          },
          {
            id: 9,
            pergunta:
              "A redação de peças processuais (como petições, contestações ou alegações) exige, entre outras qualidades:",
            opcoes: [
              "Ausência total de qualquer fundamentação legal.",
              "Clareza, rigor técnico-jurídico e fundamentação adequada dos argumentos apresentados.",
              "Linguagem exclusivamente coloquial, sem qualquer rigor técnico.",
              "Omissão sistemática de qualquer referência à legislação aplicável.",
            ],
            respostaCorreta: 1,
            dica: "Exige rigor técnico, clareza e fundamentação adequada.",
            justificativa:
              "A redação de peças processuais exige clareza, rigor técnico-jurídico e fundamentação adequada dos argumentos apresentados, sendo essencial para a eficácia da atuação processual.",
          },
          {
            id: 10,
            pergunta:
              "A mediação e a arbitragem, enquanto meios alternativos de resolução de litígios, caracterizam-se por:",
            opcoes: [
              "Substituírem totalmente e em qualquer caso a via judicial.",
              "Oferecerem vias alternativas ao processo judicial tradicional, frequentemente mais céleres e menos formais.",
              "Serem aplicáveis exclusivamente a processos penais.",
              "Excluírem totalmente qualquer participação das partes na resolução do litígio.",
            ],
            respostaCorreta: 1,
            dica: "São vias alternativas, mais céleres e menos formais que o processo judicial tradicional.",
            justificativa:
              "A mediação e a arbitragem oferecem vias alternativas ao processo judicial tradicional, sendo frequentemente mais céleres e menos formais, embora não excluam, em regra, o recurso à via judicial noutras situações.",
          },
          {
            id: 11,
            pergunta:
              "A deontologia profissional dos operadores jurídicos (juízes, procuradores, advogados) tem como principal finalidade:",
            opcoes: [
              "Ser um conjunto de regras sem qualquer relevância prática.",
              "Substituir totalmente a legislação aplicável.",
              "Estabelecer padrões éticos de conduta que garantam a integridade e a confiança no sistema de justiça.",
              "Aplicar-se apenas a processos de natureza económica.",
            ],
            respostaCorreta: 2,
            dica: "Relaciona-se com padrões éticos que sustentam a confiança no sistema de justiça.",
            justificativa:
              "A deontologia profissional dos operadores jurídicos estabelece padrões éticos de conduta essenciais para garantir a integridade e a confiança pública no sistema de justiça.",
          },
          {
            id: 12,
            pergunta:
              "O apoio judiciário (assistência jurídica gratuita), previsto em diversos ordenamentos, tem como principal finalidade:",
            opcoes: [
              "Garantir o acesso à justiça a pessoas que, por insuficiência económica, não podem custear os serviços jurídicos.",
              "Beneficiar exclusivamente pessoas de elevado rendimento.",
              "Substituir totalmente a necessidade de qualquer processo judicial.",
              "Ser aplicável apenas a processos de natureza penal.",
            ],
            respostaCorreta: 0,
            dica: "Relaciona-se com garantir acesso à justiça a quem não tem meios económicos suficientes.",
            justificativa:
              "O apoio judiciário tem como principal finalidade garantir o acesso efetivo à justiça a pessoas que, por insuficiência económica, não teriam meios para custear os serviços jurídicos necessários.",
          },
          {
            id: 13,
            pergunta:
              "A elaboração de um parecer jurídico técnico deve, essencialmente, caracterizar-se por:",
            opcoes: [
              "Uma opinião puramente pessoal, sem qualquer fundamentação técnica.",
              "Ausência total de qualquer referência a normas legais aplicáveis.",
              "Ser redigido sem qualquer estrutura lógica ou metodológica.",
              "Análise fundamentada da questão jurídica, com base na legislação, doutrina e jurisprudência relevantes.",
            ],
            respostaCorreta: 3,
            dica: "Deve basear-se em fontes técnicas: legislação, doutrina e jurisprudência.",
            justificativa:
              "A elaboração de um parecer jurídico técnico deve caracterizar-se por uma análise fundamentada, com base na legislação, na doutrina e na jurisprudência relevantes para a questão em análise.",
          },
          {
            id: 14,
            pergunta:
              "A gestão processual eficiente, no âmbito da organização judiciária, contribui, principalmente, para:",
            opcoes: [
              "Eliminar totalmente qualquer garantia processual das partes.",
              "Reduzir a morosidade processual, favorecendo o cumprimento do princípio da celeridade e do prazo razoável.",
              "Substituir totalmente a necessidade de audiência de julgamento.",
              "Ser irrelevante para a confiança pública no sistema de justiça.",
            ],
            respostaCorreta: 1,
            dica: "Relaciona-se diretamente com a redução da morosidade processual.",
            justificativa:
              "A gestão processual eficiente contribui para reduzir a morosidade processual, favorecendo o cumprimento do princípio da celeridade e do direito a um processo em prazo razoável.",
          },
          {
            id: 15,
            pergunta:
              "A digitalização dos processos judiciais (processo eletrónico) tem contribuído, entre outros aspetos, para:",
            opcoes: [
              "Eliminação total da necessidade de qualquer decisão judicial.",
              "Substituição integral da presença física em qualquer ato processual, sem exceções.",
              "Maior eficiência na tramitação processual e facilidade de acesso a determinados atos processuais pelas partes.",
              "Ausência total de qualquer questão relacionada com segurança da informação.",
            ],
            respostaCorreta: 2,
            dica: "Contribui para maior eficiência e facilidade de acesso, sem eliminar totalmente atos presenciais necessários.",
            justificativa:
              "A digitalização dos processos judiciais tem contribuído para maior eficiência na tramitação processual e para uma maior facilidade de acesso das partes a determinados atos processuais.",
          },
        ],
      },
      {
        id: "praticas-criminais-justica-direitos-fundamentais",
        nome: "Práticas Criminais, Justiça e Direitos Fundamentais",
        questoes: [
          {
            id: 1,
            pergunta:
              "Os direitos fundamentais, no âmbito do processo penal, funcionam, essencialmente, como:",
            opcoes: [
              "Instrumentos exclusivos de proteção do Estado contra o arguido.",
              "Limites ao exercício do poder punitivo do Estado, protegendo a dignidade e a liberdade do indivíduo.",
              "Normas sem qualquer aplicação prática no processo penal.",
              "Garantias aplicáveis apenas em processos de natureza civil.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Funcionam como limites ao poder do Estado de punir.",
            justificativa:
              "Os direitos fundamentais funcionam, no processo penal, como limites ao exercício do poder punitivo estatal, protegendo a dignidade humana e a liberdade do indivíduo perante o Estado.",
          },
          {
            id: 2,
            pergunta:
              "O princípio da legalidade penal ('não há crime sem lei anterior que o defina') tem como principal função:",
            opcoes: [
              "Permitir que o juiz crie livremente novos tipos de crime.",
              "Excluir totalmente a necessidade de lei escrita para definir crimes.",
              "Garantir segurança jurídica, impedindo a criminalização retroativa de condutas.",
              "Aplicar-se apenas a processos de natureza civil.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Relaciona-se com a exigência de lei prévia para definir crimes e penas.",
            justificativa:
              "O princípio da legalidade penal garante segurança jurídica ao impedir a criminalização retroativa de condutas, exigindo lei anterior que defina claramente o crime e a respetiva pena.",
          },
          {
            id: 3,
            pergunta:
              "A proibição da tortura e de tratamentos cruéis, desumanos ou degradantes constitui:",
            opcoes: [
              "Um direito que pode ser afastado em situações de investigação de crimes graves.",
              "Uma garantia aplicável exclusivamente a processos de natureza civil.",
              "Uma regra sem qualquer reconhecimento no direito internacional.",
              "Um direito absoluto, sem qualquer exceção admissível, mesmo em contexto de investigação criminal.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "É considerado um direito absoluto, sem qualquer exceção legítima.",
            justificativa:
              "A proibição da tortura e de tratamentos cruéis, desumanos ou degradantes constitui um direito absoluto, sem qualquer exceção legítima, reconhecido amplamente pelo direito internacional dos direitos humanos.",
          },
          {
            id: 4,
            pergunta:
              "O direito ao silêncio, reconhecido em diversos ordenamentos, garante ao arguido que:",
            opcoes: [
              "Não pode ser obrigado a produzir prova contra si mesmo, nem o exercício deste direito pode ser interpretado automaticamente como confissão.",
              "É obrigado a responder a todas as perguntas formuladas pela autoridade.",
              "Perde automaticamente qualquer outro direito processual ao exercê-lo.",
              "Só pode ser aplicado em processos de natureza civil.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Relaciona-se com a proteção contra a autoincriminação.",
            justificativa:
              "O direito ao silêncio garante que o arguido não pode ser obrigado a produzir prova contra si mesmo, e o seu exercício não pode ser interpretado, por si só, como indício de culpa.",
          },
          {
            id: 5,
            pergunta:
              "O princípio da proporcionalidade, aplicado à atuação do sistema de justiça penal, exige que:",
            opcoes: [
              "Qualquer medida restritiva de direitos seja sempre admissível, independentemente da sua necessidade.",
              "As medidas restritivas de direitos sejam adequadas, necessárias e proporcionais ao objetivo pretendido.",
              "Não exista qualquer limite às medidas cautelares aplicáveis.",
              "As penas sejam sempre fixadas no limite máximo previsto na lei.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Relaciona-se com adequação, necessidade e proporção entre meio e fim.",
            justificativa:
              "O princípio da proporcionalidade exige que as medidas restritivas de direitos sejam adequadas, necessárias e proporcionais ao objetivo legítimo que pretendem alcançar.",
          },
          {
            id: 6,
            pergunta:
              "A superlotação prisional, discutida na perspetiva dos direitos fundamentais, é frequentemente associada a:",
            opcoes: [
              "Nenhum impacto relevante sobre os direitos fundamentais dos reclusos.",
              "Uma melhoria automática das condições de vida no estabelecimento prisional.",
              "Potenciais violações da dignidade humana e das condições mínimas de detenção reconhecidas internacionalmente.",
              "Um fenómeno sem qualquer relação com políticas públicas de justiça.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Relaciona-se com potenciais violações de dignidade e de condições mínimas de detenção.",
            justificativa:
              "A superlotação prisional é frequentemente associada a potenciais violações da dignidade humana e das condições mínimas de detenção reconhecidas por normas e organismos internacionais de direitos humanos.",
          },
          {
            id: 7,
            pergunta:
              "A garantia de um 'processo equitativo' (fair trial), reconhecida internacionalmente, engloba, entre outros elementos:",
            opcoes: [
              "A garantia automática de absolvição do arguido em qualquer circunstância.",
              "A exclusão total de qualquer possibilidade de recurso.",
              "A ausência de qualquer exigência quanto à imparcialidade do julgador.",
              "O direito a um julgamento por tribunal independente e imparcial, dentro de prazo razoável e com respeito pelo contraditório.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Envolve tribunal independente, prazo razoável e respeito pelo contraditório.",
            justificativa:
              "A garantia de um processo equitativo engloba, entre outros elementos, o direito a um julgamento por tribunal independente e imparcial, dentro de prazo razoável e com pleno respeito pelo contraditório.",
          },
          {
            id: 8,
            pergunta:
              "A criminalização de determinadas condutas, discutida sob a perspetiva dos direitos fundamentais, deve, idealmente, respeitar:",
            opcoes: [
              "O princípio da intervenção mínima do Direito Penal, reservando-o para condutas particularmente lesivas de bens jurídicos relevantes.",
              "A criminalização de qualquer conduta socialmente indesejável, independentemente da gravidade.",
              "A ausência total de qualquer limite à atuação do legislador penal.",
              "A eliminação de qualquer critério de proporcionalidade na definição de crimes.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Relaciona-se com o princípio da intervenção mínima do Direito Penal (ultima ratio).",
            justificativa:
              "A criminalização de condutas deve, idealmente, respeitar o princípio da intervenção mínima do Direito Penal, reservando-o para a proteção de bens jurídicos particularmente relevantes, e não para qualquer conduta indesejável.",
          },
          {
            id: 9,
            pergunta:
              "Os relatórios de organismos internacionais de direitos humanos sobre condições prisionais têm, tipicamente, como principal função:",
            opcoes: [
              "Substituir totalmente a jurisdição interna de cada país.",
              "Monitorizar o cumprimento de padrões internacionais e recomendar melhorias às autoridades nacionais.",
              "Determinar diretamente a libertação de reclusos específicos.",
              "Ser juridicamente irrelevantes para qualquer Estado.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Estes relatórios têm função de monitorização e recomendação, não substituem os tribunais nacionais.",
            justificativa:
              "Os relatórios de organismos internacionais de direitos humanos têm como função monitorizar o cumprimento de padrões internacionais relativos às condições prisionais e recomendar melhorias às autoridades nacionais competentes.",
          },
          {
            id: 10,
            pergunta:
              "A não discriminação, enquanto princípio transversal ao sistema de justiça, exige que:",
            opcoes: [
              "Determinados grupos sociais possam ser tratados de forma diferenciada, sem qualquer justificação legítima.",
              "A lei possa ser aplicada de forma arbitrária, consoante o perfil do arguido.",
              "Todas as pessoas sejam tratadas de forma equitativa perante a lei, independentemente de características como origem, género ou condição económica.",
              "Seja admissível qualquer forma de tratamento desigual, desde que prevista informalmente.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Relaciona-se com igualdade de tratamento perante a lei.",
            justificativa:
              "O princípio da não discriminação exige que todas as pessoas sejam tratadas de forma equitativa perante a lei, independentemente de características como origem, género, religião ou condição económica.",
          },
          {
            id: 11,
            pergunta:
              "O acesso à justiça, enquanto direito fundamental, implica, entre outros aspetos:",
            opcoes: [
              "A garantia automática de vitória em qualquer processo judicial.",
              "A exclusão de pessoas com menores recursos económicos do sistema de justiça.",
              "Um direito aplicável apenas a processos de natureza penal.",
              "A possibilidade efetiva de qualquer pessoa recorrer aos tribunais e obter uma decisão justa, independentemente da sua condição económica.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Relaciona-se com a possibilidade real de recorrer à justiça, independentemente da condição económica.",
            justificativa:
              "O acesso à justiça, enquanto direito fundamental, implica a possibilidade efetiva de qualquer pessoa recorrer aos tribunais e obter uma decisão justa, independentemente da sua condição económica.",
          },
          {
            id: 12,
            pergunta:
              "A proteção de dados pessoais, no contexto da investigação criminal, exige um equilíbrio entre:",
            opcoes: [
              "A eficácia investigativa e o respeito pela privacidade e pelos direitos fundamentais dos envolvidos.",
              "A ausência total de qualquer limite à recolha de dados pelas autoridades.",
              "A exclusão total de qualquer utilização de dados pessoais em investigações criminais.",
              "A substituição integral do processo judicial por análise automatizada de dados.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Existe uma tensão entre eficácia investigativa e proteção da privacidade.",
            justificativa:
              "A proteção de dados pessoais no contexto da investigação criminal exige um equilíbrio cuidadoso entre a eficácia investigativa e o respeito pela privacidade e pelos direitos fundamentais dos envolvidos.",
          },
          {
            id: 13,
            pergunta:
              "A justiça restaurativa, enquanto abordagem alternativa, é discutida à luz dos direitos fundamentais, principalmente, porque:",
            opcoes: [
              "Elimina totalmente a necessidade de respeitar qualquer direito processual.",
              "Deve respeitar as garantias processuais das partes, sendo aplicada de forma voluntária e informada.",
              "É juridicamente incompatível com qualquer sistema de direitos fundamentais.",
              "Substitui obrigatoriamente qualquer forma de processo penal tradicional.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Deve respeitar garantias processuais e ser aplicada de forma voluntária.",
            justificativa:
              "A justiça restaurativa, para ser compatível com os direitos fundamentais, deve respeitar as garantias processuais das partes envolvidas, sendo aplicada de forma voluntária e devidamente informada.",
          },
          {
            id: 14,
            pergunta:
              "A proteção especial de grupos vulneráveis (como crianças, pessoas com deficiência ou vítimas de violência) no sistema de justiça fundamenta-se, principalmente, em:",
            opcoes: [
              "Excluir totalmente esses grupos de qualquer participação processual.",
              "Aplicar-se exclusivamente a processos de natureza económica.",
              "Reconhecer que determinados grupos podem necessitar de garantias adicionais para o efetivo exercício dos seus direitos.",
              "Ausência total de qualquer diferença de tratamento em relação a outros grupos.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Relaciona-se com garantias adicionais, e não com exclusão do processo.",
            justificativa:
              "A proteção especial de grupos vulneráveis fundamenta-se no reconhecimento de que estes podem necessitar de garantias adicionais para o efetivo exercício dos seus direitos no sistema de justiça.",
          },
          {
            id: 15,
            pergunta:
              "A supervisão judicial de medidas privativas de liberdade, como a prisão preventiva, é relevante porque:",
            opcoes: [
              "Impede totalmente a aplicação de qualquer medida privativa de liberdade.",
              "É juridicamente dispensável em qualquer sistema de justiça.",
              "Substitui totalmente a necessidade de julgamento do caso.",
              "Assegura que a restrição da liberdade seja periodicamente reavaliada e mantida apenas enquanto justificada.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Relaciona-se com a reavaliação periódica da necessidade da medida restritiva.",
            justificativa:
              "A supervisão judicial de medidas privativas de liberdade assegura que a restrição da liberdade seja periodicamente reavaliada e mantida apenas enquanto efetivamente justificada, protegendo os direitos fundamentais do arguido.",
          },
        ],
      },
      {
        id: "questoes-de-seguranca-2",
        nome: "Questões de Segurança 2",
        questoes: [
          {
            id: 1,
            pergunta:
              "As políticas públicas de segurança, numa perspetiva contemporânea, tendem a integrar, entre outros aspetos:",
            opcoes: [
              "Medidas de prevenção, repressão e reinserção, numa abordagem articulada e multissetorial.",
              "Exclusivamente medidas de repressão penal, sem qualquer componente preventiva.",
              "A eliminação total de qualquer política de prevenção.",
              "Um único setor responsável, sem qualquer articulação com outras áreas.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "As políticas modernas costumam integrar prevenção, repressão e reinserção.",
            justificativa:
              "As políticas públicas de segurança contemporâneas tendem a integrar medidas de prevenção, repressão e reinserção social, numa abordagem articulada entre diferentes setores.",
          },
          {
            id: 2,
            pergunta:
              "O terrorismo, enquanto fenómeno de segurança, distingue-se de outras formas de criminalidade violenta, tipicamente, por:",
            opcoes: [
              "Não ter qualquer motivação subjacente identificável.",
              "Ter como principal objetivo gerar terror generalizado, com finalidade política, ideológica ou religiosa.",
              "Ser praticado exclusivamente por organizações estatais.",
              "Ser sempre desprovido de qualquer planeamento prévio.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Relaciona-se com a finalidade de gerar terror com um objetivo político, ideológico ou religioso.",
            justificativa:
              "O terrorismo distingue-se de outras formas de criminalidade violenta pelo objetivo de gerar terror generalizado, com finalidade política, ideológica ou religiosa subjacente.",
          },
          {
            id: 3,
            pergunta:
              "A radicalização, enquanto processo relevante para a prevenção do extremismo violento, pode ser entendida como:",
            opcoes: [
              "Um evento súbito, sem qualquer processo prévio identificável.",
              "Um fenómeno sem qualquer relevância para a segurança pública.",
              "Um processo gradual de adoção de crenças extremistas, associado, nalguns casos, à disponibilidade para o uso da violência.",
              "Um conceito aplicável exclusivamente a crimes económicos.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "É descrita como um processo gradual, não um evento súbito.",
            justificativa:
              "A radicalização é entendida como um processo gradual de adoção de crenças extremistas, associado, nalguns casos, ao aumento da disponibilidade para o uso da violência.",
          },
          {
            id: 4,
            pergunta:
              "A cibersegurança, enquanto área relevante para a segurança contemporânea, dedica-se, principalmente, a:",
            opcoes: [
              "Substituir totalmente a segurança física de infraestruturas.",
              "Analisar exclusivamente crimes cometidos em espaço físico.",
              "Ser irrelevante para infraestruturas críticas nacionais.",
              "Proteger sistemas, redes e dados contra ameaças digitais, incluindo ataques informáticos e fugas de informação.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Relaciona-se com proteção de sistemas e dados contra ameaças digitais.",
            justificativa:
              "A cibersegurança dedica-se, essencialmente, a proteger sistemas, redes e dados contra ameaças digitais, incluindo ataques informáticos, fugas de informação e outras vulnerabilidades tecnológicas.",
          },
          {
            id: 5,
            pergunta:
              "A proteção de infraestruturas críticas (como redes de energia ou sistemas de água) é relevante para a segurança nacional porque:",
            opcoes: [
              "A sua interrupção ou comprometimento pode ter impactos graves no funcionamento essencial da sociedade.",
              "Estas infraestruturas não têm qualquer relevância estratégica.",
              "São sistemas totalmente imunes a qualquer tipo de ameaça.",
              "A sua proteção é responsabilidade exclusiva de entidades privadas, sem qualquer envolvimento estatal.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Pense no impacto que a interrupção destes serviços pode ter na sociedade.",
            justificativa:
              "A proteção de infraestruturas críticas é relevante para a segurança nacional porque a sua interrupção ou comprometimento pode ter impactos graves no funcionamento essencial da sociedade.",
          },
          {
            id: 6,
            pergunta:
              "A gestão de crises e emergências, enquanto componente da segurança pública, exige, entre outros elementos:",
            opcoes: [
              "Ausência total de qualquer planeamento antecipado.",
              "Planeamento prévio, coordenação entre entidades e comunicação eficaz durante a resposta ao evento.",
              "Improvisação exclusiva no momento da ocorrência da crise.",
              "Concentração de toda a responsabilidade numa única entidade, sem qualquer coordenação.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Exige planeamento prévio e coordenação entre diferentes entidades.",
            justificativa:
              "A gestão eficaz de crises e emergências exige planeamento prévio detalhado, coordenação entre diferentes entidades envolvidas e comunicação eficaz durante toda a resposta ao evento.",
          },
          {
            id: 7,
            pergunta:
              "A segurança fronteiriça, enquanto componente das políticas de segurança nacional, relaciona-se, entre outros aspetos, com:",
            opcoes: [
              "A total ausência de qualquer controlo sobre a circulação de pessoas.",
              "A eliminação de qualquer cooperação internacional em matéria de fronteiras.",
              "O controlo do fluxo de pessoas e bens, em equilíbrio com o respeito pelos direitos humanos e obrigações internacionais.",
              "Ser um tema irrelevante para a segurança nacional.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Existe um equilíbrio entre controlo de fronteiras e respeito por direitos humanos.",
            justificativa:
              "A segurança fronteiriça relaciona-se com o controlo do fluxo de pessoas e bens, devendo ser equilibrada com o respeito pelos direitos humanos e pelas obrigações internacionais dos Estados.",
          },
          {
            id: 8,
            pergunta:
              "O contraterrorismo, enquanto área especializada de segurança, integra, entre outras dimensões:",
            opcoes: [
              "Exclusivamente ações militares, sem qualquer componente preventiva.",
              "Ausência total de cooperação entre serviços de informações e forças de segurança.",
              "Um único tipo de resposta, aplicável indistintamente a qualquer ameaça.",
              "Prevenção da radicalização, deteção de ameaças e resposta coordenada a incidentes de natureza terrorista.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Integra prevenção da radicalização, deteção e resposta coordenada.",
            justificativa:
              "O contraterrorismo integra diferentes dimensões, como a prevenção da radicalização, a deteção precoce de ameaças e a resposta coordenada a incidentes de natureza terrorista.",
          },
          {
            id: 9,
            pergunta:
              "A criminalidade transnacional organizada, enquanto ameaça à segurança, exige, principalmente:",
            opcoes: [
              "Cooperação internacional reforçada entre autoridades de diferentes países.",
              "Uma resposta exclusivamente nacional, sem qualquer articulação internacional.",
              "A total ausência de partilha de informação entre países.",
              "Um único modelo de resposta, aplicável indiscriminadamente em qualquer contexto.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Este tipo de criminalidade ultrapassa fronteiras, exigindo cooperação internacional.",
            justificativa:
              "A criminalidade transnacional organizada, pela sua natureza multinacional, exige uma cooperação internacional reforçada entre autoridades de diferentes países para uma resposta eficaz.",
          },
          {
            id: 10,
            pergunta:
              "A segurança em grandes eventos desportivos ou culturais exige, entre outros aspetos, planeamento relativo a:",
            opcoes: [
              "Ausência total de qualquer planeamento prévio.",
              "Gestão de multidões, controlo de acessos e coordenação entre entidades de segurança e organizadores.",
              "Exclusão total de qualquer entidade privada do planeamento do evento.",
              "Improvisação exclusiva no dia do evento.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Envolve planeamento cuidadoso de fluxos, acessos e coordenação entre entidades.",
            justificativa:
              "A segurança em grandes eventos exige planeamento cuidadoso relativo à gestão de multidões, ao controlo de acessos e à coordenação entre as entidades de segurança e os organizadores do evento.",
          },
          {
            id: 11,
            pergunta:
              "A resiliência comunitária, enquanto conceito relevante em segurança, refere-se à capacidade de uma comunidade para:",
            opcoes: [
              "Ignorar completamente qualquer situação de crise ou emergência.",
              "Depender exclusivamente da intervenção externa, sem qualquer capacidade própria de resposta.",
              "Antecipar, resistir e recuperar de eventos adversos, incluindo ameaças à segurança.",
              "Ser totalmente imune a qualquer tipo de ameaça, sem necessidade de preparação prévia.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Relaciona-se com a capacidade de antecipar, resistir e recuperar de eventos adversos.",
            justificativa:
              "A resiliência comunitária refere-se à capacidade de uma comunidade para antecipar, resistir e recuperar de eventos adversos, incluindo ameaças à segurança, através da preparação prévia e da coesão social.",
          },
          {
            id: 12,
            pergunta:
              "A desinformação e as chamadas 'fake news', enquanto tema relevante para a segurança contemporânea, podem representar um risco, especialmente, por:",
            opcoes: [
              "Não terem qualquer impacto relevante sobre a segurança de um país.",
              "Serem sempre imediatamente identificadas e neutralizadas pela sociedade.",
              "Estarem totalmente desligadas de qualquer estratégia de manipulação informativa.",
              "Poderem influenciar a opinião pública, gerar instabilidade social e comprometer processos democráticos.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Pense no potencial impacto sobre a opinião pública e a estabilidade social.",
            justificativa:
              "A desinformação pode representar um risco relevante para a segurança contemporânea por poder influenciar a opinião pública, gerar instabilidade social e comprometer processos democráticos.",
          },
          {
            id: 13,
            pergunta:
              "A avaliação de risco em matéria de segurança, aplicada ao planeamento estratégico, deve considerar, entre outros elementos:",
            opcoes: [
              "A probabilidade de ocorrência de determinadas ameaças e o seu potencial impacto.",
              "Exclusivamente o custo financeiro associado a cada ameaça, sem qualquer outro critério.",
              "A ausência total de qualquer análise sistemática de dados.",
              "Um único cenário fixo, sem qualquer atualização ao longo do tempo.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Combina probabilidade de ocorrência com impacto potencial da ameaça.",
            justificativa:
              "A avaliação de risco em matéria de segurança deve considerar tanto a probabilidade de ocorrência de determinadas ameaças quanto o seu potencial impacto, orientando o planeamento estratégico.",
          },
          {
            id: 14,
            pergunta:
              "A cooperação entre serviços de informações (inteligência) e forças de segurança, no âmbito da prevenção de ameaças graves, deve, idealmente, respeitar:",
            opcoes: [
              "A total ausência de qualquer limite legal à atuação destes serviços.",
              "Limites legais claros, com mecanismos de supervisão e controlo democrático adequados.",
              "A exclusão total de qualquer forma de supervisão externa.",
              "A substituição integral do sistema judicial por decisões dos próprios serviços de informações.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Deve respeitar limites legais e mecanismos de supervisão democrática.",
            justificativa:
              "A cooperação entre serviços de informações e forças de segurança deve respeitar limites legais claros, com mecanismos adequados de supervisão e controlo democrático, protegendo os direitos fundamentais dos cidadãos.",
          },
          {
            id: 15,
            pergunta:
              "Um plano nacional de segurança, enquanto instrumento estratégico, deve, idealmente, ser construído com base em:",
            opcoes: [
              "Decisões pontuais e isoladas, sem qualquer visão estratégica de longo prazo.",
              "Cópia integral de planos de outros países, sem qualquer adaptação ao contexto nacional.",
              "Diagnóstico de ameaças, definição de prioridades estratégicas e mecanismos de avaliação periódica.",
              "Ausência total de qualquer envolvimento de diferentes entidades governamentais.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Segue um ciclo estratégico: diagnosticar, priorizar e avaliar periodicamente.",
            justificativa:
              "Um plano nacional de segurança eficaz deve fundamentar-se num diagnóstico rigoroso das ameaças, na definição clara de prioridades estratégicas e em mecanismos de avaliação periódica dos resultados.",
          },
        ],
      },
      {
        id: "sistemas-de-controlo-social",
        nome: "Sistemas de Controlo Social",
        questoes: [
          {
            id: 1,
            pergunta:
              "O conceito de 'controlo social', em sentido amplo, refere-se a:",
            opcoes: [
              "Um conjunto de mecanismos formais e informais destinados a promover a conformidade dos indivíduos com as normas sociais.",
              "Um conceito aplicável apenas ao sistema penal, sem qualquer dimensão informal.",
              "A ausência total de qualquer influência da sociedade sobre o comportamento individual.",
              "Um fenómeno exclusivamente relacionado com a criminalidade económica.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "É um conceito amplo, que inclui mecanismos formais e informais.",
            justificativa:
              "O controlo social, em sentido amplo, refere-se ao conjunto de mecanismos formais e informais que promovem a conformidade dos indivíduos com as normas sociais vigentes.",
          },
          {
            id: 2,
            pergunta:
              "O controlo social formal distingue-se do controlo social informal, principalmente, por:",
            opcoes: [
              "Não existir qualquer diferença relevante entre os dois conceitos.",
              "Ser exercido por instituições oficiais, com base em normas jurídicas explícitas, enquanto o informal ocorre através de relações sociais espontâneas.",
              "O controlo informal ser exercido exclusivamente pelo Estado.",
              "O controlo formal não ter qualquer base normativa.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Um é exercido por instituições oficiais; o outro, por relações sociais espontâneas (família, escola, comunidade).",
            justificativa:
              "O controlo social formal é exercido por instituições oficiais com base em normas jurídicas explícitas (como o sistema de justiça), enquanto o controlo informal ocorre através de relações sociais espontâneas, como a família ou a comunidade.",
          },
          {
            id: 3,
            pergunta:
              "A Teoria do Controlo Social, associada a autores como Travis Hirschi, sustenta que a delinquência ocorre, principalmente, quando:",
            opcoes: [
              "O indivíduo apresenta laços sociais extremamente fortes com instituições convencionais.",
              "Não existe qualquer relação entre laços sociais e comportamento delitivo.",
              "Os laços sociais do indivíduo com a sociedade convencional (família, escola, valores) se enfraquecem ou se rompem.",
              "A delinquência depende exclusivamente de fatores biológicos, sem qualquer influência social.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "A ideia central é: quanto mais fracos os laços sociais, maior a probabilidade de comportamento desviante.",
            justificativa:
              "A Teoria do Controlo Social de Hirschi sustenta que a delinquência tende a ocorrer quando os laços sociais do indivíduo com a sociedade convencional (como família, escola e valores partilhados) se enfraquecem ou se rompem.",
          },
          {
            id: 4,
            pergunta:
              "As instituições de socialização primária (como a família) desempenham, no processo de controlo social, um papel relevante ao:",
            opcoes: [
              "Não terem qualquer influência no comportamento futuro do indivíduo.",
              "Substituírem totalmente a necessidade de qualquer instituição formal de controlo social.",
              "Serem irrelevantes para a compreensão do comportamento desviante.",
              "Contribuírem para a interiorização precoce de normas e valores sociais.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "A família é uma das primeiras instâncias de aprendizagem de normas sociais.",
            justificativa:
              "As instituições de socialização primária, como a família, desempenham um papel relevante no controlo social ao contribuírem para a interiorização precoce de normas e valores sociais nos indivíduos.",
          },
          {
            id: 5,
            pergunta:
              "O sistema de justiça penal, enquanto instância de controlo social formal, distingue-se por:",
            opcoes: [
              "Aplicar sanções formais e institucionalizadas, previstas em lei, a condutas consideradas socialmente proibidas.",
              "Atuar exclusivamente de forma informal, sem qualquer base normativa.",
              "Não ter qualquer relação com o conceito de controlo social.",
              "Ser aplicado apenas em contextos familiares.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "Aplica sanções formais, previstas em lei, o que o distingue de outras formas de controlo.",
            justificativa:
              "O sistema de justiça penal, enquanto instância de controlo social formal, distingue-se por aplicar sanções formais e institucionalizadas, previstas em lei, a condutas consideradas socialmente proibidas.",
          },
          {
            id: 6,
            pergunta:
              "O 'estigma' associado à passagem pelo sistema de justiça penal, discutido pela perspetiva do rotulacionismo (labeling theory), pode contribuir para:",
            opcoes: [
              "Facilitar automaticamente a reintegração social plena do indivíduo.",
              "Dificultar a reintegração social do indivíduo e, nalguns casos, favorecer a consolidação de uma identidade desviante.",
              "Eliminar totalmente qualquer risco de reincidência.",
              "Não ter qualquer impacto na vida futura do indivíduo.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "O rótulo social pode dificultar a reintegração, reforçando, paradoxalmente, o comportamento desviante.",
            justificativa:
              "A teoria do rotulacionismo sublinha que o estigma associado à passagem pelo sistema de justiça penal pode dificultar a reintegração social e, nalguns casos, contribuir para a consolidação de uma identidade desviante.",
          },
          {
            id: 7,
            pergunta:
              "As comunidades e as redes sociais informais (vizinhança, grupos de pares) podem exercer controlo social através de:",
            opcoes: [
              "Aplicação direta de sanções penais formais.",
              "Ausência total de qualquer influência sobre o comportamento individual.",
              "Mecanismos como a aprovação, a desaprovação social e a vigilância informal do comportamento dos seus membros.",
              "Substituição integral do sistema de justiça formal.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Exercem controlo através de mecanismos informais, como aprovação ou desaprovação social.",
            justificativa:
              "As comunidades e redes sociais informais exercem controlo social através de mecanismos como a aprovação, a desaprovação social e a vigilância informal do comportamento dos seus membros.",
          },
          {
            id: 8,
            pergunta:
              "A eficácia do controlo social informal, segundo diversos estudos, tende a estar associada, entre outros fatores, a:",
            opcoes: [
              "Total ausência de qualquer relação entre os membros de uma comunidade.",
              "Exclusivamente ao número de agentes policiais presentes na área.",
              "Uma comunidade sem qualquer interação social entre os seus membros.",
              "Níveis mais elevados de coesão social e de confiança mútua entre os membros de uma comunidade.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Relaciona-se com o conceito de 'eficácia coletiva': coesão e confiança entre vizinhos.",
            justificativa:
              "A eficácia do controlo social informal tende a estar associada a níveis mais elevados de coesão social e de confiança mútua entre os membros de uma comunidade, conceito frequentemente referido como 'eficácia coletiva'.",
          },
          {
            id: 9,
            pergunta:
              "A escola, enquanto instituição de controlo social, contribui, entre outros aspetos, para:",
            opcoes: [
              "A transmissão de normas, valores e regras de convivência social, além da formação académica.",
              "Ser totalmente irrelevante para o desenvolvimento social do indivíduo.",
              "Substituir integralmente o papel da família na socialização.",
              "Atuar exclusivamente como instância de controlo formal, com aplicação de sanções penais.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "A escola, além de ensinar conteúdos, transmite normas e valores sociais.",
            justificativa:
              "A escola, enquanto instituição de controlo social, contribui para a transmissão de normas, valores e regras de convivência social, complementando o papel da família na socialização dos indivíduos.",
          },
          {
            id: 10,
            pergunta:
              "Os meios de comunicação social, enquanto agentes de controlo social informal, podem influenciar, entre outros aspetos:",
            opcoes: [
              "Nenhum aspeto relevante da vida social.",
              "A perceção pública sobre a criminalidade e os padrões de comportamento socialmente aceitáveis.",
              "Exclusivamente decisões judiciais individuais, sem qualquer outro impacto social.",
              "A eliminação total de qualquer forma de controlo social informal preexistente.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Podem influenciar a perceção pública sobre criminalidade e comportamento social aceitável.",
            justificativa:
              "Os meios de comunicação social, enquanto agentes de controlo social informal, podem influenciar significativamente a perceção pública sobre a criminalidade e os padrões de comportamento socialmente aceitáveis.",
          },
          {
            id: 11,
            pergunta:
              "A vigilância eletrónica em espaços públicos, enquanto mecanismo de controlo social formal, é frequentemente analisada à luz de:",
            opcoes: [
              "Não gerar qualquer tipo de discussão ética ou jurídica relevante.",
              "Ser universalmente aceite, sem qualquer controvérsia associada.",
              "Um equilíbrio entre a sua eficácia preventiva e o respeito pela privacidade dos cidadãos.",
              "Substituir totalmente qualquer forma de controlo social informal.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "Existe uma tensão entre eficácia preventiva e privacidade.",
            justificativa:
              "A vigilância eletrónica em espaços públicos é frequentemente analisada à luz do equilíbrio necessário entre a sua eficácia preventiva e o respeito pela privacidade e pelos direitos dos cidadãos.",
          },
          {
            id: 12,
            pergunta:
              "A relação entre desorganização social e criminalidade, segundo a Escola de Chicago, sugere que:",
            opcoes: [
              "A criminalidade depende exclusivamente de fatores individuais, sem qualquer relação com o contexto comunitário.",
              "Não existe qualquer relação entre características do bairro e níveis de criminalidade.",
              "Comunidades mais coesas apresentam sempre maiores índices de criminalidade.",
              "Comunidades com menor coesão social e maior instabilidade tendem a apresentar maiores dificuldades no exercício do controlo social informal.",
            ],
            respostaCorreta: 3, // Opção D (índice 3)
            dica: "Relaciona-se com a capacidade (ou incapacidade) de uma comunidade exercer controlo social informal eficaz.",
            justificativa:
              "A teoria da desorganização social, associada à Escola de Chicago, sugere que comunidades com menor coesão social e maior instabilidade tendem a apresentar maiores dificuldades no exercício de um controlo social informal eficaz.",
          },
          {
            id: 13,
            pergunta:
              "As sanções sociais informais (como a desaprovação, o isolamento social ou a perda de reputação) podem funcionar como:",
            opcoes: [
              "Mecanismos de controlo social capazes de desencorajar determinados comportamentos, independentemente de sanções formais.",
              "Instrumentos sem qualquer eficácia na regulação do comportamento humano.",
              "Substitutos automáticos e completos do sistema de justiça penal.",
              "Mecanismos aplicáveis apenas em contexto institucional formal.",
            ],
            respostaCorreta: 0, // Opção A (índice 0)
            dica: "São formas de controlo que atuam independentemente de sanções legais formais.",
            justificativa:
              "As sanções sociais informais podem funcionar como mecanismos eficazes de controlo social, desencorajando determinados comportamentos independentemente da existência de sanções formais previstas em lei.",
          },
          {
            id: 14,
            pergunta:
              "A relação entre instituições religiosas e controlo social informal, discutida em diversos estudos, relaciona-se, principalmente, com:",
            opcoes: [
              "A ausência total de qualquer influência social das instituições religiosas.",
              "O papel destas instituições na transmissão de valores morais e no reforço de laços comunitários.",
              "A substituição integral do sistema de justiça formal por instituições religiosas.",
              "Um fenómeno sem qualquer relevância para a criminologia.",
            ],
            respostaCorreta: 1, // Opção B (índice 1)
            dica: "Relaciona-se com a transmissão de valores morais e o reforço de laços comunitários.",
            justificativa:
              "A relação entre instituições religiosas e controlo social informal é discutida, principalmente, em razão do papel que estas instituições podem desempenhar na transmissão de valores morais e no reforço de laços comunitários.",
          },
          {
            id: 15,
            pergunta:
              "A articulação entre controlo social formal e informal, numa perspetiva integrada de prevenção da criminalidade, é relevante porque:",
            opcoes: [
              "O controlo social informal é sempre irrelevante quando existe controlo formal eficaz.",
              "O controlo formal deve substituir totalmente qualquer mecanismo informal existente.",
              "Ambas as dimensões, quando complementares, tendem a fortalecer a eficácia global na promoção da conformidade social.",
              "Não existe qualquer benefício na articulação entre estas duas dimensões.",
            ],
            respostaCorreta: 2, // Opção C (índice 2)
            dica: "As duas dimensões, quando trabalham em conjunto, reforçam-se mutuamente.",
            justificativa:
              "A articulação entre controlo social formal e informal é relevante porque, quando complementares, ambas as dimensões tendem a fortalecer a eficácia global na promoção da conformidade social e na prevenção da criminalidade.",
          },
        ],
      },
    ],
  },
  {
    id: "mod-5",
    titulo: "Módulo Especial: Autores da Criminologia Mundial e Lusófona",
    descricao:
      "Questões selecionadas sobre as principais teorias, autores internacionais, criminólogos angolanos e autores da lusofonia.",
    disciplinas: [
      {
        id: "autores-criminologia-mundial",
        nome: "Autores e Teorias da Criminologia Mundial e Nacional",
        questoes: [
          {
            id: 1,
            nivel: "facil",
            pergunta:
              "O criminólogo e estatístico belga Adolphe Quetelet é considerado pioneiro por:",
            opcoes: [
              "Desenvolver a antropometria criminal e a teoria do atavismo.",
              "Aplicar métodos estatísticos ao estudo da criminalidade, associando-a a fatores sociais e sazonais.",
              "Fundar a Escola de Chicago e o conceito de desorganização social.",
              "Criar o primeiro sistema de identificação dactiloscópica.",
            ],
            respostaCorreta: 1,
            dica: "Conhecido pelo conceito do 'homem médio' (l'homme moyen) e análise de regularidades estatísticas.",
            justificativa:
              "Quetelet foi pioneiro na 'estatística moral', demonstrando regularidades no comportamento criminoso associadas a fatores sociais, sazonais e demográficos.",
          },
          {
            id: 2,
            nivel: "medio",
            pergunta:
              "Hans von Hentig é reconhecido na criminologia mundial por ter desenvolvido:",
            opcoes: [
              "Uma teoria biológica do criminoso nato.",
              "Uma tipologia de vítimas segundo a sua contribuição ou vulnerabilidade na dinâmica do crime.",
              "A teoria da associação diferencial.",
              "A classificação dos tipos de pena aplicáveis a menores.",
            ],
            respostaCorreta: 1,
            dica: "Um dos fundadores da Vitimologia, ao lado de Benjamin Mendelsohn.",
            justificativa:
              "Von Hentig propôs uma das primeiras tipologias vitimológicas, classificando as vítimas segundo a vulnerabilidade e cooperação/participação na dinâmica delitiva.",
          },
          {
            id: 3,
            nivel: "facil",
            pergunta:
              "A quem se atribui a criação do termo 'Vitimologia' como campo autônomo de estudo?",
            opcoes: [
              "Cesare Lombroso",
              "Benjamin Mendelsohn",
              "Edwin Sutherland",
              "Robert Merton",
            ],
            respostaCorreta: 1,
            dica: "Jurista e pesquisador que propôs uma tipologia baseada no grau de culpabilidade da vítima.",
            justificativa:
              "Benjamin Mendelsohn é amplamente reconhecido como o autor que cunhou o termo 'Vitimologia' e defendeu seu estudo autônomo.",
          },
          {
            id: 4,
            nivel: "medio",
            pergunta:
              "Albert Cohen explica o comportamento delinquente de jovens da classe trabalhadora como resposta a:",
            opcoes: [
              "Uma frustração de estatuto (status frustration) face aos valores da classe média.",
              "Um défice genético hereditário identificado por exames antropométricos.",
              "Uma decisão puramente racional de maximizar o lucro econômico.",
              "Um processo de rotulagem exclusivamente promovido pelas forças policiais.",
            ],
            respostaCorreta: 0,
            dica: "Pense no jovem que não consegue atingir os padrões da classe média no ambiente escolar e reage invertendo esses valores.",
            justificativa:
              "Cohen argumenta que a incapacidade de alcançar os padrões de sucesso da classe média gera uma 'frustração de estatuto', levando à criação de subculturas delitivas.",
          },
          {
            id: 5,
            nivel: "dificil",
            pergunta:
              "A Teoria das Oportunidades Diferenciais (Cloward e Ohlin) complementa a Teoria da Anomia ao sublinhar que:",
            opcoes: [
              "O acesso aos meios ilegítimos (como redes criminosas) também é distribuído de forma desigual na sociedade.",
              "Apenas os meios legítimos importam para explicar a criminalidade.",
              "A criminalidade é exclusivamente hereditária.",
              "O crime desaparece em sociedades altamente industrializadas.",
            ],
            respostaCorreta: 0,
            dica: "Nem todos que desejam ingressar em uma 'carreira' criminosa organizada possuem acesso a essa oportunidade.",
            justificativa:
              "Cloward e Ohlin destacam que o acesso às estruturas e oportunidades de aprendizagem criminosa (meios ilegítimos) também é desigual na estrutura social.",
          },
          {
            id: 6,
            nivel: "medio",
            pergunta:
              "Marvin Wolfgang, em seus estudos de coorte em Filadélfia, demonstrou que:",
            opcoes: [
              "Uma pequena percentagem de infratores ('delinquentes crônicos') é responsável pela maioria desproporcional dos crimes.",
              "Todos os jovens de uma mesma geração cometem exatamente o mesmo número de infrações.",
              "O crime violento não possui qualquer relação com a faixa etária.",
              "As estatísticas oficiais representam integralmente a totalidade dos crimes.",
            ],
            respostaCorreta: 0,
            dica: "Estudo longitudinal com coorte de nascimento (birth cohort).",
            justificativa:
              "O estudo de Wolfgang provou que cerca de 6% dos jovens de uma coorte eram 'reincidentes/delinquentes crônicos' responsáveis por mais da metade de todos os delitos cometidos pelo grupo.",
          },
          {
            id: 7,
            nivel: "dificil",
            pergunta:
              "O conceito de 'vergonha reintegrativa' (reintegrative shaming), proposto por John Braithwaite, caracteriza-se por:",
            opcoes: [
              "Excluir e estigmatizar permanentemente o infrator do convívio comunitário.",
              "Desaprovar a conduta criminosa mantendo o respeito pelo indivíduo, facilitando sua reintegração social.",
              "Ignorar completamente o dano e o sofrimento causados à vítima.",
              "Exigir obrigatoriamente a aplicação de penas privativas de liberdade prolongadas.",
            ],
            respostaCorreta: 1,
            dica: "Condenar o ato delitivo sem rejeitar nem demonizar a pessoa que o praticou.",
            justificativa:
              "Braithwaite defende que reprovar o comportamento, mas acolher a pessoa, reduz taxas de reincidência, ao contrário da estigmatização violenta.",
          },
          {
            id: 8,
            nivel: "dificil",
            pergunta:
              "Nils Christie introduziu o conceito de 'vítima ideal' para descrever:",
            opcoes: [
              "A vítima que obtém indenização integral imediata do Estado.",
              "O perfil social que obtém reconhecimento e legitimidade sem hesitação pelos órgãos de controle e sociedade.",
              "A inexistência de vítimas em crimes econômicos corporativos.",
              "Um modelo estritamente dogmático sem repercussão sociológica.",
            ],
            respostaCorreta: 1,
            dica: "Refere-se ao perfil vulnerável e sem relação prévia com o agressor que facilmente mobiliza a empatia pública.",
            justificativa:
              "Christie mostra que certas vítimas (ex.: idosos ou crianças fracas, em local respeitável, atacados por estranhos) obtêm status imediato de vítima, enquanto outras sofrem desconfiança social.",
          },
          {
            id: 9,
            nivel: "facil",
            pergunta:
              "A Teoria da Atividade Rotineira (Cohen e Felson) defende que o crime ocorre com a convergência de três elementos no tempo e espaço:",
            opcoes: [
              "Um infrator motivado, um alvo adequado e a ausência de um guardião capaz.",
              "Pobreza extrema, ausência de leis e clima tropical.",
              "Elevada escolaridade, estabilidade financeira e boa saúde mental.",
              "Presença de patrulha policial, iluminação ostensiva e vigilância comunitária.",
            ],
            respostaCorreta: 0,
            dica: "Modelo de oportunidade situacional do cotidiano.",
            justificativa:
              "A convergência do infrator, da vítima/objeto vulnerável e da falta de proteção ou vigilância efetiva propicia a consumação do delito.",
          },
          {
            id: 10,
            nivel: "medio",
            pergunta:
              "A Teoria da Escolha Racional (Cornish e Clarke) sustenta que o infrator:",
            opcoes: [
              "Age motivado exclusivamente por impulsos irracionais e incontroláveis.",
              "Pondera, de forma limitada e situacional, os riscos, custos e benefícios antes da ação.",
              "É incapaz de avaliar as consequências de seus atos.",
              "Ignora inteiramente a probabilidade de ser capturado.",
            ],
            respostaCorreta: 1,
            dica: "Trata-se de uma 'racionalidade limitada' (bounded rationality).",
            justificativa:
              "Infratores avaliam a facilidade, o ganho esperado e o risco de captura de forma rápida e situacional para tomar a decisão delitiva.",
          },
          {
            id: 11,
            nivel: "dificil",
            pergunta:
              "A Teoria Geral da Tensão (Robert Agnew) ampliou os conceitos clássicos da anomia ao incluir como fonte de estresse:",
            opcoes: [
              "Exclusivamente o bloqueio de metas financeiras de ascensão social.",
              "A perda de estímulos positivos e a exposição a eventos aversivos ou nocivos (como abusos e perdas).",
              "Apenas aberrações ou mutações cromossômicas.",
              "A total ausência de conflitos e emoções negativas no cotidiano.",
            ],
            respostaCorreta: 1,
            dica: "Inclui fontes emocionais e relacionais de estresse no ciclo de vida do indivíduo.",
            justificativa:
              "Agnew identificou que vivências traumáticas, perdas afetivas e agressões (estímulos aversivos) geram raiva e frustração que podem desencadear a delinquência.",
          },
          {
            id: 12,
            nivel: "dificil",
            pergunta:
              "A Teoria Geral do Crime (Gottfredson e Hirschi) indica que o principal determinante do comportamento criminoso é:",
            opcoes: [
              "O baixo autocontrole, estruturado na infância através do processo de socialização familiar.",
              "A aprendizagem exclusiva em organizações mafiosas ou de crime organizado.",
              "O rótulo formal aplicado pelos Tribunais de Justiça.",
              "Fatores puramente macroeconômicos vivenciados na fase adulta.",
            ],
            respostaCorreta: 0,
            dica: "Atributo individual relativamente estável formulado na infância.",
            justificativa:
              "Autores apontam que falhas na supervisão e afeto parental geram indivíduos com baixo autocontrole, mais suscetíveis a comportamentos impulsivos e delitivos.",
          },
          {
            id: 13,
            nivel: "dificil",
            pergunta:
              "Em 'Seductions of Crime', Jack Katz analisa o fenômeno delitivo dando destaque para:",
            opcoes: [
              "Determinações econômicas mecânicas e quantitativas.",
              "A experiência emocional, a adrenalina, o fascínio e os significados morais vivenciados no momento da ação.",
              "Herdabilidade e medições craniométricas.",
              "A inutilidade da análise da subjetividade humana.",
            ],
            respostaCorreta: 1,
            dica: "Abordagem fenomenológica: o 'sabor' e a emoção do ato criminoso para quem o pratica.",
            justificativa:
              "Katz ressalta que o crime produz estados emocionais intensos (como emoção, dominação e orgulho) que exercem atração e sedução direta sobre o agente.",
          },
          {
            id: 14,
            nivel: "medio",
            pergunta:
              "A Teoria da Contenção (Walter Reckless) fundamenta que a conduta cumpridora da lei resulta de:",
            opcoes: [
              "Contenção exclusivamente externa exercida pelo sistema penal.",
              "Interação entre contenção interna (autoconceito, tolerância à frustração) e externa (família, escola, grupo social).",
              "Inexistência de mecanismos repressivos ou educativos.",
              "Condicionamentos biológicos imutáveis.",
            ],
            respostaCorreta: 1,
            dica: "Amparo duplo: forças de controle internas da mente e forças de controle externas do meio social.",
            justificativa:
              "Reckless afirma que barreiras internas (autoimagem moral) e externas (supervisão social e familiar) repelem os impulsos e pressões para o crime.",
          },
          {
            id: 15,
            nivel: "medio",
            pergunta:
              "Ronald Akers expandiu a Teoria da Associação Diferencial incorporando princípios da psicologia comportamental como:",
            opcoes: [
              "Reforço diferencial, imitação/modelagem e definições cognitivas.",
              "Genética quantitativa avançada.",
              "Cartografia do espaço urbano e ecologia social.",
              "Algoritmos de predição criminal estatística.",
            ],
            respostaCorreta: 0,
            dica: "Teoria da Aprendizagem Social (Social Learning Theory).",
            justificativa:
              "Akers acrescentou o reforço operante e o aprendizado vicário (observação e imitação) para explicar como comportamentos desviantes são mantidos.",
          },
          {
            id: 16,
            nivel: "medio",
            pergunta:
              "David Farrington, por meio do estudo longitudinal de Cambridge, consagrou qual vertente criminológica?",
            opcoes: [
              "Criminologia Desenvolvimental e do Curso de Vida.",
              "Escola Clássica e Contratualismo Penal.",
              "Teoria do Atavismo e Antropologia Criminal.",
              "Abolicionismo Penal Radical.",
            ],
            respostaCorreta: 0,
            dica: "Pesquisa longitudinal que acompanha indivíduos da infância até a fase adulta.",
            justificativa:
              "Farrington demonstrou a importância de analisar fatores de risco e de proteção ao longo das etapas de desenvolvimento e idade dos sujeitos.",
          },
          {
            id: 17,
            nivel: "dificil",
            pergunta:
              "A Teoria da Ação Situacional (Situational Action Theory), de Per-Olof Wikström, analisa o crime a partir da relação entre:",
            opcoes: [
              "A propensão moral do indivíduo e o contexto moral do ambiente imediato.",
              "Variações do Produto Interno Bruto (PIB) nacional.",
              "Cor dos uniformes e iluminação da via pública exclusivamente.",
              "A densidade populacional absoluta da cidade.",
            ],
            respostaCorreta: 0,
            dica: "Integração entre 'quem a pessoa é moralmente' e 'as regras/oportunidades do local'.",
            justificativa:
              "Wikström defende que a ação ocorre quando a moralidade individual percebe e escolhe o crime como alternativa diante de um ambiente propício.",
          },
          {
            id: 18,
            nivel: "facil",
            pergunta:
              "Os estudos de C. Ray Jeffery (CPTED) e Oscar Newman ('Espaço Defensável') revolucionaram a prevenção ao focar em:",
            opcoes: [
              "Desenho urbano, arquitetura e modificação do ambiente físico para inibir crimes.",
              "Aumento exclusivo e massivo de patrulhas armadas.",
              "Desconsideração total da influência do espaço na conduta.",
              "Tratamentos hormonais e psiquiátricos compulsórios.",
            ],
            respostaCorreta: 0,
            dica: "Prevenção do crime através do design do ambiente e controle territorial.",
            justificativa:
              "Ambos demonstraram que o planejamento urbano (visibilidade, territorialidade, acessos) reduz as oportunidades e a atratividade das infrações.",
          },
          {
            id: 19,
            nivel: "medio",
            pergunta:
              "Patricia e Paul Brantingham (Criminologia Ambiental) utilizam os conceitos de 'nós' (nodes) e 'trajetos' (paths) para explicar:",
            opcoes: [
              "Como a rotina de movimentação e os caminhos diários dos indivíduos moldam os padrões espaciais do crime.",
              "A influência genético-hereditária nos padrões mentais.",
              "A elaboração técnica de normas e legislações penais.",
              "A aplicação da dosimetria de penas pelo magistrado.",
            ],
            respostaCorreta: 0,
            dica: "Nós são os locais frequentados (casa, trabalho) e trajetos são as vias de deslocamento habitual.",
            justificativa:
              "Os Brantingham provaram que as oportunidades criminais emergem no cruzamento entre os espaços de rotina dos infratores e das potenciais vítimas.",
          },
          {
            id: 20,
            nivel: "dificil",
            pergunta:
              "Sheldon e Eleanor Glueck notabilizaram-se na criminologia por:",
            opcoes: [
              "Pionorismo em estudos longitudinais comparando jovens delinquentes e não delinquentes, focando na dinâmica familiar.",
              "Defenderem a infalibilidade do sistema penal retributivo.",
              "Criar a teoria da rotulagem (Labeling Approach).",
              "Fundar a primeira escola de Polícia Científica da Europa.",
            ],
            respostaCorreta: 0,
            dica: "Estudo clássico 'Unraveling Juvenile Delinquency' que acompanhou centenas de jovens.",
            justificativa:
              "Os estudos dos Glueck serviram de base empírica para teorias modernas sobre o curso da vida e o papel do ambiente familiar na prevenção da conduta antissocial.",
          },

          /* ----------------------------------------------------
           AUTORES ANGOLANOS E DA LUSOFONIA (NOVAS QUESTÕES)
           ---------------------------------------------------- */
          {
            id: 21,
            nivel: "medio",
            pergunta:
              "Em Angola, o jurista e acadêmico Prof. Doutor Raúl Araújo tem contribuído decisivamente para o pensamento jurídico-criminal ao analisar:",
            opcoes: [
              "O desenvolvimento constitucional, os Direitos Humanos e o funcionamento das instituições do sistema de justiça penal angolano.",
              "A aplicação da antropometria lombrosiana nas províncias do interior.",
              "A defesa do abolicionismo penal absoluto para todo o ordenamento jurídico.",
              "Teorias estritamente focadas na biologia molecular do criminoso.",
            ],
            respostaCorreta: 0,
            dica: "Destacado constitucionalista e jurista angolano com profunda reflexão sobre o Estado de Direito e Justiça.",
            justificativa:
              "O Prof. Doutor Raúl Araújo é uma das maiores referências do Direito Angolano, analisando a consolidação das instituições de justiça, direitos fundamentais e o controle da criminalidade sob o prisma constitucional.",
          },
          {
            id: 22,
            nivel: "dificil",
            pergunta:
              "O estudo da criminalidade urbana e da delinquência juvenil em Luanda tem enfatizado como fator sociológico determinante:",
            opcoes: [
              "O crescimento urbano desordenado, a desestruturação familiar e os desafios de integração socioeconômica nos bairros periféricos.",
              "A determinação puramente biológica associada ao clima tropical.",
              "A ausência total de leis penais codificadas no país.",
              "A influência exclusiva de fatores climatológicos regionais.",
            ],
            respostaCorreta: 0,
            dica: "Pense na rápida expansão demográfica, migração rural-urbana e fatores socioeconômicos dos centros urbanos angolanos.",
            justificativa:
              "Pesquisadores da realidade sociocriminal angolana (como João Valente da Cruz e sociólogos urbanos) destacam o impacto do êxodo, urbanização acelerada e vulnerabilidade social na eclosão de fenômenos de delinquência juvenil.",
          },
          {
            id: 23,
            nivel: "medio",
            pergunta:
              "Na doutrina de Direito Penal e Criminologia em Angola, o Jurista e Professor Manuel Simão destaca-se por abordar:",
            opcoes: [
              "Os fundamentos da responsabilidade penal, as garantias do arguição e a dogmática do Código Penal Angolano.",
              "A defesa da pena de morte como principal solução criminológica.",
              "A eliminação do papel do advogado no processo penal.",
              "A teoria da eugenia e seleção biológica de infratores.",
            ],
            respostaCorreta: 0,
            dica: "Foco no novo ordenamento jurídico-penal angolano e na dogmática criminal.",
            justificativa:
              "A literatura jurídica e criminológica recente em Angola debruça-se sobre a adequação das normas penais aos princípios constitucionais e à realidade social do país.",
          },
          {
            id: 24,
            nivel: "medio",
            pergunta:
              "No contexto angolano, a análise das infrações econômicas e corrupção (Crimes de 'Colarinho Branco') dialoga com a teoria clássica de:",
            opcoes: [
              "Edwin Sutherland, ressaltando que estes delitos são praticados por pessoas de elevado status e respeitabilidade no exercício de suas funções.",
              "Cesare Lombroso, buscando estigmas físicos nos gestores públicos.",
              "Adolphe Quetelet, limitando-se apenas à influência das estações do ano.",
              "Franz von Liszt, reduzindo o crime a reações biológicas involuntárias.",
            ],
            respostaCorreta: 0,
            dica: "Conceito de 'White-Collar Crime' aplicado ao combate à improbidade e crimes financeiros.",
            justificativa:
              "A criminologia contemporânea em Angola utiliza a Teoria do Crime de Colarinho Branco de Sutherland para compreender a delinquência econômica e institucional.",
          },
          {
            id: 25,
            nivel: "dificil",
            pergunta:
              "A abordagem da Criminologia Crítica na Lusofonia (com autores como Alessandro Baratta e pesquisadores africanos) propõe:",
            opcoes: [
              "Questionar a seletividade do sistema penal e examinar como os processos de criminalização afetam desproporcionalmente as classes desfavorecidas.",
              "Defender o aumento de penas sem qualquer garantia processual.",
              "Demonstrar que o sistema penal atua com absoluta igualdade em todas as camadas sociais.",
              "Restringir o estudo do crime às características anatômicas do crânio.",
            ],
            respostaCorreta: 0,
            dica: "Foco no controle social, na seletividade punitiva e no papel do Estado.",
            justificativa:
              "A Criminologia Crítica demonstra que o sistema de justiça penal opera de forma seletiva, estigmatizando determinados grupos sociais e falhando em incidir com a mesma força sobre os crimes das elites.",
          },
        ],
      },
    ],
  },
];
