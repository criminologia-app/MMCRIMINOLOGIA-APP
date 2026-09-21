/* Firebase / Firestore — ficheiro carregado pelas páginas treino.html e pontuacoes.html. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  increment,
  arrayUnion,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/*
 * Estes dados devem ser os da aplicação WEB em Firebase Console > Definições
 * do projeto > As suas aplicações. Não use google-services.json aqui: esse
 * ficheiro é exclusivo da aplicação Android.
 *
 * ATENÇÃO: os valores abaixo já existiam no projeto, mas o appId e o
 * messagingSenderId não coincidem com o project_number de google-services.json
 * (153650886107). Substitua-os pela configuração Web oficial antes de publicar.
 */
const firebaseConfig = {
  apiKey: "AIzaSyA8wKOVv2OpBWAJeGxt4vwGaGAgeWndFVM",
  authDomain: "mmcriminologia.firebaseapp.com",
  projectId: "mmcriminologia",
  storageBucket: "mmcriminologia.firebasestorage.app",
  messagingSenderId: "738693788238",
  appId: "1:738693788238:web:d37ce10ee31f12402b091f",
};

let db;
try {
  db = getFirestore(initializeApp(firebaseConfig));
} catch (erro) {
  console.error("Não foi possível inicializar o Firebase:", erro);
}

const COLECAO_RANKING = "ranking_agentes";

async function firebaseAtualizarProgresso(id, nome, pontosGanhos, cadeiraConcluida) {
  if (!db) return;
  try {
    await setDoc(
      doc(db, COLECAO_RANKING, String(id)),
      {
        id: String(id),
        nome: String(nome || "Agente"),
        pontos: increment(Number(pontosGanhos) || 0),
        cadeiras: arrayUnion(String(cadeiraConcluida || "")),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (erro) {
    console.error("Erro ao gravar pontuação no Firebase:", erro);
  }
}

function firebaseEscutarRanking(aoAtualizar) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, COLECAO_RANKING),
    (snapshot) => aoAtualizar(snapshot.docs.map((docSnap) => docSnap.data())),
    (erro) => console.error("Erro ao ouvir o ranking do Firebase:", erro),
  );
}

window.firebaseAtualizarProgresso = firebaseAtualizarProgresso;
window.firebaseEscutarRanking = firebaseEscutarRanking;
window.dispatchEvent(new Event("firebase-pronto"));
console.info("Firebase carregado para o projeto", firebaseConfig.projectId);
