import { useEffect, useMemo, useState } from "react";
 
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
 
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
 
import { auth, db } from "./firebase";
 
type TipoUsuario = "admin" | "professor" | "aluno";
type StatusUsuario = "pendente" | "aprovado" | "bloqueado";
 
type Perfil = {
  uid: string;
  nome: string;
  email: string;
  tipo: TipoUsuario;
  status?: StatusUsuario;
  primeiroAcesso?: boolean;
  professorEmail?: string;
  foto?: string;
  formacao?: string;
  especialidade?: string;
  cref?: string;
  descricao?: string;
  ativo?: boolean;
  plano?: string;
  licencaTipo?: string;
  licencaInicio?: string;
  licencaFim?: string;
  limiteAlunos?: number;
  mensalidadeValor?: string;
  mensalidadePagaEm?: string;
  observacaoAdmin?: string;
  aprovadoEm?: string;
  bloqueadoEm?: string;
  atualizadoEm?: string;
};
 
type ConfigSistema = {
  whatsapp: string;
  email: string;
  textoContato: string;
};
 
type AvaliacaoFisica = {
  id: string;
  data: string;
  peso: string;
  altura: string;
  imc: string;
  gordura: string;
  massaMagra: string;
  pescoco: string;
  ombros: string;
  torax: string;
  cintura: string;
  abdomen: string;
  quadril: string;
  bicepsDireito: string;
  bicepsEsquerdo: string;
  antebracoDireito: string;
  antebracoEsquerdo: string;
  coxaDireita: string;
  coxaEsquerda: string;
  panturrilhaDireita: string;
  panturrilhaEsquerda: string;
  observacoes: string;
};
 
type Aluno = {
  id: string;
  uid?: string;
  nome: string;
  email: string;
  foto?: string;
  professorEmail: string;
  criadoEm?: any;
  avaliacoes?: AvaliacaoFisica[];
};
 
type Exercicio = {
  id: string;
  nome: string;
  series: string;
  repeticoes: string;
  descanso: string;
  cargaSugerida: string;
  metodo: string;
  velocidade: string;
  video: string;
  obsProfessor: string;
  obsAluno: string;
  cargaAtual: string;
  ultimaCarga: string;
  seriesConcluidas: number[];
  finalizado: boolean;
  ordem: number;
  historicoCargas: { carga: string; data: string }[];
};
 
type Treino = {
  id: string;
  nome: string;
  dataTreino?: string;
  dataCriacao?: string;
  alunoId: string;
  alunoNome: string;
  alunoEmail: string;
  professorEmail: string;
  exercicios: Exercicio[];
  mensagens: { texto: string; autor: string; data: string }[];
  criadoEm?: any;
  atualizadoEm?: any;
  treinoFinalizado?: boolean;
  treinoFinalizadoEm?: string;
  percentualConcluido?: number;
  exerciciosPulados?: string[];
  reiniciadoEm?: string;
};
 
type TreinoModelo = {
  id: string;
  nome: string;
  descricao?: string;
  professorEmail: string;
  exercicios: Exercicio[];
  origemTreinoId?: string;
  autoCriado?: boolean;
  criadoEm?: any;
  atualizadoEm?: any;
};
 
const CACHE_TREINOS = "evotrain_cache_treinos_v2";
const uid = () => Date.now().toString() + Math.random().toString(16).slice(2);
 
// Coloque aqui o e-mail administrador do sistema.
const ADMIN_EMAILS = [
  "moisesmtc28@gmail.com",
  "moisesthadeu@live.com",
].map((email) => email.toLowerCase());

const LICENCAS_ADMIN = [
  { label: "Vitalícia", valor: "vitalicia", dias: 0 },
  { label: "30 dias", valor: "30dias", dias: 30 },
  { label: "60 dias", valor: "60dias", dias: 60 },
  { label: "90 dias", valor: "90dias", dias: 90 },
  { label: "120 dias", valor: "120dias", dias: 120 },
];

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function somarDiasISO(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function calcularDiasRestantes(professor: Perfil) {
  if (professor.licencaTipo === "vitalicia") return 9999;
  if (!professor.licencaFim) return 9999;

  const hoje = new Date(hojeISO()).getTime();
  const fim = new Date(professor.licencaFim).getTime();
  return Math.ceil((fim - hoje) / 86400000);
}

function licencaProfessorVencida(professor: Perfil) {
  if (professor.tipo !== "professor") return false;
  if (professor.status === "bloqueado") return true;
  if (professor.licencaTipo === "vitalicia") return false;
  if (!professor.licencaFim) return false;
  return calcularDiasRestantes(professor) < 0;
}

function textoLicenca(professor: Perfil) {
  if (professor.licencaTipo === "vitalicia") return "Vitalícia";
  if (!professor.licencaFim) return "Sem vencimento definido";
  const dias = calcularDiasRestantes(professor);
  if (dias < 0) return `Vencida há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "Vence hoje";
  return `${dias} dia(s) restantes`;
}
 
export default function App() {
  const [usuario, setUsuario] = useState<any>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
 
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
 
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [usuariosSistema, setUsuariosSistema] = useState<Perfil[]>([]);
  const [treinos, setTreinos] = useState<Treino[]>(() => {
    const cache = localStorage.getItem(CACHE_TREINOS);
    return cache ? JSON.parse(cache) : [];
  });
 
  const [modelosTreino, setModelosTreino] = useState<TreinoModelo[]>([]);
  const [modeloSelecionadoId, setModeloSelecionadoId] = useState("");
  const [nomeModelo, setNomeModelo] = useState("");
  const [descricaoModelo, setDescricaoModelo] = useState("");
 
  const [novoAlunoNome, setNovoAlunoNome] = useState("");
  const [novoAlunoEmail, setNovoAlunoEmail] = useState("");
  const [novoAlunoSenha, setNovoAlunoSenha] = useState("");
  const [novoAlunoFoto, setNovoAlunoFoto] = useState("");
 
  const [alunoSelecionado, setAlunoSelecionado] = useState("");
  const [nomeTreino, setNomeTreino] = useState("");
  const [dataTreino, setDataTreino] = useState("");
  const [treinoAbertoId, setTreinoAbertoId] = useState("");
  const [mensagem, setMensagem] = useState("");
 
  const [online, setOnline] = useState(navigator.onLine);
  const [notificacoes, setNotificacoes] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
 
  const [timerAtivo, setTimerAtivo] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(0);
  const [timerInfo, setTimerInfo] = useState("Descanso");
 
  const [dragExercicioId, setDragExercicioId] = useState("");
  const [exercicioAbertoId, setExercicioAbertoId] = useState("");
  const [novoExercicioDraft, setNovoExercicioDraft] = useState<Exercicio | null>(null);
  const [abaProfessor, setAbaProfessor] = useState<"treinos" | "alunos" | "modelos">("treinos");
  const [novaSenhaPrimeiroAcesso, setNovaSenhaPrimeiroAcesso] = useState("");
 
  const [configSistema, setConfigSistema] = useState<ConfigSistema>({
    whatsapp: "37991231408",
    email: "moisesmtc28@gmail.com",
    textoContato: "Contato para adquirir o aplicativo",
  });
 
  const [alunoDashId, setAlunoDashId] = useState("");
  const avaliacaoVazia = (): AvaliacaoFisica => ({
    id: "",
    data: new Date().toISOString().slice(0, 10),
    peso: "",
    altura: "",
    imc: "",
    gordura: "",
    massaMagra: "",
    pescoco: "",
    ombros: "",
    torax: "",
    cintura: "",
    abdomen: "",
    quadril: "",
    bicepsDireito: "",
    bicepsEsquerdo: "",
    antebracoDireito: "",
    antebracoEsquerdo: "",
    coxaDireita: "",
    coxaEsquerda: "",
    panturrilhaDireita: "",
    panturrilhaEsquerda: "",
    observacoes: "",
  });
 
  const [avaliacaoDraft, setAvaliacaoDraft] = useState<AvaliacaoFisica>(
    avaliacaoVazia()
  );
 
  const isAdmin = !!perfil?.email && ADMIN_EMAILS.includes(perfil.email.toLowerCase());
 
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
 
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
 
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => console.log("Service Worker não registrado:", error));
    }
  }, []);
 
  useEffect(() => {
    carregarConfigSistema();
 
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUsuario(user);
 
      if (user) {
        await carregarPerfil(user);
      } else {
        setPerfil(null);
        setAlunos([]);
        setTreinos([]);
        setUsuariosSistema([]);
      }
    });
 
    return () => unsub();
  }, []);
 
  useEffect(() => {
    if (usuario && perfil) {
      carregarTudo();
    }
  }, [usuario, perfil]);
 
  useEffect(() => {
    localStorage.setItem(CACHE_TREINOS, JSON.stringify(treinos));
  }, [treinos]);
 
  useEffect(() => {
    if (!timerAtivo) return;
 
    if (tempoRestante <= 0) {
      setTimerAtivo(false);
      tocarSomProfissional();
      enviarNotificacao("Descanso finalizado", "Hora da próxima série!");
      return;
    }
 
    const t = setTimeout(() => setTempoRestante((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timerAtivo, tempoRestante]);
 
  const alunoSelecionadoObj = useMemo(
    () => alunos.find((aluno) => aluno.id === alunoSelecionado),
    [alunos, alunoSelecionado]
  );
 
  const treinosVisiveis = useMemo(() => {
    if (perfil?.tipo === "professor") {
      if (!alunoSelecionadoObj) return [];
 
      return treinos.filter(
        (treino) =>
          treino.alunoId === alunoSelecionadoObj.id ||
          treino.alunoEmail === alunoSelecionadoObj.email
      );
    }
 
    return treinos;
  }, [treinos, perfil, alunoSelecionadoObj]);
 
  const treinosOrdenados = useMemo(
    () =>
      [...treinosVisiveis].sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "")
      ),
    [treinosVisiveis]
  );

  const professoresSistema = useMemo(
    () => usuariosSistema.filter((u) => u.tipo === "professor"),
    [usuariosSistema]
  );

  const resumoAdmin = useMemo(() => {
    const ativos = professoresSistema.filter(
      (prof) => prof.status === "aprovado" && !licencaProfessorVencida(prof)
    ).length;

    const bloqueados = professoresSistema.filter(
      (prof) => prof.status === "bloqueado" || licencaProfessorVencida(prof)
    ).length;

    const receitaPrevista = professoresSistema.reduce((total, prof) => {
      const valor = Number(String(prof.mensalidadeValor || "0").replace(",", "."));
      return total + (isNaN(valor) ? 0 : valor);
    }, 0);

    const receitaRecebida = professoresSistema.reduce((total, prof) => {
      if (!prof.mensalidadePagaEm) return total;
      const valor = Number(String(prof.mensalidadeValor || "0").replace(",", "."));
      return total + (isNaN(valor) ? 0 : valor);
    }, 0);

    const vencendo = professoresSistema.filter((prof) => {
      const dias = calcularDiasRestantes(prof);
      return prof.licencaTipo !== "vitalicia" && dias >= 0 && dias <= 7;
    }).length;

    return {
      professores: professoresSistema.length,
      ativos,
      bloqueados,
      alunos: alunos.length,
      receitaPrevista,
      receitaRecebida,
      receitaPendente: Math.max(receitaPrevista - receitaRecebida, 0),
      vencendo,
    };
  }, [professoresSistema, alunos]);
 
  useEffect(() => {
    if (treinosOrdenados.length === 0) {
      if (treinoAbertoId) setTreinoAbertoId("");
      return;
    }
 
    const treinoAtualPertenceAoAluno = treinosOrdenados.some(
      (treino) => treino.id === treinoAbertoId
    );
 
    if (!treinoAbertoId || !treinoAtualPertenceAoAluno) {
      setTreinoAbertoId(treinosOrdenados[0].id);
    }
  }, [treinosOrdenados, treinoAbertoId]);
 
  async function carregarConfigSistema() {
    try {
      const ref = doc(db, "configuracoes", "sistema");
      const snap = await getDoc(ref);
 
      if (snap.exists()) {
        setConfigSistema({
          ...configSistema,
          ...(snap.data() as ConfigSistema),
        });
        return;
      }
 
      await setDoc(ref, configSistema);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    }
  }
 
  async function salvarConfigSistema() {
    try {
      await setDoc(doc(db, "configuracoes", "sistema"), configSistema, {
        merge: true,
      });
 
      alert("Contato salvo com sucesso.");
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar contato.");
    }
  }
 
  async function carregarPerfil(user: any) {
    const ref = doc(db, "usuarios", user.uid);
    const snap = await getDoc(ref);
    const emailUsuario = String(user.email || "").toLowerCase();
    const ehAdmin = ADMIN_EMAILS.includes(emailUsuario);
 
    if (snap.exists()) {
      const dados = snap.data() as Perfil;
 
      if (ehAdmin && dados.tipo !== "admin") {
        const perfilAdmin = {
          ...dados,
          uid: user.uid,
          tipo: "admin" as TipoUsuario,
          status: "aprovado" as StatusUsuario,
          primeiroAcesso: false,
        };
 
        await setDoc(ref, perfilAdmin, { merge: true });
        setPerfil(perfilAdmin);
        return;
      }
 
      setPerfil(dados);
      return;
    }
 
    const novoPerfil: Perfil = {
      uid: user.uid,
      nome: user.email || "",
      email: user.email || "",
      tipo: ehAdmin ? "admin" : "aluno",
      status: "aprovado",
      primeiroAcesso: false,
      foto: "",
      formacao: "",
      especialidade: "",
      cref: "",
      descricao: "",
    };
 
    await setDoc(ref, novoPerfil, { merge: true });
    setPerfil(novoPerfil);
  }
 
  async function carregarTudo() {
    if (!usuario || !perfil) return;
 
    if (isAdmin) {
      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      const listaUsuarios = usuariosSnap.docs.map((d) => {
        const dados = d.data() as any;
        return {
          uid: d.id,
          ...dados,
        } as Perfil;
      });
 
      setUsuariosSistema(listaUsuarios);
    }
 
    let qAlunos: any;
 
    if (perfil.tipo === "professor") {
      qAlunos = query(
        collection(db, "alunos"),
        where("professorEmail", "==", usuario.email)
      );
    } else if (perfil.tipo === "aluno") {
      qAlunos = query(
        collection(db, "alunos"),
        where("email", "==", usuario.email)
      );
    } else {
      qAlunos = collection(db, "alunos");
    }
 
    const alunosSnap = await getDocs(qAlunos);
    const listaAlunos = alunosSnap.docs.map((d) => {
      const dados = d.data() as any;
      return {
        id: d.id,
        ...dados,
      } as Aluno;
    });
 
    setAlunos(listaAlunos);
 
    const treinosRef = collection(db, "treinos");
    let qTreinos: any;
 
    if (perfil.tipo === "professor") {
      qTreinos = query(treinosRef, where("professorEmail", "==", usuario.email));
    } else if (perfil.tipo === "aluno") {
      qTreinos = query(treinosRef, where("alunoEmail", "==", usuario.email));
    } else {
      qTreinos = treinosRef;
    }
 
    const treinosSnap = await getDocs(qTreinos);
    const listaTreinos = treinosSnap.docs.map((d) => {
      const dados = d.data() as any;
      return {
        id: d.id,
        ...dados,
      } as Treino;
    });
 
    setTreinos(listaTreinos);
 
    if (perfil.tipo === "professor") {
      const modelosSnap = await getDocs(
        query(collection(db, "modelosTreino"), where("professorEmail", "==", usuario.email))
      );
 
      const listaModelos = modelosSnap.docs.map((d) => {
        const dados = d.data() as any;
        return {
          id: d.id,
          ...dados,
          exercicios: dados.exercicios || [],
        } as TreinoModelo;
      });
 
      setModelosTreino(listaModelos);
    }
 
    if (perfil.tipo !== "professor" && !treinoAbertoId && listaTreinos[0]) {
      setTreinoAbertoId(listaTreinos[0].id);
    }
  }
 
 
  async function migrarDadosSemPerder() {
    if (!isAdmin) {
      alert("Apenas administrador pode executar a migração.");
      return;
    }
 
    const confirmar = confirm(
      "Essa rotina NÃO apaga dados. Ela apenas adiciona campos novos que estiverem faltando em alunos e treinos antigos. Deseja continuar?"
    );
 
    if (!confirmar) return;
 
    try {
      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      const alunosSnap = await getDocs(collection(db, "alunos"));
      const treinosSnap = await getDocs(collection(db, "treinos"));

      await Promise.all(
        usuariosSnap.docs.map((documento) => {
          const dados = documento.data() as any;

          if (dados.tipo !== "professor") return Promise.resolve();

          return setDoc(
            doc(db, "usuarios", documento.id),
            {
              ativo: dados.ativo ?? dados.status !== "bloqueado",
              plano: dados.plano || "Padrão",
              licencaTipo: dados.licencaTipo || "vitalicia",
              licencaInicio: dados.licencaInicio || dados.aprovadoEm || hojeISO(),
              licencaFim: dados.licencaFim || "",
              limiteAlunos: dados.limiteAlunos || 10,
              mensalidadeValor: dados.mensalidadeValor || "",
              mensalidadePagaEm: dados.mensalidadePagaEm || "",
              observacaoAdmin: dados.observacaoAdmin || "",
              atualizadoEm: dados.atualizadoEm || new Date().toISOString(),
            },
            { merge: true }
          );
        })
      );
 
      await Promise.all(
        alunosSnap.docs.map((documento) => {
          const dados = documento.data() as any;
 
          return setDoc(
            doc(db, "alunos", documento.id),
            {
              avaliacoes: dados.avaliacoes || [],
              atualizadoEm: dados.atualizadoEm || new Date().toISOString(),
            },
            { merge: true }
          );
        })
      );
 
      await Promise.all(
        treinosSnap.docs.map((documento) => {
          const dados = documento.data() as any;
 
          return setDoc(
            doc(db, "treinos", documento.id),
            {
              dataCriacao:
                dados.dataCriacao ||
                dados.criadoEm ||
                dados.dataTreino ||
                new Date().toISOString(),
              versaoFicha: dados.versaoFicha || 2,
              exercicios: dados.exercicios || [],
              mensagens: dados.mensagens || [],
              treinoFinalizado: dados.treinoFinalizado || false,
              percentualConcluido: dados.percentualConcluido || 0,
              exerciciosPulados: dados.exerciciosPulados || [],
              atualizadoEm: dados.atualizadoEm || new Date().toISOString(),
            },
            { merge: true }
          );
        })
      );
 
      alert("Migração concluída sem apagar dados.");
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro na migração. Verifique as regras do Firestore.");
    }
  }
 
  async function cadastrar() {
    try {
      if (!email.includes("@")) return alert("Digite um e-mail válido.");
      if (senha.length < 6) {
        return alert("A senha precisa ter no mínimo 6 caracteres.");
      }
 
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
 
      const novoPerfil: Perfil = {
        uid: cred.user.uid,
        nome: email,
        email,
        tipo: "professor",
        status: "pendente",
        primeiroAcesso: false,
        foto: "",
        formacao: "",
        especialidade: "",
        cref: "",
        descricao: "",
      };
 
      await setDoc(
        doc(db, "usuarios", cred.user.uid),
        {
          ...novoPerfil,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
      alert("Solicitação enviada. Aguarde aprovação do administrador.");
    } catch (e: any) {
      alert(traduzErro(e.message));
    }
  }
 
  async function entrar() {
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (e: any) {
      alert(traduzErro(e.message));
    }
  }
 
  async function recuperarSenha() {
    try {
      if (!email.includes("@")) {
        return alert("Digite seu e-mail para recuperar a senha.");
      }
 
      await sendPasswordResetEmail(auth, email);
      alert("E-mail de recuperação enviado.");
    } catch (e: any) {
      alert(traduzErro(e.message));
    }
  }
 
  async function sair() {
    await signOut(auth);
    setPerfil(null);
  }
 
  async function salvarPerfil() {
    if (!perfil) return;
 
    await setDoc(
      doc(db, "usuarios", perfil.uid),
      {
        ...perfil,
        atualizadoEm: new Date().toISOString(),
      } as any,
      { merge: true }
    );
    alert("Perfil salvo!");
  }
 
  async function aprovarProfessor(professor: Perfil) {
    try {
      await setDoc(
        doc(db, "usuarios", professor.uid),
        {
          ...professor,
          tipo: "professor",
          status: "aprovado",
          ativo: true,
          plano: (professor as any).plano || "Padrão",
          licencaTipo: (professor as any).licencaTipo || "30dias",
          licencaInicio: (professor as any).licencaInicio || hojeISO(),
          licencaFim: (professor as any).licencaFim || somarDiasISO(30),
          limiteAlunos: (professor as any).limiteAlunos || 10,
          mensalidadeValor: (professor as any).mensalidadeValor || "",
          mensalidadePagaEm: (professor as any).mensalidadePagaEm || hojeISO(),
          observacaoAdmin: (professor as any).observacaoAdmin || "",
          aprovadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        } as any,
        { merge: true }
      );
 
      alert("Professor aprovado.");
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao aprovar professor. Verifique as regras do Firestore.");
    }
  }
 
  async function bloquearProfessor(professor: Perfil) {
    if (!confirm(`Bloquear professor ${professor.email}?`)) return;
 
    try {
      await setDoc(
        doc(db, "usuarios", professor.uid),
        {
          status: "bloqueado",
          ativo: false,
          bloqueadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
 
      alert("Professor bloqueado.");
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao bloquear professor.");
    }
  }

  async function liberarProfessor(professor: Perfil) {
    try {
      await setDoc(
        doc(db, "usuarios", professor.uid),
        {
          status: "aprovado",
          ativo: true,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );

      alert("Professor liberado.");
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao liberar professor.");
    }
  }

  async function renovarLicencaProfessor(professor: Perfil, licencaTipo: string) {
    const licenca = LICENCAS_ADMIN.find((item) => item.valor === licencaTipo);
    if (!licenca) return;

    const inicio = hojeISO();
    const fim = licenca.valor === "vitalicia" ? "" : somarDiasISO(licenca.dias);

    try {
      await setDoc(
        doc(db, "usuarios", professor.uid),
        {
          status: "aprovado",
          ativo: true,
          licencaTipo: licenca.valor,
          licencaInicio: inicio,
          licencaFim: fim,
          mensalidadePagaEm: inicio,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );

      alert(`Licença atualizada para ${licenca.label}.`);
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao renovar licença.");
    }
  }

  async function editarLimiteAlunosProfessor(professor: Perfil) {
    const atual = String(professor.limiteAlunos || 10);
    const novoLimite = prompt("Digite o limite de alunos deste professor:", atual);
    if (!novoLimite) return;

    const limite = Number(novoLimite);
    if (!limite || limite < 1) {
      alert("Digite um número válido maior que zero.");
      return;
    }

    await setDoc(
      doc(db, "usuarios", professor.uid),
      { limiteAlunos: limite, atualizadoEm: new Date().toISOString() },
      { merge: true }
    );

    alert("Limite de alunos atualizado.");
    carregarTudo();
  }

  async function editarValorPlanoProfessor(professor: Perfil) {
    const novoValor = prompt(
      "Valor da mensalidade/plano:",
      professor.mensalidadeValor || "79,90"
    );
    if (novoValor === null) return;

    await setDoc(
      doc(db, "usuarios", professor.uid),
      { mensalidadeValor: novoValor, atualizadoEm: new Date().toISOString() },
      { merge: true }
    );

    alert("Valor atualizado.");
    carregarTudo();
  }

  async function editarObservacaoAdminProfessor(professor: Perfil) {
    const observacao = prompt(
      "Observação administrativa:",
      professor.observacaoAdmin || ""
    );
    if (observacao === null) return;

    await setDoc(
      doc(db, "usuarios", professor.uid),
      { observacaoAdmin: observacao, atualizadoEm: new Date().toISOString() },
      { merge: true }
    );

    alert("Observação salva.");
    carregarTudo();
  }

  async function marcarPagamentoProfessor(professor: Perfil) {
    const dataPagamento = prompt("Data do pagamento:", hojeISO());
    if (!dataPagamento) return;

    await setDoc(
      doc(db, "usuarios", professor.uid),
      { mensalidadePagaEm: dataPagamento, atualizadoEm: new Date().toISOString() },
      { merge: true }
    );

    alert("Pagamento registrado.");
    carregarTudo();
  }
 
  async function cadastrarAluno() {
    if (!usuario) return;

    if (perfil?.tipo === "professor") {
      if (licencaProfessorVencida(perfil)) {
        alert("Sua licença está vencida. Entre em contato com o administrador.");
        return;
      }

      const limite = Number(perfil.limiteAlunos || 10);
      const alunosAtivosProfessor = alunos.filter(
        (aluno) => aluno.professorEmail === usuario.email
      ).length;

      if (alunosAtivosProfessor >= limite) {
        alert(`Limite de alunos atingido (${alunosAtivosProfessor}/${limite}).`);
        return;
      }
    }
 
    if (!novoAlunoNome || !novoAlunoEmail.includes("@")) {
      alert("Preencha nome e e-mail válido do aluno.");
      return;
    }
 
    if (novoAlunoSenha.length < 6) {
      alert("Digite uma senha provisória com no mínimo 6 caracteres.");
      return;
    }
 
    try {
      const apiKey = (auth.app.options as any).apiKey;
 
      const resposta = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: novoAlunoEmail,
            password: novoAlunoSenha,
            returnSecureToken: false,
          }),
        }
      );
 
      const dadosAuth = await resposta.json();
 
      if (!resposta.ok) {
        throw new Error(dadosAuth?.error?.message || "Erro ao criar login do aluno.");
      }
 
      const alunoUid = dadosAuth.localId;
 
      await setDoc(
        doc(db, "usuarios", alunoUid),
        {
          uid: alunoUid,
          nome: novoAlunoNome,
          email: novoAlunoEmail,
          tipo: "aluno",
          status: "aprovado",
          primeiroAcesso: true,
          professorEmail: usuario.email,
          foto: novoAlunoFoto,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
 
      await addDoc(collection(db, "alunos"), {
        uid: alunoUid,
        nome: novoAlunoNome,
        email: novoAlunoEmail,
        foto: novoAlunoFoto,
        professorEmail: usuario.email,
        criadoEm: new Date(),
      });
 
      setNovoAlunoNome("");
      setNovoAlunoEmail("");
      setNovoAlunoSenha("");
      setNovoAlunoFoto("");
 
      alert(
        "Aluno criado com senha provisória. No primeiro acesso ele será obrigado a trocar a senha."
      );
 
      carregarTudo();
    } catch (e: any) {
      alert(traduzErro(e.message));
    }
  }
 
  async function excluirAluno(aluno: Aluno) {
    if (!usuario) return;
 
    const confirmar = confirm(
      `Deseja excluir o aluno ${aluno.nome}? Os treinos dele também serão excluídos.`
    );
 
    if (!confirmar) return;
 
    try {
      await deleteDoc(doc(db, "alunos", aluno.id));
 
      if (aluno.uid) {
        await updateDoc(doc(db, "usuarios", aluno.uid), {
          status: "bloqueado",
        });
      }
 
      const qTreinosAluno = query(
        collection(db, "treinos"),
        where("professorEmail", "==", usuario.email),
        where("alunoEmail", "==", aluno.email)
      );
 
      const snap = await getDocs(qTreinosAluno);
 
      await Promise.all(
        snap.docs.map((documento) =>
          deleteDoc(doc(db, "treinos", documento.id))
        )
      );
 
      if (alunoSelecionado === aluno.id) {
        setAlunoSelecionado("");
        setTreinoAbertoId("");
      }
 
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir aluno.");
    }
  }
 
  async function editarEmailAluno(aluno: Aluno) {
    const novoEmail = prompt("Digite o novo e-mail do aluno:", aluno.email);
 
    if (!novoEmail || !novoEmail.includes("@")) {
      alert("E-mail inválido.");
      return;
    }
 
    try {
      await updateDoc(doc(db, "alunos", aluno.id), {
        email: novoEmail,
      });
 
      if (aluno.uid) {
        await updateDoc(doc(db, "usuarios", aluno.uid), {
          email: novoEmail,
        });
      }
 
      const qTreinosAluno = query(
        collection(db, "treinos"),
        where("alunoEmail", "==", aluno.email)
      );
 
      const snap = await getDocs(qTreinosAluno);
 
      await Promise.all(
        snap.docs.map((documento) =>
          updateDoc(doc(db, "treinos", documento.id), {
            alunoEmail: novoEmail,
          })
        )
      );
 
      alert(
        "E-mail alterado no cadastro do app. Para alterar também o e-mail de login do Firebase Auth, use Firebase Functions/Admin SDK."
      );
 
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao editar e-mail do aluno.");
    }
  }
 
  async function zerarDadosProfessor() {
    if (!usuario) return;
 
    const confirmacao = prompt(
      "Isso vai apagar TODOS os alunos e TODOS os treinos deste professor. Digite ZERAR para confirmar."
    );
 
    if (confirmacao !== "ZERAR") return;
 
    try {
      const qAlunosProfessor = query(
        collection(db, "alunos"),
        where("professorEmail", "==", usuario.email)
      );
 
      const qTreinosProfessor = query(
        collection(db, "treinos"),
        where("professorEmail", "==", usuario.email)
      );
 
      const [alunosSnap, treinosSnap] = await Promise.all([
        getDocs(qAlunosProfessor),
        getDocs(qTreinosProfessor),
      ]);
 
      await Promise.all([
        ...alunosSnap.docs.map((documento) =>
          deleteDoc(doc(db, "alunos", documento.id))
        ),
        ...treinosSnap.docs.map((documento) =>
          deleteDoc(doc(db, "treinos", documento.id))
        ),
      ]);
 
      setAlunos([]);
      setTreinos([]);
      setAlunoSelecionado("");
      setTreinoAbertoId("");
 
      alert("Banco zerado para este professor.");
      carregarTudo();
    } catch (error) {
      console.error(error);
      alert("Erro ao zerar o banco de dados.");
    }
  }
 
 
  async function salvarModeloAutomaticoDoTreino(treino: Treino, exerciciosAtualizados?: Exercicio[]) {
    if (!usuario || perfil?.tipo !== "professor") return;
 
    try {
      const exerciciosModelo = (exerciciosAtualizados || treino.exercicios || []).map(
        limparExercicioParaModelo
      );
 
      await setDoc(
        doc(db, "modelosTreino", treino.id),
        {
          nome: treino.nome || "Treino sem nome",
          descricao: `Modelo automático criado a partir da ficha de ${treino.alunoNome || "aluno"}`,
          professorEmail: usuario.email,
          origemTreinoId: treino.id,
          autoCriado: true,
          exercicios: exerciciosModelo,
          criadoEm: treino.dataCriacao || treino.criadoEm || new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Erro ao salvar modelo automático:", error);
    }
  }
 
  function limparExercicioParaModelo(exercicio: Exercicio): Exercicio {
    return {
      ...exercicio,
      id: uid(),
      cargaAtual: "",
      ultimaCarga: "",
      obsAluno: "",
      seriesConcluidas: [],
      finalizado: false,
      historicoCargas: [],
    };
  }
 
  async function salvarTreinoComoModelo(treino: Treino) {
    if (!usuario) return;
 
    const nome = prompt("Nome do modelo de treino:", treino.nome);
    if (!nome) return;
 
    await setDoc(
      doc(db, "modelosTreino", treino.id),
      {
        nome,
        descricao: `Modelo criado a partir do treino ${treino.nome}`,
        professorEmail: usuario.email,
        origemTreinoId: treino.id,
        autoCriado: false,
        exercicios: (treino.exercicios || []).map(limparExercicioParaModelo),
        criadoEm: treino.dataCriacao || new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    alert("Modelo salvo com sucesso. Você poderá reutilizar em outros alunos.");
    carregarTudo();
  }
 
  async function criarTreinoAPartirModelo() {
    if (!usuario) return;
 
    if (!alunoSelecionado) {
      alert("Selecione um aluno antes de usar um modelo.");
      return;
    }
 
    if (!modeloSelecionadoId) {
      alert("Selecione um modelo de treino.");
      return;
    }
 
    const aluno = alunos.find((a) => a.id === alunoSelecionado);
    const modelo = modelosTreino.find((m) => m.id === modeloSelecionadoId);
 
    if (!aluno || !modelo) {
      alert("Aluno ou modelo não encontrado.");
      return;
    }
 
    const ref = await addDoc(collection(db, "treinos"), {
      nome: nomeTreino || modelo.nome,
      dataTreino,
      dataCriacao: new Date().toISOString(),
      versaoFicha: 2,
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      alunoEmail: aluno.email,
      professorEmail: usuario.email,
      exercicios: (modelo.exercicios || []).map(limparExercicioParaModelo),
      mensagens: [],
      origemModeloId: modelo.id,
      criadoEm: new Date(),
      atualizadoEm: new Date().toISOString(),
    });
 
    setTreinoAbertoId(ref.id);
    setModeloSelecionadoId("");
    setNomeTreino("");
    setDataTreino("");
    alert("Treino criado a partir do modelo.");
    carregarTudo();
  }
 
  async function criarModeloVazio() {
    if (!usuario) return;
 
    if (!nomeModelo.trim()) {
      alert("Informe o nome do modelo.");
      return;
    }
 
    await addDoc(collection(db, "modelosTreino"), {
      nome: nomeModelo,
      descricao: descricaoModelo,
      professorEmail: usuario.email,
      exercicios: [],
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });
 
    setNomeModelo("");
    setDescricaoModelo("");
    alert("Modelo vazio criado. Você pode salvar um treino completo como modelo depois.");
    carregarTudo();
  }
 
  async function excluirModeloTreino(id: string) {
    if (!confirm("Excluir modelo salvo? Os treinos dos alunos não serão apagados.")) return;
 
    await deleteDoc(doc(db, "modelosTreino", id));
    carregarTudo();
  }
 
  async function editarModeloTreino(modelo: TreinoModelo) {
    const novoNome = prompt("Novo nome do modelo:", modelo.nome);
    if (!novoNome) return;
 
    const novaDescricao = prompt("Descrição do modelo:", modelo.descricao || "") || "";
 
    await setDoc(
      doc(db, "modelosTreino", modelo.id),
      {
        nome: novoNome,
        descricao: novaDescricao,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    alert("Modelo atualizado.");
    carregarTudo();
  }
 
  async function aplicarModeloParaAluno(modelo: TreinoModelo) {
    if (!usuario) return;
 
    if (!alunoSelecionado) {
      alert("Selecione um aluno para aplicar este modelo.");
      return;
    }
 
    const aluno = alunos.find((a) => a.id === alunoSelecionado);
    if (!aluno) {
      alert("Aluno não encontrado.");
      return;
    }
 
    const nomeFicha = prompt("Nome da nova ficha para o aluno:", modelo.nome) || modelo.nome;
 
    const ref = await addDoc(collection(db, "treinos"), {
      nome: nomeFicha,
      dataTreino: new Date().toISOString().slice(0, 10),
      dataCriacao: new Date().toISOString(),
      versaoFicha: 2,
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      alunoEmail: aluno.email,
      professorEmail: usuario.email,
      exercicios: (modelo.exercicios || []).map(limparExercicioParaModelo),
      mensagens: [],
      origemModeloId: modelo.id,
      criadoEm: new Date(),
      atualizadoEm: new Date().toISOString(),
    });
 
    setTreinoAbertoId(ref.id);
    setAbaProfessor("treinos");
    alert("Modelo aplicado ao aluno selecionado.");
    carregarTudo();
  }
 
  async function criarTreino() {
    if (!usuario) return;
 
    if (!alunoSelecionado || !nomeTreino) {
      return alert("Selecione o aluno e informe o nome do treino.");
    }
 
    const aluno = alunos.find((a) => a.id === alunoSelecionado);
 
    if (!aluno) {
      alert("Aluno não encontrado.");
      return;
    }
 
    const ref = await addDoc(collection(db, "treinos"), {
      nome: nomeTreino,
      dataTreino,
      dataCriacao: new Date().toISOString(),
      versaoFicha: 2,
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      alunoEmail: aluno.email,
      professorEmail: usuario.email,
      exercicios: [],
      mensagens: [],
      criadoEm: new Date(),
      atualizadoEm: new Date().toISOString(),
    });
 
    await setDoc(
      doc(db, "modelosTreino", ref.id),
      {
        nome: nomeTreino,
        descricao: `Modelo automático criado a partir da ficha de ${aluno.nome}`,
        professorEmail: usuario.email,
        origemTreinoId: ref.id,
        autoCriado: true,
        exercicios: [],
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    setTreinoAbertoId(ref.id);
    setNomeTreino("");
    setDataTreino("");
    carregarTudo();
  }
 
  async function excluirTreino(id: string) {
    if (!confirm("Excluir treino completo?")) return;
 
    await deleteDoc(doc(db, "treinos", id));
    setTreinoAbertoId("");
    carregarTudo();
  }
 
  function adicionarExercicio() {
    const novo: Exercicio = {
      id: uid(),
      nome: "",
      series: "",
      repeticoes: "",
      descanso: "",
      cargaSugerida: "",
      metodo: "",
      velocidade: "",
      video: "",
      obsProfessor: "",
      obsAluno: "",
      cargaAtual: "",
      ultimaCarga: "",
      seriesConcluidas: [],
      finalizado: false,
      ordem: -1,
      historicoCargas: [],
    };
 
    setNovoExercicioDraft(novo);
    setExercicioAbertoId(novo.id);
  }
 
  function atualizarNovoExercicio(campo: keyof Exercicio, valor: any) {
    if (!novoExercicioDraft) return;
 
    setNovoExercicioDraft({
      ...novoExercicioDraft,
      [campo]: valor,
    });
  }
 
  async function salvarNovoExercicio(treino: Treino) {
    if (!novoExercicioDraft) return;
 
    if (!novoExercicioDraft.nome.trim()) {
      alert("Digite o nome do exercício.");
      return;
    }
 
    const novo: Exercicio = {
      ...novoExercicioDraft,
      ordem: 0,
    };
 
    await salvarExercicios(treino, [novo, ...(treino.exercicios || [])]);
 
    setNovoExercicioDraft(null);
    setExercicioAbertoId("");
  }
 
  async function salvarExercicios(treino: Treino, exercicios: Exercicio[]) {
    const atualizados = exercicios.map((e, index) => ({
      ...e,
      ordem: index,
    }));
 
    setTreinos((prev) =>
      prev.map((t) =>
        t.id === treino.id ? { ...t, exercicios: atualizados } : t
      )
    );
 
    await setDoc(
      doc(db, "treinos", treino.id),
      {
        exercicios: atualizados,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    await salvarModeloAutomaticoDoTreino(treino, atualizados);
 
    carregarTudo();
  }
 
  async function atualizarExercicio(
    treino: Treino,
    exId: string,
    campo: keyof Exercicio,
    valor: any
  ) {
    const exercicios = (treino.exercicios || []).map((ex) =>
      ex.id === exId ? { ...ex, [campo]: valor } : ex
    );
 
    await salvarExercicios(treino, exercicios);
  }
 
  async function excluirExercicio(treino: Treino, exId: string) {
    const exercicios = (treino.exercicios || []).filter((ex) => ex.id !== exId);
    await salvarExercicios(treino, exercicios);
  }
 
  async function marcarSerie(treino: Treino, ex: Exercicio, serie: number) {
    const atuais = ex.seriesConcluidas || [];
    const novas = atuais.includes(serie)
      ? atuais.filter((s) => s !== serie)
      : [...atuais, serie];
 
    const exercicios = treino.exercicios.map((e) =>
      e.id === ex.id ? { ...e, seriesConcluidas: novas } : e
    );
 
    await salvarExercicios(treino, exercicios);
    iniciarDescanso(Number(ex.descanso) || 60, `${ex.nome} - descanso`);
  }
 
  async function finalizarExercicio(treino: Treino, ex: Exercicio) {
    const todasSeries = Array.from(
      { length: Number(ex.series) || 0 },
      (_, i) => i + 1
    );
 
    const carga = ex.cargaAtual || ex.ultimaCarga || "";
 
    const exercicios = treino.exercicios.map((e) =>
      e.id === ex.id
        ? {
            ...e,
            seriesConcluidas: todasSeries,
            finalizado: true,
            ultimaCarga: carga,
            cargaAtual: carga,
            historicoCargas: carga
              ? [
                  ...(e.historicoCargas || []),
                  { carga, data: new Date().toLocaleString() },
                ]
              : e.historicoCargas || [],
          }
        : e
    );
 
    await salvarExercicios(treino, exercicios);
  }
 
  async function reiniciarTreino(treino: Treino) {
    const exercicios = (treino.exercicios || []).map((e) => ({
      ...e,
      finalizado: false,
      seriesConcluidas: [],
      cargaAtual: e.ultimaCarga || "",
    }));

    await setDoc(
      doc(db, "treinos", treino.id),
      {
        exercicios,
        treinoFinalizado: false,
        treinoFinalizadoEm: "",
        percentualConcluido: 0,
        exerciciosPulados: [],
        reiniciadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );

    setTreinos((prev) =>
      prev.map((t) =>
        t.id === treino.id
          ? {
              ...t,
              exercicios,
              treinoFinalizado: false,
              treinoFinalizadoEm: "",
              percentualConcluido: 0,
              exerciciosPulados: [],
            }
          : t
      )
    );

    carregarTudo();
  }

  async function abrirTreinoOuReiniciar(treino: Treino) {
    if (treino.treinoFinalizado) {
      const confirmar = confirm(
        `O treino ${treino.nome} já foi finalizado com ${Math.round(treino.percentualConcluido || calcularProgresso(treino))}%. Deseja reiniciar este treino agora?`
      );

      if (confirmar) {
        await reiniciarTreino(treino);
      }
    }

    setTreinoAbertoId(treino.id);
  }

  async function finalizarTreinoCompleto(treino: Treino) {
    const exercicios = treino.exercicios || [];
    const total = exercicios.length;
    const concluidos = exercicios.filter((exercicio) => exercicio.finalizado).length;
    const percentual = total ? Math.round((concluidos / total) * 100) : 0;
    const pulados = exercicios
      .filter((exercicio) => !exercicio.finalizado)
      .map((exercicio) => exercicio.nome || "Exercício sem nome");

    const confirmar = confirm(
      `Finalizar treino com ${percentual}% concluído?\nExercícios pulados: ${pulados.length}`
    );

    if (!confirmar) return;

    await setDoc(
      doc(db, "treinos", treino.id),
      {
        treinoFinalizado: true,
        treinoFinalizadoEm: new Date().toISOString(),
        percentualConcluido: percentual,
        exerciciosPulados: pulados,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );

    setTreinos((prev) =>
      prev.map((t) =>
        t.id === treino.id
          ? {
              ...t,
              treinoFinalizado: true,
              treinoFinalizadoEm: new Date().toISOString(),
              percentualConcluido: percentual,
              exerciciosPulados: pulados,
            }
          : t
      )
    );

    alert(`Treino finalizado com ${percentual}% concluído.`);
    carregarTudo();
  }

  async function reiniciarSemanaAluno() {
    const confirmar = confirm(
      "Deseja reiniciar todos os treinos visíveis? Use isso no início de uma nova semana."
    );

    if (!confirmar) return;

    for (const treino of treinosOrdenados) {
      await reiniciarTreino(treino);
    }

    alert("Semana reiniciada. Todos os treinos visíveis foram liberados novamente.");
  }
 
  async function enviarMensagem(treino: Treino) {
    if (!mensagem) return;
 
    const nova = {
      texto: mensagem,
      autor: perfil?.tipo === "professor" ? "Professor" : perfil?.nome || "Aluno",
      data: new Date().toLocaleString(),
    };
 
    await setDoc(
      doc(db, "treinos", treino.id),
      {
        mensagens: [...(treino.mensagens || []), nova],
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    setMensagem("");
    carregarTudo();
  }
 
  async function solicitarNotificacoes() {
    if (typeof Notification === "undefined") return;
 
    const permissao = await Notification.requestPermission();
    setNotificacoes(permissao);
  }
 
  function enviarNotificacao(titulo: string, corpo: string) {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(titulo, { body: corpo, icon: "/icon-192.png" });
    }
  }
 
  function iniciarDescanso(segundos: number, info = "Descanso") {
    setTimerInfo(info);
    setTempoRestante(segundos);
    setTimerAtivo(true);
  }
 
  function tocarSomProfissional() {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
 
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.55);

    if (navigator.vibrate) {
      navigator.vibrate([250, 120, 250]);
    }
  }
 
  async function moverExercicio(treino: Treino, destinoId: string) {
    if (!dragExercicioId || dragExercicioId === destinoId) return;
 
    const lista = [...(treino.exercicios || [])].sort(
      (a, b) => (a.ordem || 0) - (b.ordem || 0)
    );
 
    const origemIndex = lista.findIndex((e) => e.id === dragExercicioId);
    const destinoIndex = lista.findIndex((e) => e.id === destinoId);
 
    if (origemIndex < 0 || destinoIndex < 0) return;
 
    const [removido] = lista.splice(origemIndex, 1);
    lista.splice(destinoIndex, 0, removido);
 
    setDragExercicioId("");
    await salvarExercicios(treino, lista);
  }
 
  function lerImagemLocal(e: any, callback: (valor: string) => void) {
    const file = e.target.files?.[0];
 
    if (!file) return;
 
    const reader = new FileReader();
 
    reader.onloadend = () => {
      callback(String(reader.result));
    };
 
    reader.readAsDataURL(file);
  }
 
  function alterarNomeTreinoLocal(treinoId: string, novoNome: string) {
    setTreinos((prev) =>
      prev.map((t) => (t.id === treinoId ? { ...t, nome: novoNome } : t))
    );
  }
 
  async function salvarNomeTreino(treino: Treino) {
    if (!treino.nome.trim()) {
      alert("Digite o nome do treino.");
      return;
    }
 
    await setDoc(
      doc(db, "treinos", treino.id),
      {
        nome: treino.nome,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    await salvarModeloAutomaticoDoTreino(treino);
 
    alert("Nome do treino salvo!");
    carregarTudo();
  }
 
  function progressoAluno(aluno: Aluno) {
    const treinosAluno = treinos.filter(
      (treino) => treino.alunoId === aluno.id || treino.alunoEmail === aluno.email
    );
 
    const totalExercicios = treinosAluno.reduce(
      (total, treino) => total + (treino.exercicios?.length || 0),
      0
    );
 
    const concluidos = treinosAluno.reduce(
      (total, treino) =>
        total + (treino.exercicios || []).filter((exercicio) => exercicio.finalizado).length,
      0
    );
 
    const progresso = totalExercicios
      ? Math.round((concluidos / totalExercicios) * 100)
      : 0;
 
    return {
      treinos: treinosAluno.length,
      totalExercicios,
      concluidos,
      progresso,
    };
  }
 
 
  function alunoDashboard(aluno: Aluno) {
    const treinosAluno = treinos.filter(
      (treino) => treino.alunoId === aluno.id || treino.alunoEmail === aluno.email
    );
 
    const exercicios = treinosAluno.flatMap((treino) =>
      (treino.exercicios || []).map((exercicio) => ({
        ...exercicio,
        treinoNome: treino.nome,
        treinoData: treino.dataTreino || "",
      }))
    );
 
    const totalExercicios = exercicios.length;
    const concluidos = exercicios.filter((exercicio) => exercicio.finalizado).length;
    const progresso = totalExercicios ? Math.round((concluidos / totalExercicios) * 100) : 0;
 
    const cargas = exercicios.flatMap((exercicio) =>
      (exercicio.historicoCargas || []).map((item) => ({
        exercicio: exercicio.nome,
        treino: exercicio.treinoNome,
        carga: item.carga,
        data: item.data,
      }))
    );
 
    const timeline = [
      ...treinosAluno.map((treino) => ({
        data: treino.dataTreino || "Sem data",
        tipo: "Treino",
        titulo: treino.nome,
        detalhe: treino.treinoFinalizado
          ? `${Math.round(treino.percentualConcluido || 0)}% concluído | Pulados: ${(treino.exerciciosPulados || []).length}`
          : `${(treino.exercicios || []).filter((e) => e.finalizado).length}/${(treino.exercicios || []).length} exercícios concluídos`,
      })),
      ...cargas.map((item) => ({
        data: item.data,
        tipo: "Carga",
        titulo: item.exercicio,
        detalhe: `${item.carga} - ${item.treino}`,
      })),
      ...(aluno.avaliacoes || []).map((avaliacao) => ({
        data: avaliacao.data,
        tipo: "Avaliação",
        titulo: "Avaliação física",
        detalhe: `Peso ${avaliacao.peso || "-"} kg | Gordura ${avaliacao.gordura || "-"}% | Massa magra ${avaliacao.massaMagra || "-"} kg | Cintura ${avaliacao.cintura || "-"} cm`,
      })),
    ];
 
    return {
      treinosAluno,
      exercicios,
      totalExercicios,
      concluidos,
      progresso,
      cargas,
      timeline,
      avaliacoes: aluno.avaliacoes || [],
    };
  }
 
  function calcularIMC(peso: string, altura: string) {
    const p = Number(String(peso).replace(",", "."));
    let a = Number(String(altura).replace(",", "."));
 
    if (!p || !a) return "";
 
    if (a > 3) a = a / 100;
 
    return (p / (a * a)).toFixed(1);
  }
 
  function atualizarAvaliacao(campo: keyof AvaliacaoFisica, valor: string) {
    const novo = {
      ...avaliacaoDraft,
      [campo]: valor,
    };
 
    if (campo === "peso" || campo === "altura") {
      novo.imc = calcularIMC(
        campo === "peso" ? valor : novo.peso,
        campo === "altura" ? valor : novo.altura
      );
    }
 
    setAvaliacaoDraft(novo);
  }
 
  async function salvarAvaliacaoAluno(aluno: Aluno) {
    const nova: AvaliacaoFisica = {
      ...avaliacaoDraft,
      id: avaliacaoDraft.id || uid(),
      data: avaliacaoDraft.data || new Date().toISOString().slice(0, 10),
    };
 
    const avaliacoes = [
      nova,
      ...(aluno.avaliacoes || []).filter((a) => a.id !== nova.id),
    ];
 
    await setDoc(
      doc(db, "alunos", aluno.id),
      {
        avaliacoes,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    setAvaliacaoDraft(avaliacaoVazia());
 
    alert("Avaliação salva.");
    carregarTudo();
  }
 
  async function excluirAvaliacaoAluno(aluno: Aluno, avaliacaoId: string) {
    if (!confirm("Excluir esta avaliação?")) return;
 
    const avaliacoes = (aluno.avaliacoes || []).filter((a) => a.id !== avaliacaoId);
 
    await setDoc(
      doc(db, "alunos", aluno.id),
      {
        avaliacoes,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
 
    carregarTudo();
  }
 
  function editarAvaliacao(avaliacao: AvaliacaoFisica) {
    setAvaliacaoDraft(avaliacao);
  }
 
  async function trocarSenhaPrimeiroAcesso() {
    if (novaSenhaPrimeiroAcesso.length < 6) {
      alert("A nova senha precisa ter no mínimo 6 caracteres.");
      return;
    }
 
    if (!auth.currentUser || !perfil) return;
 
    try {
      await updatePassword(auth.currentUser, novaSenhaPrimeiroAcesso);
 
      await setDoc(
        doc(db, "usuarios", perfil.uid),
        {
          primeiroAcesso: false,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
 
      setPerfil({ ...perfil, primeiroAcesso: false });
      setNovaSenhaPrimeiroAcesso("");
      alert("Senha alterada com sucesso.");
    } catch (error: any) {
      alert(traduzErro(error.message));
    }
  }
 
  if (!usuario) {
    return (
      <Page>
        <Card compacto>
          <h1 style={styles.center}>EvoTrain</h1>
 
          <div style={styles.contatoBox}>
            <b>{configSistema.textoContato}</b>
            <p style={{ margin: "8px 0" }}>
              WhatsApp:{" "}
              <a
                href={`https://wa.me/55${configSistema.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                {configSistema.whatsapp}
              </a>
            </p>
            <p style={{ margin: "8px 0" }}>
              E-mail:{" "}
              <a href={`mailto:${configSistema.email}`}>
                {configSistema.email}
              </a>
            </p>
          </div>
 
          <input
            style={styles.input}
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
 
          <input
            style={styles.input}
            placeholder="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
 
          <button style={styles.primary} onClick={entrar}>
            Entrar
          </button>
 
          <button style={styles.secondary} onClick={cadastrar}>
            Solicitar conta de professor
          </button>
 
          <button style={styles.secondary} onClick={recuperarSenha}>
            Recuperar senha
          </button>
 
          <p style={{ fontSize: 13 }}>
            Aluno não cria conta. O professor cria o acesso do aluno com senha provisória.
          </p>
        </Card>
      </Page>
    );
  }
 
  if (perfil?.tipo === "professor" && perfil.status === "pendente") {
    return (
      <Page>
        <Card compacto>
          <h1 style={styles.center}>EvoTrain</h1>
          <h2>Conta aguardando aprovação</h2>
          <p>Sua conta de professor foi criada, mas ainda precisa ser aprovada pelo administrador.</p>
          <button style={styles.danger} onClick={sair}>
            Sair
          </button>
        </Card>
      </Page>
    );
  }

  if (perfil?.tipo === "professor" && licencaProfessorVencida(perfil)) {
    return (
      <Page>
        <Card compacto>
          <h1 style={styles.center}>EvoTrain</h1>
          <h2>Licença expirada</h2>
          <p>Seu acesso está bloqueado porque a licença venceu. Entre em contato com o administrador.</p>
          <button style={styles.danger} onClick={sair}>
            Sair
          </button>
        </Card>
      </Page>
    );
  }
 
  if (perfil?.status === "bloqueado") {
    return (
      <Page>
        <Card compacto>
          <h1 style={styles.center}>EvoTrain</h1>
          <h2>Acesso bloqueado</h2>
          <p>Seu acesso foi bloqueado pelo administrador.</p>
          <button style={styles.danger} onClick={sair}>
            Sair
          </button>
        </Card>
      </Page>
    );
  }
 
  if (perfil?.tipo === "aluno" && perfil.primeiroAcesso) {
    return (
      <Page>
        <Card compacto>
          <h1 style={styles.center}>EvoTrain</h1>
          <h2>Troque sua senha</h2>
          <p>Por segurança, troque a senha provisória antes de continuar.</p>
 
          <input
            style={styles.input}
            placeholder="Nova senha"
            type="password"
            value={novaSenhaPrimeiroAcesso}
            onChange={(e) => setNovaSenhaPrimeiroAcesso(e.target.value)}
          />
 
          <button style={styles.primary} onClick={trocarSenhaPrimeiroAcesso}>
            Salvar nova senha
          </button>
 
          <button style={styles.danger} onClick={sair}>
            Sair
          </button>
        </Card>
      </Page>
    );
  }
 
  return (
    <Page>
      <div style={styles.topbar}>
        <div>
          <h1 style={{ margin: 0 }}>EvoTrain</h1>
          <small>{online ? "Online" : "Offline - dados em cache/sincronização"}</small>
        </div>
 
        <div>
          <button style={styles.secondary} onClick={solicitarNotificacoes}>
            Notificações: {notificacoes}
          </button>
 
          <button style={styles.danger} onClick={sair}>
            Sair
          </button>
        </div>
      </div>
 
      {timerAtivo && (
        <div
          style={{
            ...styles.timerFixo,
            background:
              tempoRestante <= 10
                ? "linear-gradient(135deg,#ef4444,#991b1b)"
                : tempoRestante <= 20
                  ? "linear-gradient(135deg,#f59e0b,#b45309)"
                  : "linear-gradient(135deg,#2563eb,#1d4ed8)",
          }}
        >
          <span style={styles.timerInfoTexto}>{timerInfo}</span>
          <strong style={styles.timerNumero}>{formatarTempo(tempoRestante)}</strong>
          <small>{tempoRestante <= 10 ? "Prepare-se!" : "Descanso em andamento"}</small>
          <button style={styles.timerFechar} onClick={() => setTimerAtivo(false)}>
            Fechar
          </button>
        </div>
      )}
 
      <Card>
        <h2>Meu perfil</h2>
 
        <input
          style={styles.input}
          placeholder="Nome"
          value={perfil?.nome || ""}
          onChange={(e) =>
            setPerfil({ ...(perfil as Perfil), nome: e.target.value })
          }
        />
 
        <label style={styles.label}>Foto do perfil</label>
 
        <input
          style={styles.input}
          type="file"
          accept="image/*"
          onChange={(e) =>
            lerImagemLocal(e, (foto) =>
              setPerfil({ ...(perfil as Perfil), foto })
            )
          }
        />
 
        {perfil?.foto && (
          <img src={perfil.foto} alt="Foto do perfil" style={styles.fotoPreview} />
        )}
 
        {perfil?.tipo === "professor" && (
          <>
            <input
              style={styles.input}
              placeholder="Formação"
              value={perfil?.formacao || ""}
              onChange={(e) =>
                setPerfil({ ...(perfil as Perfil), formacao: e.target.value })
              }
            />
 
            <input
              style={styles.input}
              placeholder="Especialidade"
              value={perfil?.especialidade || ""}
              onChange={(e) =>
                setPerfil({
                  ...(perfil as Perfil),
                  especialidade: e.target.value,
                })
              }
            />
 
            <input
              style={styles.input}
              placeholder="CREF"
              value={perfil?.cref || ""}
              onChange={(e) =>
                setPerfil({ ...(perfil as Perfil), cref: e.target.value })
              }
            />
 
            <textarea
              style={styles.input}
              placeholder="Descrição profissional"
              value={perfil?.descricao || ""}
              onChange={(e) =>
                setPerfil({ ...(perfil as Perfil), descricao: e.target.value })
              }
            />
          </>
        )}
 
        <button style={styles.primary} onClick={salvarPerfil}>
          Salvar perfil
        </button>
      </Card>
 
      {isAdmin && (
        <Card>
          <h2>Painel administrativo</h2>
          <p>Gestão de professores, licenças, mensalidades e limites de alunos.</p>

          <button style={styles.secondary} onClick={migrarDadosSemPerder}>
            Atualizar estrutura sem apagar dados
          </button>

          <p style={{ fontSize: 13, color: "#475569" }}>
            Use este botão uma vez após atualizar. Ele preserva professores, alunos, treinos, cargas, mensagens e avaliações antigas.
          </p>

          <div style={styles.adminDashboard}>
            <AdminStat titulo="Professores" valor={resumoAdmin.professores} />
            <AdminStat titulo="Ativos" valor={resumoAdmin.ativos} />
            <AdminStat titulo="Bloqueados" valor={resumoAdmin.bloqueados} />
            <AdminStat titulo="Alunos" valor={resumoAdmin.alunos} />
            <AdminStat titulo="Vencendo" valor={resumoAdmin.vencendo} />
            <AdminStat
              titulo="Receita prevista"
              valor={`R$ ${resumoAdmin.receitaPrevista.toFixed(2)}`}
            />
            <AdminStat
              titulo="Recebido"
              valor={`R$ ${resumoAdmin.receitaRecebida.toFixed(2)}`}
            />
            <AdminStat
              titulo="Pendente"
              valor={`R$ ${resumoAdmin.receitaPendente.toFixed(2)}`}
            />
          </div>

          <div style={styles.configBox}>
            <h3>Contato da tela inicial</h3>

            <label style={styles.label}>Texto</label>
            <input
              style={styles.input}
              value={configSistema.textoContato}
              onChange={(e) =>
                setConfigSistema({
                  ...configSistema,
                  textoContato: e.target.value,
                })
              }
            />

            <label style={styles.label}>WhatsApp</label>
            <input
              style={styles.input}
              value={configSistema.whatsapp}
              onChange={(e) =>
                setConfigSistema({
                  ...configSistema,
                  whatsapp: e.target.value,
                })
              }
            />

            <label style={styles.label}>E-mail</label>
            <input
              style={styles.input}
              value={configSistema.email}
              onChange={(e) =>
                setConfigSistema({
                  ...configSistema,
                  email: e.target.value,
                })
              }
            />

            <button style={styles.primary} onClick={salvarConfigSistema}>
              Salvar contato
            </button>
          </div>

          <h3>Professores cadastrados</h3>

          {professoresSistema.length === 0 && <p>Nenhum professor cadastrado.</p>}

          <div style={styles.professoresAdminGrid}>
            {professoresSistema.map((professor) => {
              const alunosProfessor = alunos.filter(
                (aluno) =>
                  String(aluno.professorEmail || "").toLowerCase() ===
                  String(professor.email || "").toLowerCase()
              );

              const limite = Number(professor.limiteAlunos || 10);
              const dias = calcularDiasRestantes(professor);
              const vencida = licencaProfessorVencida(professor);
              const aprovado = professor.status === "aprovado" && !vencida;
              const pendente = professor.status === "pendente";

              return (
                <div key={professor.uid} style={styles.professorAdminCard}>
                  <div style={styles.professorAdminTopo}>
                    <div>
                      <h3 style={{ margin: 0 }}>{professor.nome || professor.email}</h3>
                      <small>{professor.email}</small>
                    </div>

                    <span
                      style={{
                        ...styles.statusBadge,
                        background: pendente
                          ? "#f59e0b"
                          : aprovado
                          ? "#16a34a"
                          : "#dc2626",
                      }}
                    >
                      {pendente ? "Pendente" : aprovado ? "Ativo" : "Bloqueado"}
                    </span>
                  </div>

                  <div style={styles.adminInfoGrid}>
                    <InfoBox label="Alunos" value={`${alunosProfessor.length}/${limite}`} />
                    <InfoBox label="Licença" value={professor.licencaTipo === "vitalicia" ? "Vitalícia" : textoLicenca(professor)} />
                    <InfoBox label="Último pagamento" value={professor.mensalidadePagaEm || "Não informado"} />
                    <InfoBox label="Mensalidade" value={professor.mensalidadeValor ? `R$ ${professor.mensalidadeValor}` : "Não informado"} />
                  </div>

                  {professor.licencaTipo !== "vitalicia" && (
                    <p style={{ color: dias < 0 ? "#dc2626" : dias <= 7 ? "#b45309" : "#166534" }}>
                      <b>Status da licença:</b> {textoLicenca(professor)}
                    </p>
                  )}

                  {professor.observacaoAdmin && (
                    <p style={styles.obsAdminBox}>
                      <b>Obs. ADM:</b> {professor.observacaoAdmin}
                    </p>
                  )}

                  <label style={styles.label}>Renovar licença</label>
                  <select
                    style={styles.input}
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      renovarLicencaProfessor(professor, e.target.value);
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">Escolha o período</option>
                    {LICENCAS_ADMIN.map((licenca) => (
                      <option key={licenca.valor} value={licenca.valor}>
                        {licenca.label}
                      </option>
                    ))}
                  </select>

                  <div style={styles.adminButtonGrid}>
                    {pendente && (
                      <button style={styles.success} onClick={() => aprovarProfessor(professor)}>
                        Aprovar
                      </button>
                    )}

                    {!aprovado && !pendente && (
                      <button style={styles.success} onClick={() => liberarProfessor(professor)}>
                        Liberar
                      </button>
                    )}

                    <button style={styles.secondary} onClick={() => editarLimiteAlunosProfessor(professor)}>
                      Limite alunos
                    </button>

                    <button style={styles.secondary} onClick={() => editarValorPlanoProfessor(professor)}>
                      Valor plano
                    </button>

                    <button style={styles.secondary} onClick={() => marcarPagamentoProfessor(professor)}>
                      Marcar pagamento
                    </button>

                    <button style={styles.secondary} onClick={() => editarObservacaoAdminProfessor(professor)}>
                      Obs. ADM
                    </button>

                    <button style={styles.danger} onClick={() => bloquearProfessor(professor)}>
                      Bloquear
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
 
      {perfil?.tipo === "professor" && (
        <div style={styles.grid2}>
          <Card>
            <h2>Cadastrar aluno</h2>
 
            <input
              style={styles.input}
              placeholder="Nome do aluno"
              value={novoAlunoNome}
              onChange={(e) => setNovoAlunoNome(e.target.value)}
            />
 
            <input
              style={styles.input}
              placeholder="E-mail do aluno"
              value={novoAlunoEmail}
              onChange={(e) => setNovoAlunoEmail(e.target.value)}
            />
 
            <input
              style={styles.input}
              placeholder="Senha provisória"
              type="password"
              value={novoAlunoSenha}
              onChange={(e) => setNovoAlunoSenha(e.target.value)}
            />
 
            <label style={styles.label}>Foto do aluno</label>
 
            <input
              style={styles.input}
              type="file"
              accept="image/*"
              onChange={(e) => lerImagemLocal(e, (foto) => setNovoAlunoFoto(foto))}
            />
 
            {novoAlunoFoto && (
              <img
                src={novoAlunoFoto}
                alt="Foto do aluno"
                style={styles.fotoPreview}
              />
            )}
 
            <button style={styles.primary} onClick={cadastrarAluno}>
              Cadastrar aluno
            </button>
          </Card>
 
          <Card>
            <h2>Criar treino</h2>
 
            <select
              style={styles.input}
              value={alunoSelecionado}
              onChange={(e) => {
                setAlunoSelecionado(e.target.value);
                setTreinoAbertoId("");
              }}
            >
              <option value="">Selecione o aluno</option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} - {a.email}
                </option>
              ))}
            </select>
 
            <label style={styles.label}>Nome do treino</label>
 
            <input
              style={styles.input}
              placeholder="Ex.: Treino A, Pernas, Costas, Superior"
              value={nomeTreino}
              onChange={(e) => setNomeTreino(e.target.value)}
            />
 
            <input
              style={styles.input}
              type="date"
              value={dataTreino}
              onChange={(e) => setDataTreino(e.target.value)}
            />
 
            <button style={styles.primary} onClick={criarTreino}>
              Criar treino
            </button>
 
            <hr />
            <h3>Reaproveitar treino salvo</h3>
            <p>Escolha um modelo salvo e aplique para o aluno selecionado.</p>
 
            <select
              style={styles.input}
              value={modeloSelecionadoId}
              onChange={(e) => setModeloSelecionadoId(e.target.value)}
            >
              <option value="">Selecione um modelo salvo</option>
              {modelosTreino.map((modelo) => (
                <option key={modelo.id} value={modelo.id}>
                  {modelo.nome} - {modelo.exercicios?.length || 0} exercícios
                </option>
              ))}
            </select>
 
            <button style={styles.success} onClick={criarTreinoAPartirModelo}>
              Criar treino usando modelo
            </button>
          </Card>
        </div>
      )}
 
      {perfil?.tipo === "professor" && (
        <div style={styles.professorTabs}>
          <button
            style={abaProfessor === "treinos" ? styles.tabAtiva : styles.tab}
            onClick={() => setAbaProfessor("treinos")}
          >
            Treinos
          </button>
 
          <button
            style={abaProfessor === "alunos" ? styles.tabAtiva : styles.tab}
            onClick={() => setAbaProfessor("alunos")}
          >
            Gerenciar alunos
          </button>
 
          <button
            style={abaProfessor === "modelos" ? styles.tabAtiva : styles.tab}
            onClick={() => setAbaProfessor("modelos")}
          >
            Modelos salvos
          </button>
        </div>
      )}
 
      {perfil?.tipo === "professor" && abaProfessor === "modelos" && (
        <Card>
          <h2>Biblioteca de treinos salvos</h2>
          <p>
            Todo treino criado pelo professor vira um modelo reutilizável. Você também pode editar, excluir ou aplicar o modelo para qualquer aluno.
          </p>
 
          <label style={styles.label}>Aluno que receberá o modelo</label>
          <select
            style={styles.input}
            value={alunoSelecionado}
            onChange={(e) => setAlunoSelecionado(e.target.value)}
          >
            <option value="">Selecione um aluno</option>
            {alunos.map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.nome} - {aluno.email}
              </option>
            ))}
          </select>
 
          <div style={styles.grid2}>
            <div>
              <h3>Criar modelo vazio</h3>
              <input
                style={styles.input}
                placeholder="Nome do modelo. Ex.: Hipertrofia superior A"
                value={nomeModelo}
                onChange={(e) => setNomeModelo(e.target.value)}
              />
              <textarea
                style={styles.input}
                placeholder="Descrição do modelo"
                value={descricaoModelo}
                onChange={(e) => setDescricaoModelo(e.target.value)}
              />
              <button style={styles.primary} onClick={criarModeloVazio}>
                Criar modelo vazio
              </button>
            </div>
 
            <div>
              <h3>Modelos disponíveis</h3>
              {modelosTreino.length === 0 && <p>Nenhum modelo salvo ainda.</p>}
              {modelosTreino.map((modelo) => (
                <div key={modelo.id} style={styles.alunoCardGerenciar}>
                  <b>{modelo.nome}</b>
                  <p>{modelo.descricao || "Sem descrição"}</p>
                  <p>{modelo.exercicios?.length || 0} exercícios cadastrados</p>
                  <button style={styles.primary} onClick={() => aplicarModeloParaAluno(modelo)}>
                    Aplicar para aluno selecionado
                  </button>
                  <button style={styles.secondary} onClick={() => editarModeloTreino(modelo)}>
                    Editar modelo
                  </button>
                  <button style={styles.danger} onClick={() => excluirModeloTreino(modelo.id)}>
                    Excluir modelo
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
 
      {perfil?.tipo === "professor" && abaProfessor === "alunos" && (
        <Card>
          <div style={styles.treinoHeader}>
            <div>
              <h2>Gerenciar alunos</h2>
              <p>Excluir alunos, editar e-mail e acompanhar progresso.</p>
            </div>
 
            <button style={styles.danger} onClick={zerarDadosProfessor}>
              Zerar banco deste professor
            </button>
          </div>
 
          {alunos.length === 0 && <p>Nenhum aluno cadastrado.</p>}
 
          <div style={styles.alunoGrid}>
            {alunos.map((aluno) => {
              const resumo = progressoAluno(aluno);
 
              return (
                <div key={aluno.id} style={styles.alunoCardGerenciar}>
                  <div style={styles.alunoLinhaTopo}>
                    <div style={styles.alunoInfoLinha}>
                      {aluno.foto && (
                        <img
                          src={aluno.foto}
                          alt={aluno.nome}
                          style={styles.alunoFotoMini}
                        />
                      )}
 
                      <div>
                        <h3 style={{ margin: 0 }}>{aluno.nome}</h3>
                        <small>{aluno.email}</small>
                      </div>
                    </div>
 
                    <div>
                      <button
                        style={styles.secondary}
                        onClick={() => editarEmailAluno(aluno)}
                      >
                        Editar e-mail
                      </button>
 
                      <button
                        style={styles.danger}
                        onClick={() => excluirAluno(aluno)}
                      >
                        Excluir aluno
                      </button>
                    </div>
                  </div>
 
                  <p>
                    <b>Treinos:</b> {resumo.treinos}
                  </p>
 
                  <p>
                    <b>Exercícios:</b> {resumo.concluidos}/{resumo.totalExercicios}
                  </p>
 
                  <ProgressBar value={resumo.progresso} />
 
                  <button
                    style={styles.success}
                    onClick={() =>
                      setAlunoDashId(alunoDashId === aluno.id ? "" : aluno.id)
                    }
                  >
                    {alunoDashId === aluno.id ? "Fechar dashboard" : "Abrir dashboard"}
                  </button>
 
                  <button
                    style={styles.primary}
                    onClick={() => {
                      setAlunoSelecionado(aluno.id);
                      setAbaProfessor("treinos");
                      setTreinoAbertoId("");
                    }}
                  >
                    Ver treinos deste aluno
                  </button>
 
                  {alunoDashId === aluno.id && (
                    <DashboardAluno
                      aluno={aluno}
                      dados={alunoDashboard(aluno)}
                      avaliacaoDraft={avaliacaoDraft}
                      atualizarAvaliacao={atualizarAvaliacao}
                      salvarAvaliacaoAluno={salvarAvaliacaoAluno}
                      editarAvaliacao={editarAvaliacao}
                      excluirAvaliacaoAluno={excluirAvaliacaoAluno}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
 
      {(perfil?.tipo !== "professor" || abaProfessor === "treinos") && (
        <>
          {perfil?.tipo === "professor" && (
            <Card>
              <h2>Selecionar aluno</h2>
 
              <p>
                Escolha um aluno. Depois disso, aparecem somente os treinos desse aluno.
              </p>
 
              <select
                style={styles.input}
                value={alunoSelecionado}
                onChange={(e) => {
                  setAlunoSelecionado(e.target.value);
                  setTreinoAbertoId("");
                }}
              >
                <option value="">Selecione um aluno</option>
                {alunos.map((aluno) => (
                  <option key={aluno.id} value={aluno.id}>
                    {aluno.nome} - {aluno.email}
                  </option>
                ))}
              </select>
 
              {alunoSelecionadoObj && (
                <div style={styles.alunoSelecionadoBox}>
                  <b>Aluno selecionado:</b> {alunoSelecionadoObj.nome}
                  <br />
                  <small>{alunoSelecionadoObj.email}</small>
                </div>
              )}
            </Card>
          )}
 
          <h2 style={{ color: "white" }}>
            {perfil?.tipo === "professor" && alunoSelecionadoObj
              ? `Treinos de ${alunoSelecionadoObj.nome}`
              : "Treinos"}
          </h2>
 
          {perfil?.tipo === "professor" && !alunoSelecionadoObj && (
            <Card>
              <h3>Selecione um aluno</h3>
              <p>
                Escolha um aluno no campo acima. Enquanto nenhum aluno estiver
                selecionado, nenhum treino será exibido para evitar mistura de treinos.
              </p>
            </Card>
          )}
 
          <div style={styles.treinoTabs}>
            {treinosOrdenados.map((t) => {
              const progresso = calcularProgresso(t);
 
              return (
                <button
                  key={t.id}
                  style={treinoAbertoId === t.id ? styles.tabAtiva : styles.tab}
                  onClick={() => abrirTreinoOuReiniciar(t)}
                >
                  {t.nome} - {t.treinoFinalizado ? "Finalizado" : `${Math.round(progresso)}%`}
                </button>
              );
            })}
          </div>
 
          {treinosOrdenados
            .filter((t) => t.id === treinoAbertoId)
            .map((treino) => {
              const exerciciosOrdenados = ordenarExercicios(treino.exercicios || []);
              const progresso = calcularProgresso(treino);
              const finalizado =
                progresso === 100 && (treino.exercicios || []).length > 0;
 
              return (
                <Card key={treino.id}>
                  <div style={styles.treinoHeader}>
                    <div>
                      {perfil?.tipo === "professor" ? (
                        <div>
                          <label style={styles.label}>Nome do treino</label>
 
                          <input
                            style={styles.input}
                            value={treino.nome}
                            onChange={(e) =>
                              alterarNomeTreinoLocal(treino.id, e.target.value)
                            }
                          />
 
                          <button
                            style={styles.secondary}
                            onClick={() => salvarNomeTreino(treino)}
                          >
                            Salvar nome do treino
                          </button>
                        </div>
                      ) : (
                        <h2>{treino.nome}</h2>
                      )}
 
                      <p>
                        <b>Aluno:</b> {treino.alunoNome} - {treino.alunoEmail}
                      </p>
 
                      {treino.dataTreino && (
                        <p>
                          <b>Data do treino:</b> {treino.dataTreino}
                        </p>
                      )}
 
                      <p>
                        <b>Ficha criada em:</b>{" "}
                        {formatarDataCriacaoTreino(treino.dataCriacao || treino.criadoEm)}
                        {" | "}
                        <b>Tempo com a ficha:</b>{" "}
                        {calcularDiasFicha(treino.dataCriacao || treino.criadoEm)} dias
                      </p>
                    </div>
 
                    <div>
                      {perfil?.tipo === "professor" && (
                        <button
                          style={styles.primary}
                          onClick={() => adicionarExercicio()}
                        >
                          Criar novo exercício
                        </button>
                      )}
 
                      {perfil?.tipo === "professor" && (
                        <button
                          style={styles.success}
                          onClick={() => salvarTreinoComoModelo(treino)}
                        >
                          Salvar como modelo
                        </button>
                      )}
 
                      <button
                        style={styles.secondary}
                        onClick={() => reiniciarTreino(treino)}
                      >
                        Reiniciar treino
                      </button>
 
                      {perfil?.tipo === "professor" && (
                        <button
                          style={styles.danger}
                          onClick={() => excluirTreino(treino.id)}
                        >
                          Excluir treino
                        </button>
                      )}
                    </div>
                  </div>
 
                  <ProgressBar value={progresso} />
 
                  {finalizado && (
                    <p style={styles.ok}>
                      Treino finalizado. Clique em reiniciar para repetir na semana.
                    </p>
                  )}
 
                  {perfil?.tipo === "professor" && novoExercicioDraft && (
                    <div
                      style={{
                        ...styles.exercise,
                        border: "2px solid #2563eb",
                        background: "#eff6ff",
                      }}
                    >
                      <h3>Novo exercício</h3>
 
                      <p>
                        Preencha os campos e clique em salvar. Ele será adicionado
                        no topo do treino.
                      </p>
 
                      <Field
                        label="Nome do exercício"
                        disabled={false}
                        value={novoExercicioDraft.nome}
                        onChange={(v: any) => atualizarNovoExercicio("nome", v)}
                      />
 
                      <Field
                        label="Séries"
                        disabled={false}
                        value={novoExercicioDraft.series}
                        onChange={(v: any) => atualizarNovoExercicio("series", v)}
                      />
 
                      <Field
                        label="Repetições"
                        disabled={false}
                        value={novoExercicioDraft.repeticoes}
                        onChange={(v: any) => atualizarNovoExercicio("repeticoes", v)}
                      />
 
                      <Field
                        label="Descanso em segundos"
                        disabled={false}
                        value={novoExercicioDraft.descanso}
                        onChange={(v: any) => atualizarNovoExercicio("descanso", v)}
                      />
 
                      <Field
                        label="Carga sugerida"
                        disabled={false}
                        value={novoExercicioDraft.cargaSugerida}
                        onChange={(v: any) =>
                          atualizarNovoExercicio("cargaSugerida", v)
                        }
                      />
 
                      <Field
                        label="Método"
                        disabled={false}
                        value={novoExercicioDraft.metodo}
                        onChange={(v: any) => atualizarNovoExercicio("metodo", v)}
                      />
 
                      <Field
                        label="Velocidade"
                        disabled={false}
                        value={novoExercicioDraft.velocidade}
                        onChange={(v: any) =>
                          atualizarNovoExercicio("velocidade", v)
                        }
                      />
 
                      <Field
                        label="Vídeo/GIF"
                        disabled={false}
                        value={novoExercicioDraft.video}
                        onChange={(v: any) => atualizarNovoExercicio("video", v)}
                      />
 
                      <TextAreaField
                        label="Observação professor"
                        disabled={false}
                        value={novoExercicioDraft.obsProfessor}
                        onChange={(v: any) =>
                          atualizarNovoExercicio("obsProfessor", v)
                        }
                      />
 
                      <button
                        style={styles.success}
                        onClick={() => salvarNovoExercicio(treino)}
                      >
                        Salvar novo exercício
                      </button>
 
                      <button
                        style={styles.secondary}
                        onClick={() => setNovoExercicioDraft(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
 
                  {exerciciosOrdenados.map((ex) => {
                    const aberto = exercicioAbertoId === ex.id;
 
                    return (
                      <div
                        key={ex.id}
                        draggable={perfil?.tipo === "professor"}
                        onDragStart={() => setDragExercicioId(ex.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => moverExercicio(treino, ex.id)}
                        style={{
                          ...(perfil?.tipo === "aluno" ? styles.alunoCardExercicio : styles.exercise),
                          opacity: ex.finalizado ? 0.78 : 1,
                          background: perfil?.tipo === "aluno"
                            ? (ex.finalizado ? "#123524" : "#18243a")
                            : (ex.finalizado ? "#dcfce7" : "#f8fafc"),
                          border: perfil?.tipo === "aluno"
                            ? (ex.finalizado ? "3px solid #22c55e" : "3px solid #334155")
                            : "1px solid #cbd5e1",
                        }}
                      >
                        <div style={styles.exerciseHeader}>
                          <button
                            style={perfil?.tipo === "aluno" ? styles.alunoExercicioTituloBotao : styles.exerciseTitleButton}
                            onClick={() => setExercicioAbertoId(aberto ? "" : ex.id)}
                          >
                            {ex.finalizado ? "✅ " : "☐ "}
                            {ex.nome || "Exercício sem nome"}
                          </button>
 
                          <small>{aberto ? "Aberto" : "Minimizado"}</small>
                        </div>
 
                        {perfil?.tipo === "professor" && (
                          <small>Arraste para reordenar</small>
                        )}
 
                        {aberto && (
                          <>
                            {perfil?.tipo === "professor" && (
                              <>
                                <Field
                                  label="Nome do exercício"
                                  disabled={false}
                                  value={ex.nome}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "nome", v)
                                  }
                                />

                                <Field
                                  label="Séries"
                                  disabled={false}
                                  value={ex.series}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "series", v)
                                  }
                                />

                                <Field
                                  label="Repetições"
                                  disabled={false}
                                  value={ex.repeticoes}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "repeticoes", v)
                                  }
                                />

                                <Field
                                  label="Descanso em segundos"
                                  disabled={false}
                                  value={ex.descanso}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "descanso", v)
                                  }
                                />

                                <Field
                                  label="Carga sugerida"
                                  disabled={false}
                                  value={ex.cargaSugerida}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "cargaSugerida", v)
                                  }
                                />

                                <Field
                                  label="Método"
                                  disabled={false}
                                  value={ex.metodo}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "metodo", v)
                                  }
                                />

                                <Field
                                  label="Velocidade"
                                  disabled={false}
                                  value={ex.velocidade}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "velocidade", v)
                                  }
                                />

                                <Field
                                  label="Vídeo/GIF"
                                  disabled={false}
                                  value={ex.video}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "video", v)
                                  }
                                />

                                <Field
                                  label="Carga usada pelo aluno"
                                  disabled={true}
                                  value={ex.cargaAtual}
                                  onChange={() => {}}
                                />

                                <TextAreaField
                                  label="Observação professor"
                                  disabled={false}
                                  value={ex.obsProfessor}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "obsProfessor", v)
                                  }
                                />

                                <TextAreaField
                                  label="Observação aluno"
                                  disabled={false}
                                  value={ex.obsAluno}
                                  onChange={(v: any) =>
                                    atualizarExercicio(treino, ex.id, "obsAluno", v)
                                  }
                                />

                                {ex.video && (
                                  <a href={ex.video} target="_blank" rel="noreferrer">
                                    Ver vídeo
                                  </a>
                                )}

                                <button
                                  style={styles.success}
                                  onClick={() => {
                                    setExercicioAbertoId("");
                                    alert("Exercício salvo e minimizado!");
                                  }}
                                >
                                  Salvar exercício
                                </button>

                                <button
                                  style={styles.danger}
                                  onClick={() => excluirExercicio(treino, ex.id)}
                                >
                                  Excluir exercício
                                </button>

                                <GraficoCarga historico={ex.historicoCargas || []} />
                              </>
                            )}

                            {perfil?.tipo === "aluno" && (
                              <>
                                {ex.video ? (
                                  <>
                                    <a
                                      href={ex.video}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={styles.alunoVideoLink}
                                    >
                                      ▶ Abrir vídeo de execução
                                    </a>


                                  </>
                                ) : (
                                  <div style={styles.alunoSemGif}>Sem link de vídeo disponível</div>
                                )}

                                {ex.obsProfessor && (
                                  <div style={styles.alunoObservacaoProfessor}>
                                    <b>Observação do professor</b>
                                    <p style={styles.textoQuebraLinha}>{ex.obsProfessor}</p>
                                  </div>
                                )}

                                <div style={styles.alunoInfoGridLimpo}>
                                  <div style={styles.alunoInfoPill}>Séries: {ex.series || "-"}</div>
                                  <div style={styles.alunoInfoPill}>Feitas: {(ex.seriesConcluidas || []).length}/{Number(ex.series) || 0}</div>
                                  <div style={styles.alunoInfoPill}>Reps: {ex.repeticoes || "-"}</div>
                                  <div style={styles.alunoInfoPill}>Intervalo: {ex.descanso || "-"}s</div>
                                  <div style={styles.alunoInfoPill}>Método: {ex.metodo || "-"}</div>
                                  <div style={styles.alunoInfoPill}>Status: {ex.finalizado ? "Concluído" : "Pendente"}</div>
                                </div>

                                <label style={styles.alunoCampoLabel}>Carga usada hoje</label>
                                <input
                                  style={styles.alunoCargaInput}
                                  placeholder="Ex.: 20 kg, 15 kg cada lado, peso corporal..."
                                  value={ex.cargaAtual || ""}
                                  onChange={(e) =>
                                    atualizarExercicio(treino, ex.id, "cargaAtual", e.target.value)
                                  }
                                />

                                <label style={styles.alunoCampoLabel}>Observações</label>
                                <textarea
                                  style={styles.alunoTextarea}
                                  placeholder="Digite observações do treino. Pode usar Enter para pular linha."
                                  rows={4}
                                  value={ex.obsAluno || ""}
                                  onChange={(e) =>
                                    atualizarExercicio(treino, ex.id, "obsAluno", e.target.value)
                                  }
                                />

                                <h4 style={{ color: "white" }}>Séries</h4>

                                {Array.from(
                                  { length: Number(ex.series) || 0 },
                                  (_, i) => i + 1
                                ).map((s) => (
                                  <button
                                    key={s}
                                    style={ex.seriesConcluidas?.includes(s) ? styles.alunoBotaoVerde : styles.alunoBotaoAzul}
                                    onClick={() => marcarSerie(treino, ex, s)}
                                  >
                                    {ex.seriesConcluidas?.includes(s) ? "✓" : "+"} Série {s} / iniciar descanso
                                  </button>
                                ))}

                                <button
                                  style={styles.alunoBotaoVerde}
                                  onClick={() => finalizarExercicio(treino, ex)}
                                >
                                  ✓ Finalizar exercício
                                </button>

                                <GraficoCarga historico={ex.historicoCargas || []} />
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
 
                  <div style={styles.finalizarTreinoBox}>
                    {treino.treinoFinalizado ? (
                      <div style={styles.treinoFinalizadoAviso}>
                        <b>Treino finalizado</b>
                        <p>Conclusão registrada: {Math.round(treino.percentualConcluido || progresso)}%</p>
                        {(treino.exerciciosPulados || []).length > 0 && (
                          <p>Exercícios pulados: {(treino.exerciciosPulados || []).join(", ")}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        style={styles.botaoFinalizarTreino}
                        onClick={() => finalizarTreinoCompleto(treino)}
                      >
                        ✓ Finalizar treino
                      </button>
                    )}

                    <button
                      style={styles.botaoReiniciarTreino}
                      onClick={() => reiniciarTreino(treino)}
                    >
                      ↺ Reiniciar este treino
                    </button>

                    {perfil?.tipo === "aluno" && treinosOrdenados.length > 1 && (
                      <button
                        style={styles.botaoReiniciarSemana}
                        onClick={reiniciarSemanaAluno}
                      >
                        ↺ Reiniciar semana
                      </button>
                    )}
                  </div>

                  <div style={styles.messages}>
                    <h3>Mensagens</h3>
 
                    {(treino.mensagens || []).map((m, i) => (
                      <p key={i}>
                        <b>{m.autor}:</b> {m.texto} <small>{m.data}</small>
                      </p>
                    ))}
 
                    <input
                      style={styles.input}
                      placeholder="Mensagem"
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                    />
 
                    <button style={styles.primary} onClick={() => enviarMensagem(treino)}>
                      Enviar
                    </button>
                  </div>
                </Card>
              );
            })}
        </>
      )}
    </Page>
  );
}
 
function ordenarExercicios(exercicios: Exercicio[]) {
  const lista = [...exercicios].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
 
  return [
    ...lista.filter((e) => !e.finalizado),
    ...lista.filter((e) => e.finalizado),
  ];
}
 
function calcularProgresso(treino: Treino) {
  const total = treino.exercicios?.length || 0;
 
  if (!total) return 0;
 
  const feitos = treino.exercicios.filter((e) => e.finalizado).length;
  return (feitos / total) * 100;
}
 
function formatarTempo(segundos: number) {
  const m = Math.floor(segundos / 60).toString().padStart(2, "0");
  const s = (segundos % 60).toString().padStart(2, "0");
 
  return `${m}:${s}`;
}
 
function formatarDataCriacaoTreino(valor: any) {
  if (!valor) return "Não informado";
 
  try {
    if (typeof valor === "string") return new Date(valor).toLocaleDateString();
    if (valor?.seconds) return new Date(valor.seconds * 1000).toLocaleDateString();
    return String(valor);
  } catch {
    return "Não informado";
  }
}
 
function calcularDiasFicha(valor: any) {
  if (!valor) return 0;
 
  try {
    const data =
      typeof valor === "string"
        ? new Date(valor)
        : valor?.seconds
          ? new Date(valor.seconds * 1000)
          : new Date(valor);
 
    return Math.max(0, Math.floor((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}
 
function traduzErro(msg: string) {
  if (msg.includes("EMAIL_EXISTS")) return "Esse e-mail já está cadastrado.";
  if (msg.includes("auth/invalid-email")) return "E-mail inválido.";
  if (msg.includes("auth/email-already-in-use")) return "Esse e-mail já está cadastrado.";
  if (msg.includes("auth/weak-password")) return "A senha precisa ter no mínimo 6 caracteres.";
  if (msg.includes("auth/invalid-credential")) return "E-mail ou senha incorretos.";
  if (msg.includes("auth/requires-recent-login")) {
    return "Por segurança, saia e entre novamente antes de trocar a senha.";
  }
 
  return msg;
}
 
function Page({ children }: any) {
  return (
    <div style={styles.page}>
      <div style={styles.container}>{children}</div>
    </div>
  );
}
 
function Card({ children, compacto }: any) {
  return <div style={compacto ? styles.cardCompacto : styles.card}>{children}</div>;
}
 
function Field({ label, value, onChange, disabled }: any) {
  return (
    <label style={styles.label}>
      {label}
      <input
        style={styles.input}
        disabled={disabled}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, disabled }: any) {
  return (
    <label style={styles.label}>
      {label}
      <textarea
        style={styles.textarea}
        disabled={disabled}
        value={value || ""}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
 
function ProgressBar({ value }: any) {
  return (
    <div>
      <b>Progresso: {Math.round(value)}%</b>
 
      <div style={styles.progressBg}>
        <div style={{ ...styles.progressFill, width: `${value}%` }} />
      </div>
    </div>
  );
}
 
function GraficoCarga({ historico }: any) {
  const pontos = (historico || [])
    .map((h: any) =>
      Number(String(h.carga).replace(",", ".").replace(/[^0-9.]/g, ""))
    )
    .filter((n: number) => !isNaN(n));
 
  if (pontos.length < 2) {
    return (
      <p>
        <small>Gráfico aparece após 2 registros de carga.</small>
      </p>
    );
  }
 
  const max = Math.max(...pontos);
  const min = Math.min(...pontos);
  const range = max - min || 1;
 
  const coords = pontos
    .map((p: number, i: number) => {
      const x = (i / (pontos.length - 1)) * 260;
      const y = 90 - ((p - min) / range) * 80;
      return `${x},${y}`;
    })
    .join(" ");
 
  return (
    <div style={styles.chartBox}>
      <b>Evolução de carga</b>
 
      <svg width="280" height="110" viewBox="0 0 280 110">
        <polyline fill="none" stroke="#2563eb" strokeWidth="4" points={coords} />
 
        {pontos.map((p: number, i: number) => {
          const x = (i / (pontos.length - 1)) * 260;
          const y = 90 - ((p - min) / range) * 80;
 
          return <circle key={i} cx={x} cy={y} r="4" fill="#16a34a" />;
        })}
      </svg>
    </div>
  );
}
 
 
function DashboardAluno({
  aluno,
  dados,
  avaliacaoDraft,
  atualizarAvaliacao,
  salvarAvaliacaoAluno,
  editarAvaliacao,
  excluirAvaliacaoAluno,
}: any) {
  const ultima = dados.avaliacoes?.[0];
 
  return (
    <div style={styles.dashboardAluno}>
      <h3>Dashboard do aluno</h3>
 
      <div style={styles.kpiGrid}>
        <Kpi titulo="Progresso" valor={`${dados.progresso}%`} />
        <Kpi titulo="Treinos" valor={dados.treinosAluno.length} />
        <Kpi titulo="Exercícios" valor={`${dados.concluidos}/${dados.totalExercicios}`} />
        <Kpi titulo="Último peso" valor={ultima?.peso ? `${ultima.peso} kg` : "-"} />
        <Kpi titulo="IMC" valor={ultima?.imc || "-"} />
        <Kpi titulo="% Gordura" valor={ultima?.gordura ? `${ultima.gordura}%` : "-"} />
        <Kpi titulo="Massa magra" valor={ultima?.massaMagra ? `${ultima.massaMagra} kg` : "-"} />
      </div>
 
      <div style={styles.dashboardGrid}>
        <div style={styles.panel}>
          <h3>Avaliação física</h3>
 
          <label style={styles.label}>Data</label>
          <input style={styles.input} type="date" value={avaliacaoDraft.data} onChange={(e) => atualizarAvaliacao("data", e.target.value)} />
 
          <h4>Dados gerais</h4>
          <div style={styles.formGrid}>
            <CampoAvaliacao label="Peso kg" campo="peso" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Altura cm ou m" campo="altura" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="IMC automático" campo="imc" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="% gordura" campo="gordura" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Massa magra kg" campo="massaMagra" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
          </div>
 
          <h4>Medidas centrais</h4>
          <div style={styles.formGrid}>
            <CampoAvaliacao label="Pescoço cm" campo="pescoco" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Ombros cm" campo="ombros" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Tórax cm" campo="torax" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Cintura cm" campo="cintura" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Abdômen cm" campo="abdomen" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Quadril cm" campo="quadril" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
          </div>
 
          <h4>Membros superiores</h4>
          <div style={styles.formGrid}>
            <CampoAvaliacao label="Bíceps direito cm" campo="bicepsDireito" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Bíceps esquerdo cm" campo="bicepsEsquerdo" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Antebraço direito cm" campo="antebracoDireito" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Antebraço esquerdo cm" campo="antebracoEsquerdo" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
          </div>
 
          <h4>Membros inferiores</h4>
          <div style={styles.formGrid}>
            <CampoAvaliacao label="Coxa direita cm" campo="coxaDireita" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Coxa esquerda cm" campo="coxaEsquerda" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Panturrilha direita cm" campo="panturrilhaDireita" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
            <CampoAvaliacao label="Panturrilha esquerda cm" campo="panturrilhaEsquerda" draft={avaliacaoDraft} atualizar={atualizarAvaliacao} />
          </div>
 
          <label style={styles.label}>Observações da avaliação</label>
          <textarea
            style={styles.input}
            value={avaliacaoDraft.observacoes}
            onChange={(e) => atualizarAvaliacao("observacoes", e.target.value)}
            placeholder="Observações importantes da avaliação física"
          />
 
          <button style={styles.primary} onClick={() => salvarAvaliacaoAluno(aluno)}>
            Salvar avaliação
          </button>
        </div>
 
        <div style={styles.panel}>
          <h3>Evolução corporal</h3>
          <MiniGrafico
            titulo="Peso"
            dados={dados.avaliacoes}
            campo="peso"
            sufixo="kg"
          />
          <MiniGrafico
            titulo="% Gordura"
            dados={dados.avaliacoes}
            campo="gordura"
            sufixo="%"
          />
          <MiniGrafico
            titulo="Massa magra"
            dados={dados.avaliacoes}
            campo="massaMagra"
            sufixo="kg"
          />
          <MiniGrafico titulo="Cintura" dados={dados.avaliacoes} campo="cintura" sufixo="cm" />
          <MiniGrafico titulo="Coxa direita" dados={dados.avaliacoes} campo="coxaDireita" sufixo="cm" />
          <MiniGrafico titulo="Coxa esquerda" dados={dados.avaliacoes} campo="coxaEsquerda" sufixo="cm" />
        </div>
      </div>
 
      <div style={styles.dashboardGrid}>
        <div style={styles.panel}>
          <h3>Linha do tempo</h3>
 
          {dados.timeline.length === 0 && <p>Sem registros ainda.</p>}
 
          {dados.timeline.slice(0, 20).map((item: any, index: number) => (
            <div key={index} style={styles.timelineItem}>
              <b>{item.tipo}</b> - {item.titulo}
              <br />
              <small>{item.data}</small>
              <p>{item.detalhe}</p>
            </div>
          ))}
        </div>
 
        <div style={styles.panel}>
          <h3>Cargas registradas</h3>
 
          {dados.cargas.length === 0 && <p>Nenhuma carga registrada ainda.</p>}
 
          {dados.cargas.slice(0, 20).map((item: any, index: number) => (
            <div key={index} style={styles.timelineItem}>
              <b>{item.exercicio}</b>
              <p>{item.carga} | {item.treino}</p>
              <small>{item.data}</small>
            </div>
          ))}
        </div>
      </div>
 
      <div style={styles.panel}>
        <h3>Histórico de avaliações</h3>
 
        {dados.avaliacoes.length === 0 && <p>Nenhuma avaliação salva.</p>}
 
        {dados.avaliacoes.map((avaliacao: any) => (
          <div key={avaliacao.id} style={styles.avaliacaoLinha}>
            <div>
              <b>{avaliacao.data}</b>
              <p>
                Peso: {avaliacao.peso || "-"} kg | Gordura: {avaliacao.gordura || "-"}% | Massa magra: {avaliacao.massaMagra || "-"} kg | IMC: {avaliacao.imc || "-"} | Cintura: {avaliacao.cintura || "-"} cm
              </p>
              {avaliacao.observacoes && <small>{avaliacao.observacoes}</small>}
            </div>
 
            <div>
              <button style={styles.secondary} onClick={() => editarAvaliacao(avaliacao)}>
                Editar
              </button>
              <button style={styles.danger} onClick={() => excluirAvaliacaoAluno(aluno, avaliacao.id)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
 
function Kpi({ titulo, valor }: any) {
  return (
    <div style={styles.kpiCard}>
      <small>{titulo}</small>
      <b>{valor}</b>
    </div>
  );
}
 
function CampoAvaliacao({ label, campo, draft, atualizar }: any) {
  return (
    <label style={styles.label}>
      {label}
      <input
        style={styles.input}
        value={draft[campo] || ""}
        onChange={(e) => atualizar(campo, e.target.value)}
      />
    </label>
  );
}
 
function MiniGrafico({ titulo, dados, campo, sufixo }: any) {
  const valores = [...(dados || [])]
    .reverse()
    .map((item: any) => ({
      data: item.data,
      valor: Number(String(item[campo] || "").replace(",", ".")),
    }))
    .filter((item) => !isNaN(item.valor) && item.valor > 0);
 
  if (valores.length < 2) {
    return (
      <div style={styles.graficoCard}>
        <b>{titulo}</b>
        <p><small>Gráfico aparece após 2 avaliações.</small></p>
      </div>
    );
  }
 
  const max = Math.max(...valores.map((v) => v.valor));
  const min = Math.min(...valores.map((v) => v.valor));
  const range = max - min || 1;
 
  const coords = valores
    .map((p, i) => {
      const x = (i / (valores.length - 1)) * 260;
      const y = 90 - ((p.valor - min) / range) * 75;
      return `${x},${y}`;
    })
    .join(" ");
 
  return (
    <div style={styles.graficoCard}>
      <b>{titulo}</b>
      <svg width="280" height="105" viewBox="0 0 280 105">
        <polyline fill="none" stroke="#2563eb" strokeWidth="4" points={coords} />
        {valores.map((p, i) => {
          const x = (i / (valores.length - 1)) * 260;
          const y = 90 - ((p.valor - min) / range) * 75;
          return <circle key={i} cx={x} cy={y} r="4" fill="#16a34a" />;
        })}
      </svg>
      <small>
        Inicial: {valores[0].valor}{sufixo} | Atual: {valores[valores.length - 1].valor}{sufixo}
      </small>
    </div>
  );
}
 
function AdminStat({ titulo, valor }: { titulo: string; valor: any }) {
  return (
    <div style={styles.adminStat}>
      <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>{titulo}</div>
      <strong style={{ fontSize: 22, color: "#0f172a" }}>{valor}</strong>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.infoBox}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <strong style={{ color: "#ffffff" }}>{value}</strong>
    </div>
  );
}


const styles: any = {
  adminStat: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: 14,
    textAlign: "center",
    boxShadow: "0 4px 14px rgba(15,23,42,.08)",
  },
  infoBox: {
    background: "#0f172a",
    color: "#fff",
    borderRadius: 14,
    padding: 12,
    textAlign: "center",
    border: "1px solid #334155",
  },
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0f172a,#1e293b)",
    color: "#0f172a",
    padding: 20,
    fontFamily: "Arial",
  },
  container: { maxWidth: 1100, margin: "0 auto" },
  center: { textAlign: "center" },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    color: "white",
    alignItems: "center",
    marginBottom: 20,
    gap: 10,
    flexWrap: "wrap",
  },
  card: {
    background: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 18,
    boxShadow: "0 10px 25px rgba(0,0,0,.2)",
  },
  cardCompacto: {
    background: "white",
    padding: 25,
    borderRadius: 16,
    maxWidth: 420,
    margin: "60px auto",
    boxShadow: "0 10px 25px rgba(0,0,0,.2)",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
    gap: 16,
  },
  treinoTabs: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  tab: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: "#e2e8f0",
    cursor: "pointer",
    fontWeight: "bold",
  },
  tabAtiva: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
  },
  treinoHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  exercise: {
    border: "1px solid #cbd5e1",
    padding: 15,
    borderRadius: 14,
    marginTop: 15,
  },
  exerciseHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  exerciseTitleButton: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 22,
    fontWeight: "bold",
    color: "#0f172a",
    textAlign: "left",
  },
  input: {
    width: "100%",
    padding: 12,
    marginTop: 5,
    marginBottom: 10,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111827",
    fontSize: 16,
  },
  textarea: {
    width: "100%",
    minHeight: 95,
    padding: 12,
    marginTop: 5,
    marginBottom: 10,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111827",
    fontSize: 16,
    resize: "vertical",
    whiteSpace: "pre-wrap",
    fontFamily: "Arial",
  },
  label: { fontWeight: "bold", display: "block" },
  primary: {
    padding: "10px 14px",
    margin: 5,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
  },
  secondary: {
    padding: "10px 14px",
    margin: 5,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
    opacity: 1,
  },
  danger: {
    padding: "10px 14px",
    margin: 5,
    borderRadius: 10,
    border: "none",
    background: "#dc2626",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
    opacity: 1,
  },
  success: {
    padding: "10px 14px",
    margin: 5,
    borderRadius: 10,
    border: "none",
    background: "#dcfce7",
    color: "#166534",
    cursor: "pointer",
    fontWeight: "bold",
  },
  messages: {
    marginTop: 20,
    padding: 15,
    background: "#f1f5f9",
    borderRadius: 12,
  },
  progressBg: {
    width: "100%",
    height: 12,
    background: "#e2e8f0",
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg,#22c55e,#2563eb)",
    transition: "width .3s",
  },
  ok: {
    padding: 10,
    background: "#dcfce7",
    color: "#166534",
    borderRadius: 10,
    fontWeight: "bold",
  },
  timerFixo: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    padding: 12,
    background: "#0f172a",
    color: "white",
    borderRadius: 12,
    marginBottom: 15,
    boxShadow: "0 6px 16px rgba(0,0,0,.25)",
  },
  chartBox: {
    marginTop: 12,
    padding: 12,
    background: "white",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
  },
  alunoSelecionadoBox: {
    padding: 12,
    background: "#dbeafe",
    border: "1px solid #2563eb",
    borderRadius: 12,
    marginTop: 10,
  },
  professorTabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 15,
  },
  alunoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: 14,
  },
  alunoCardGerenciar: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: 15,
    marginTop: 10,
  },
  alunoLinhaTopo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  alunoInfoLinha: { display: "flex", alignItems: "center", gap: 10 },
  alunoFotoMini: {
    width: 55,
    height: 55,
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid #2563eb",
  },
  contatoBox: {
    background: "#eff6ff",
    border: "1px solid #2563eb",
    borderRadius: 14,
    padding: 14,
    marginBottom: 15,
    textAlign: "center",
  },
  configBox: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: 15,
    marginBottom: 18,
  },
  dashboardAluno: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    background: "linear-gradient(135deg,#eff6ff,#f8fafc)",
    border: "1px solid #bfdbfe",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    background: "white",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 4px 12px rgba(15,23,42,.08)",
  },
  dashboardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
    gap: 14,
    marginTop: 14,
  },
  panel: {
    background: "white",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: 14,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
    gap: 10,
  },
  timelineItem: {
    borderLeft: "4px solid #2563eb",
    padding: "8px 10px",
    marginBottom: 10,
    background: "#f8fafc",
    borderRadius: 10,
  },
  avaliacaoLinha: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    background: "#f8fafc",
  },
  graficoCard: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    background: "#f8fafc",
  },
  fotoPreview: {
    width: 90,
    height: 90,
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid #2563eb",
    marginBottom: 10,
  },
 
/* ===== VISUAL PREMIUM ALUNO - INÍCIO ===== */
  alunoPagePremium: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#0b1224 0%,#111827 100%)",
    padding: 18,
    color: "#ffffff",
  },
  alunoHeaderPro: {
    color: "#ffffff",
    marginBottom: 22,
  },
  alunoTituloPro: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: 800,
    margin: 0,
    lineHeight: 1.1,
  },
  alunoSubtituloPro: {
    color: "#94a3b8",
    fontSize: 17,
    marginTop: 6,
  },
  selectTreinoAluno: {
    width: "100%",
    padding: 16,
    borderRadius: 18,
    border: "none",
    background: "#f8fafc",
    color: "#111827",
    fontSize: 17,
    marginBottom: 18,
  },
  alunoCardExercicio: {
    background: "linear-gradient(180deg,#1e293b 0%,#111827 100%)",
    padding: 20,
    borderRadius: 28,
    marginBottom: 24,
    border: "3px solid #22c55e",
    boxShadow: "0 14px 35px rgba(0,0,0,0.35)",
    color: "#ffffff",
  },
  alunoExercicioTitulo: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: 800,
    marginBottom: 14,
  },
  alunoImagemExercicio: {
    width: "100%",
    maxHeight: 430,
    objectFit: "contain",
    borderRadius: 22,
    background: "#fff",
    marginTop: 12,
    marginBottom: 16,
    padding: 8,
    boxSizing: "border-box",
  },
  alunoInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  alunoInfoPill: {
    background: "#020617",
    color: "#ffffff",
    borderRadius: 16,
    padding: "13px 15px",
    fontSize: 16,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  alunoCargaInput: {
    width: "100%",
    padding: 18,
    borderRadius: 18,
    border: "none",
    background: "#ffffff",
    color: "#111827",
    fontSize: 17,
    marginTop: 8,
    marginBottom: 18,
    boxSizing: "border-box",
  },
  alunoBotaoAzul: {
    width: "100%",
    padding: "18px 20px",
    marginTop: 12,
    borderRadius: 18,
    border: "none",
    background: "linear-gradient(90deg,#3b82f6,#2563eb)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 17,
    boxShadow: "0 8px 18px rgba(37,99,235,0.28)",
  },
  alunoBotaoVerde: {
    width: "100%",
    padding: "18px 20px",
    marginTop: 12,
    borderRadius: 18,
    border: "none",
    background: "#22c55e",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 17,
    boxShadow: "0 8px 18px rgba(34,197,94,0.25)",
  },
  alunoBotaoVermelho: {
    width: "100%",
    padding: "18px 20px",
    marginTop: 12,
    borderRadius: 18,
    border: "none",
    background: "#ef4444",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 17,
    boxShadow: "0 8px 18px rgba(239,68,68,0.25)",
  },
  alunoSemGif: {
    background: "#020617",
    color: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    fontSize: 16,
  },
  alunoProgressoFundo: {
    width: "100%",
    height: 12,
    background: "#334155",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 16,
    marginBottom: 22,
  },
  alunoProgressoBarra: {
    height: "100%",
    background: "linear-gradient(90deg,#22c55e,#3b82f6)",
    borderRadius: 999,
  },
/* ===== VISUAL PREMIUM ALUNO - FIM ===== */
 
  alunoExercicioTituloBotao: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "left",
  },
  alunoInfoGridLimpo: {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  alunoVideoLink: {
    display: "block",
    width: "fit-content",
    padding: "12px 16px",
    borderRadius: 14,
    background: "#2563eb",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 800,
    marginTop: 12,
    marginBottom: 12,
  },
  alunoCampoLabel: {
    display: "block",
    color: "#ffffff",
    fontWeight: 800,
    marginTop: 12,
    marginBottom: 6,
  },
  alunoTextarea: {
    width: "100%",
    minHeight: 110,
    padding: 16,
    borderRadius: 18,
    border: "none",
    background: "#ffffff",
    color: "#111827",
    fontSize: 17,
    marginTop: 8,
    marginBottom: 18,
    boxSizing: "border-box",
    resize: "vertical",
    whiteSpace: "pre-wrap",
    fontFamily: "Arial",
  },
  alunoObservacaoProfessor: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 14,
    color: "#ffffff",
    marginTop: 12,
    marginBottom: 12,
  },
  textoQuebraLinha: {
    whiteSpace: "pre-wrap",
    marginBottom: 0,
  },

  adminDashboard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    gap: 12,
    margin: "18px 0",
  },
  adminStatCard: {
    background: "#0f172a",
    color: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 18px rgba(15,23,42,.22)",
  },
  adminStatValor: {
    fontSize: 24,
    fontWeight: 800,
    marginTop: 6,
  },
  professoresAdminGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
    gap: 16,
    marginTop: 16,
  },
  professorAdminCard: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 8px 18px rgba(15,23,42,.10)",
  },
  professorAdminTopo: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  statusBadge: {
    color: "white",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  adminInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
    gap: 10,
    margin: "12px 0",
  },
  obsAdminBox: {
    background: "#e0f2fe",
    border: "1px solid #7dd3fc",
    borderRadius: 12,
    padding: 10,
    whiteSpace: "pre-wrap",
  },
  adminButtonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
    gap: 8,
    marginTop: 12,
  },
  timerNumero: {
    fontSize: 56,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: 1,
  },
  timerInfoTexto: {
    fontSize: 15,
    fontWeight: 800,
    textAlign: "center",
  },
  timerFechar: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.18)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  },
  finalizarTreinoBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    background: "#0f172a",
    border: "1px solid #334155",
  },
  botaoFinalizarTreino: {
    width: "100%",
    background: "linear-gradient(135deg,#22c55e,#16a34a)",
    color: "#ffffff",
    border: "none",
    padding: 18,
    borderRadius: 18,
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 8,
  },
  botaoReiniciarTreino: {
    width: "100%",
    background: "linear-gradient(135deg,#f59e0b,#d97706)",
    color: "#ffffff",
    border: "none",
    padding: 16,
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12,
  },
  botaoReiniciarSemana: {
    width: "100%",
    background: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
    color: "#ffffff",
    border: "none",
    padding: 16,
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12,
  },
  treinoFinalizadoAviso: {
    background: "linear-gradient(135deg,#064e3b,#14532d)",
    color: "white",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    border: "1px solid rgba(255,255,255,0.16)",
  },

};

