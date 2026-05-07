import { useEffect, useMemo, useState } from "react";
 
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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
 
type Perfil = {
  uid: string;
  nome: string;
  email: string;
  tipo: "professor" | "aluno";
  foto?: string;
  formacao?: string;
  especialidade?: string;
  cref?: string;
  descricao?: string;
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
  alunoId: string;
  alunoNome: string;
  alunoEmail: string;
  professorEmail: string;
  exercicios: Exercicio[];
  mensagens: { texto: string; autor: string; data: string }[];
  criadoEm?: any;
};
 
const CACHE_TREINOS = "evotrain_cache_treinos_v2";
const uid = () => Date.now().toString() + Math.random().toString(16).slice(2);
 
export default function App() {
  const [usuario, setUsuario] = useState<any>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
 
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tipoCadastro, setTipoCadastro] = useState<"professor" | "aluno">("aluno");
 
  const [alunos, setAlunos] = useState<any[]>([]);
  const [treinos, setTreinos] = useState<Treino[]>(() => {
    const cache = localStorage.getItem(CACHE_TREINOS);
    return cache ? JSON.parse(cache) : [];
  });
 
  const [novoAlunoNome, setNovoAlunoNome] = useState("");
  const [novoAlunoEmail, setNovoAlunoEmail] = useState("");
  const [novoAlunoFoto, setNovoAlunoFoto] = useState("");
 
  const [alunoSelecionado, setAlunoSelecionado] = useState("");
  const [nomeTreino, setNomeTreino] = useState("");
  const [dataTreino, setDataTreino] = useState("");
  const [treinoAbertoId, setTreinoAbertoId] = useState("");
  const [mensagem, setMensagem] = useState("");
 
  const [online, setOnline] = useState(navigator.onLine);
  const [notificacoes, setNotificacoes] = useState(Notification?.permission || "default");
 
  const [timerAtivo, setTimerAtivo] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(0);
  const [timerInfo, setTimerInfo] = useState("Descanso");
 
  const [dragExercicioId, setDragExercicioId] = useState("");
 
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUsuario(user);
      if (user) await carregarPerfil(user);
      else setPerfil(null);
    });
    return () => unsub();
  }, []);
 
  useEffect(() => {
    if (usuario && perfil) carregarTudo();
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
 
  async function carregarPerfil(user: any) {
    const ref = doc(db, "usuarios", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setPerfil(snap.data() as Perfil);
      return;
    }
 
    const novoPerfil: Perfil = {
      uid: user.uid,
      nome: user.email,
      email: user.email,
      tipo: "aluno",
      foto: "",
      formacao: "",
      especialidade: "",
      cref: "",
      descricao: "",
    };
 
    await setDoc(ref, novoPerfil);
    setPerfil(novoPerfil);
  }
 
  async function carregarTudo() {
    let qAlunos: any;
 
    if (perfil?.tipo === "professor") {
      qAlunos = query(
        collection(db, "alunos"),
        where("professorEmail", "==", usuario.email)
      );
    } else {
      qAlunos = query(
        collection(db, "alunos"),
        where("email", "==", usuario.email)
      );
    }
 
    const alunosSnap = await getDocs(qAlunos);
    const listaAlunos = alunosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setAlunos(listaAlunos);
 
    const treinosRef = collection(db, "treinos");
    const qTreinos = perfil?.tipo === "professor"
      ? query(treinosRef, where("professorEmail", "==", usuario.email))
      : query(treinosRef, where("alunoEmail", "==", usuario.email));
 
    const treinosSnap = await getDocs(qTreinos);
    const listaTreinos = treinosSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Treino));
    setTreinos(listaTreinos);
 
    if (!treinoAbertoId && listaTreinos[0]) setTreinoAbertoId(listaTreinos[0].id);
  }
 
  async function cadastrar() {
    try {
      if (!email.includes("@")) return alert("Digite um e-mail válido.");
      if (senha.length < 6) return alert("A senha precisa ter no mínimo 6 caracteres.");
 
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      const novoPerfil: Perfil = {
        uid: cred.user.uid,
        nome: email,
        email,
        tipo: tipoCadastro,
        foto: "",
        formacao: "",
        especialidade: "",
        cref: "",
        descricao: "",
      };
      await setDoc(doc(db, "usuarios", cred.user.uid), novoPerfil);
      alert("Conta criada com sucesso!");
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
      if (!email.includes("@")) return alert("Digite seu e-mail para recuperar a senha.");
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
    await updateDoc(doc(db, "usuarios", perfil.uid), perfil as any);
    alert("Perfil salvo!");
  }
 
  async function cadastrarAluno() {
    if (!novoAlunoNome || !novoAlunoEmail.includes("@")) {
      alert("Preencha nome e e-mail válido do aluno.");
      return;
    }
 
    await addDoc(collection(db, "alunos"), {
      nome: novoAlunoNome,
      email: novoAlunoEmail,
      foto: novoAlunoFoto,
      professorEmail: usuario.email,
      criadoEm: new Date(),
    });
 
    setNovoAlunoNome("");
    setNovoAlunoEmail("");
    setNovoAlunoFoto("");
    carregarTudo();
  }
 
  async function criarTreino() {
    if (!alunoSelecionado || !nomeTreino) return alert("Selecione o aluno e informe o nome do treino.");
 
    const aluno = alunos.find((a) => a.id === alunoSelecionado);
    const ref = await addDoc(collection(db, "treinos"), {
      nome: nomeTreino,
      dataTreino,
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      alunoEmail: aluno.email,
      professorEmail: usuario.email,
      exercicios: [],
      mensagens: [],
      criadoEm: new Date(),
    });
 
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
 
  async function adicionarExercicio(treino: Treino) {
    const novo: Exercicio = {
      id: uid(),
      nome: "Novo exercício",
      series: "4",
      repeticoes: "10",
      descanso: "60",
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
      ordem: (treino.exercicios || []).length,
      historicoCargas: [],
    };
    await salvarExercicios(treino, [...(treino.exercicios || []), novo]);
  }
 
  async function salvarExercicios(treino: Treino, exercicios: Exercicio[]) {
    const atualizados = exercicios.map((e, index) => ({ ...e, ordem: index }));
    setTreinos((prev) => prev.map((t) => t.id === treino.id ? { ...t, exercicios: atualizados } : t));
    await updateDoc(doc(db, "treinos", treino.id), { exercicios: atualizados });
    carregarTudo();
  }
 
  async function atualizarExercicio(treino: Treino, exId: string, campo: keyof Exercicio, valor: any) {
    const exercicios = (treino.exercicios || []).map((ex) => ex.id === exId ? { ...ex, [campo]: valor } : ex);
    await salvarExercicios(treino, exercicios);
  }
 
  async function excluirExercicio(treino: Treino, exId: string) {
    const exercicios = (treino.exercicios || []).filter((ex) => ex.id !== exId);
    await salvarExercicios(treino, exercicios);
  }
 
  async function marcarSerie(treino: Treino, ex: Exercicio, serie: number) {
    const atuais = ex.seriesConcluidas || [];
    const novas = atuais.includes(serie) ? atuais.filter((s) => s !== serie) : [...atuais, serie];
    const exercicios = treino.exercicios.map((e) => e.id === ex.id ? { ...e, seriesConcluidas: novas } : e);
    await salvarExercicios(treino, exercicios);
    iniciarDescanso(Number(ex.descanso) || 60, `${ex.nome} - descanso`);
  }
 
  async function finalizarExercicio(treino: Treino, ex: Exercicio) {
    const todasSeries = Array.from({ length: Number(ex.series) || 0 }, (_, i) => i + 1);
    const carga = ex.cargaAtual || ex.ultimaCarga || "";
 
    const exercicios = treino.exercicios.map((e) => e.id === ex.id
      ? {
          ...e,
          seriesConcluidas: todasSeries,
          finalizado: true,
          ultimaCarga: carga,
          cargaAtual: carga,
          historicoCargas: carga
            ? [...(e.historicoCargas || []), { carga, data: new Date().toLocaleString() }]
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
    await salvarExercicios(treino, exercicios);
  }
 
  async function enviarMensagem(treino: Treino) {
    if (!mensagem) return;
    const nova = {
      texto: mensagem,
      autor: perfil?.tipo === "professor" ? "Professor" : perfil?.nome || "Aluno",
      data: new Date().toLocaleString(),
    };
    await updateDoc(doc(db, "treinos", treino.id), { mensagens: [...(treino.mensagens || []), nova] });
    setMensagem("");
    carregarTudo();
  }
 
  async function solicitarNotificacoes() {
    const permissao = await Notification.requestPermission();
    setNotificacoes(permissao);
  }
 
  function enviarNotificacao(titulo: string, corpo: string) {
    if (Notification.permission === "granted") {
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
  }
 
  async function moverExercicio(treino: Treino, destinoId: string) {
    if (!dragExercicioId || dragExercicioId === destinoId) return;
    const lista = [...(treino.exercicios || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const origemIndex = lista.findIndex((e) => e.id === dragExercicioId);
    const destinoIndex = lista.findIndex((e) => e.id === destinoId);
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
      prev.map((t) =>
        t.id === treinoId ? { ...t, nome: novoNome } : t
      )
    );
  }

  async function salvarNomeTreino(treino: Treino) {
    if (!treino.nome.trim()) {
      alert("Digite o nome do treino.");
      return;
    }

    await updateDoc(doc(db, "treinos", treino.id), {
      nome: treino.nome,
    });

    alert("Nome do treino salvo!");
    carregarTudo();
  }

  const treinosOrdenados = useMemo(() => [...treinos].sort((a, b) => (a.nome || "").localeCompare(b.nome || "")), [treinos]);
 
  if (!usuario) {
    return (
      <Page>
        <Card compacto>
          <h1 style={styles.center}>EvoTrain</h1>
          <input style={styles.input} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={styles.input} placeholder="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <select style={styles.input} value={tipoCadastro} onChange={(e) => setTipoCadastro(e.target.value as any)}>
            <option value="aluno">Aluno</option>
            <option value="professor">Professor</option>
          </select>
          <button style={styles.primary} onClick={entrar}>Entrar</button>
          <button style={styles.secondary} onClick={cadastrar}>Criar conta</button>
          <button style={styles.secondary} onClick={recuperarSenha}>Recuperar senha</button>
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
          <button style={styles.secondary} onClick={solicitarNotificacoes}>Notificações: {notificacoes}</button>
          <button style={styles.danger} onClick={sair}>Sair</button>
        </div>
      </div>
 
      {timerAtivo && (
        <div style={styles.timerFixo}>
          <b>{timerInfo}</b> - {formatarTempo(tempoRestante)}
          <button style={styles.secondary} onClick={() => setTimerAtivo(false)}>Pausar</button>
        </div>
      )}
 
      <Card>
        <h2>Meu perfil</h2>
        <input style={styles.input} placeholder="Nome" value={perfil?.nome || ""} onChange={(e) => setPerfil({ ...(perfil as Perfil), nome: e.target.value })} />
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
          <img
            src={perfil.foto}
            alt="Foto do perfil"
            style={styles.fotoPreview}
          />
        )}
        {perfil?.tipo === "professor" && (
          <>
            <input style={styles.input} placeholder="Formação" value={perfil?.formacao || ""} onChange={(e) => setPerfil({ ...(perfil as Perfil), formacao: e.target.value })} />
            <input style={styles.input} placeholder="Especialidade" value={perfil?.especialidade || ""} onChange={(e) => setPerfil({ ...(perfil as Perfil), especialidade: e.target.value })} />
            <input style={styles.input} placeholder="CREF" value={perfil?.cref || ""} onChange={(e) => setPerfil({ ...(perfil as Perfil), cref: e.target.value })} />
            <textarea style={styles.input} placeholder="Descrição profissional" value={perfil?.descricao || ""} onChange={(e) => setPerfil({ ...(perfil as Perfil), descricao: e.target.value })} />
          </>
        )}
        <button style={styles.primary} onClick={salvarPerfil}>Salvar perfil</button>
      </Card>
 
      {perfil?.tipo === "professor" && (
        <div style={styles.grid2}>
          <Card>
            <h2>Cadastrar aluno</h2>
            <input style={styles.input} placeholder="Nome do aluno" value={novoAlunoNome} onChange={(e) => setNovoAlunoNome(e.target.value)} />
            <input style={styles.input} placeholder="E-mail do aluno" value={novoAlunoEmail} onChange={(e) => setNovoAlunoEmail(e.target.value)} />
            <label style={styles.label}>Foto do aluno</label>
            <input
              style={styles.input}
              type="file"
              accept="image/*"
              onChange={(e) =>
                lerImagemLocal(e, (foto) => setNovoAlunoFoto(foto))
              }
            />
            {novoAlunoFoto && (
              <img
                src={novoAlunoFoto}
                alt="Foto do aluno"
                style={styles.fotoPreview}
              />
            )}
            <button style={styles.primary} onClick={cadastrarAluno}>Cadastrar aluno</button>
          </Card>
 
          <Card>
            <h2>Criar treino</h2>
            <select style={styles.input} value={alunoSelecionado} onChange={(e) => setAlunoSelecionado(e.target.value)}>
              <option value="">Selecione o aluno</option>
              {alunos.map((a) => <option key={a.id} value={a.id}>{a.nome} - {a.email}</option>)}
            </select>
            <label style={styles.label}>Nome do treino</label>
            <input
              style={styles.input}
              placeholder="Ex.: Treino A, Pernas, Costas, Superior"
              value={nomeTreino}
              onChange={(e) => setNomeTreino(e.target.value)}
            />
            <input style={styles.input} type="date" value={dataTreino} onChange={(e) => setDataTreino(e.target.value)} />
            <button style={styles.primary} onClick={criarTreino}>Criar treino</button>
          </Card>
        </div>
      )}
 
      <h2 style={{ color: "white" }}>Treinos</h2>
      <div style={styles.treinoTabs}>
        {treinosOrdenados.map((t) => {
          const progresso = calcularProgresso(t);
          return (
            <button key={t.id} style={treinoAbertoId === t.id ? styles.tabAtiva : styles.tab} onClick={() => setTreinoAbertoId(t.id)}>
              {t.nome} - {Math.round(progresso)}%
            </button>
          );
        })}
      </div>
 
      {treinosOrdenados.filter((t) => t.id === treinoAbertoId).map((treino) => {
        const exerciciosOrdenados = ordenarExercicios(treino.exercicios || []);
        const progresso = calcularProgresso(treino);
        const finalizado = progresso === 100 && (treino.exercicios || []).length > 0;
 
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
                <p><b>Aluno:</b> {treino.alunoNome} - {treino.alunoEmail}</p>
                {treino.dataTreino && <p><b>Data:</b> {treino.dataTreino}</p>}
              </div>
              <div>
                {perfil?.tipo === "professor" && <button style={styles.primary} onClick={() => adicionarExercicio(treino)}>Adicionar exercício</button>}
                <button style={styles.secondary} onClick={() => reiniciarTreino(treino)}>Reiniciar treino</button>
                {perfil?.tipo === "professor" && <button style={styles.danger} onClick={() => excluirTreino(treino.id)}>Excluir treino</button>}
              </div>
            </div>
 
            <ProgressBar value={progresso} />
            {finalizado && <p style={styles.ok}>Treino finalizado. Clique em reiniciar para repetir na semana.</p>}
 
            {exerciciosOrdenados.map((ex) => (
              <div
                key={ex.id}
                draggable={perfil?.tipo === "professor"}
                onDragStart={() => setDragExercicioId(ex.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moverExercicio(treino, ex.id)}
                style={{
                  ...styles.exercise,
                  opacity: ex.finalizado ? 0.55 : 1,
                  background: ex.finalizado ? "#dcfce7" : "#f8fafc",
                }}
              >
                <h3>{ex.finalizado ? "✅ " : "☐ "}{ex.nome}</h3>
                {perfil?.tipo === "professor" && <small>Arraste para reordenar</small>}
 
                <Field label="Nome do exercício" disabled={perfil?.tipo !== "professor"} value={ex.nome} onChange={(v: any) => atualizarExercicio(treino, ex.id, "nome", v)} />
                <Field label="Séries" disabled={perfil?.tipo !== "professor"} value={ex.series} onChange={(v: any) => atualizarExercicio(treino, ex.id, "series", v)} />
                <Field label="Repetições" disabled={perfil?.tipo !== "professor"} value={ex.repeticoes} onChange={(v: any) => atualizarExercicio(treino, ex.id, "repeticoes", v)} />
                <Field label="Descanso em segundos" disabled={perfil?.tipo !== "professor"} value={ex.descanso} onChange={(v: any) => atualizarExercicio(treino, ex.id, "descanso", v)} />
                <Field label="Carga sugerida" disabled={perfil?.tipo !== "professor"} value={ex.cargaSugerida} onChange={(v: any) => atualizarExercicio(treino, ex.id, "cargaSugerida", v)} />
                <Field label="Método" disabled={perfil?.tipo !== "professor"} value={ex.metodo} onChange={(v: any) => atualizarExercicio(treino, ex.id, "metodo", v)} />
                <Field label="Velocidade" disabled={perfil?.tipo !== "professor"} value={ex.velocidade} onChange={(v: any) => atualizarExercicio(treino, ex.id, "velocidade", v)} />
                <Field label="Vídeo/GIF" disabled={perfil?.tipo !== "professor"} value={ex.video} onChange={(v: any) => atualizarExercicio(treino, ex.id, "video", v)} />
                <Field label="Carga usada pelo aluno" disabled={perfil?.tipo !== "aluno"} value={ex.cargaAtual} onChange={(v: any) => atualizarExercicio(treino, ex.id, "cargaAtual", v)} />
                <Field label="Observação professor" disabled={perfil?.tipo !== "professor"} value={ex.obsProfessor} onChange={(v: any) => atualizarExercicio(treino, ex.id, "obsProfessor", v)} />
                <Field label="Observação aluno" disabled={perfil?.tipo !== "aluno"} value={ex.obsAluno} onChange={(v: any) => atualizarExercicio(treino, ex.id, "obsAluno", v)} />
 
                {ex.video && <a href={ex.video} target="_blank">Ver vídeo</a>}
 
                {perfil?.tipo === "aluno" && (
                  <>
                    <h4>Séries</h4>
                    {Array.from({ length: Number(ex.series) || 0 }, (_, i) => i + 1).map((s) => (
                      <button key={s} style={{ ...styles.secondary, background: ex.seriesConcluidas?.includes(s) ? "#86efac" : "#e2e8f0" }} onClick={() => marcarSerie(treino, ex, s)}>
                        Série {s}
                      </button>
                    ))}
                    <button style={styles.success} onClick={() => finalizarExercicio(treino, ex)}>Finalizar exercício</button>
                    <GraficoCarga historico={ex.historicoCargas || []} />
                  </>
                )}
 
                {perfil?.tipo === "professor" && (
                  <>
                    <button style={styles.success} onClick={() => alert("Exercício salvo!")}>Salvar exercício</button>
                    <button style={styles.danger} onClick={() => excluirExercicio(treino, ex.id)}>Excluir exercício</button>
                    <GraficoCarga historico={ex.historicoCargas || []} />
                  </>
                )}
              </div>
            ))}
 
            <div style={styles.messages}>
              <h3>Mensagens</h3>
              {(treino.mensagens || []).map((m, i) => <p key={i}><b>{m.autor}:</b> {m.texto} <small>{m.data}</small></p>)}
              <input style={styles.input} placeholder="Mensagem" value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              <button style={styles.primary} onClick={() => enviarMensagem(treino)}>Enviar</button>
            </div>
          </Card>
        );
      })}
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
 
function traduzErro(msg: string) {
  if (msg.includes("auth/invalid-email")) return "E-mail inválido. Digite um e-mail no formato correto.";
  if (msg.includes("auth/email-already-in-use")) return "Esse e-mail já está cadastrado. Use Entrar.";
  if (msg.includes("auth/weak-password")) return "A senha precisa ter no mínimo 6 caracteres.";
  if (msg.includes("auth/invalid-credential")) return "E-mail ou senha incorretos.";
  return msg;
}
 
function Page({ children }: any) {
  return <div style={styles.page}><div style={styles.container}>{children}</div></div>;
}
 
function Card({ children, compacto }: any) {
  return <div style={compacto ? styles.cardCompacto : styles.card}>{children}</div>;
}
 
function Field({ label, value, onChange, disabled }: any) {
  return (
    <label style={styles.label}>
      {label}
      <input style={styles.input} disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
 
function ProgressBar({ value }: any) {
  return (
    <div>
      <b>Progresso: {Math.round(value)}%</b>
      <div style={styles.progressBg}><div style={{ ...styles.progressFill, width: `${value}%` }} /></div>
    </div>
  );
}
 
function GraficoCarga({ historico }: any) {
  const pontos = (historico || []).map((h: any) => Number(String(h.carga).replace(",", ".").replace(/[^0-9.]/g, ""))).filter((n: number) => !isNaN(n));
  if (pontos.length < 2) return <p><small>Gráfico aparece após 2 registros de carga.</small></p>;
 
  const max = Math.max(...pontos);
  const min = Math.min(...pontos);
  const range = max - min || 1;
  const coords = pontos.map((p: number, i: number) => {
    const x = (i / (pontos.length - 1)) * 260;
    const y = 90 - ((p - min) / range) * 80;
    return `${x},${y}`;
  }).join(" ");
 
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
 
const styles: any = {
  page: { minHeight: "100vh", background: "linear-gradient(135deg,#0f172a,#1e293b)", color: "#0f172a", padding: 20, fontFamily: "Arial" },
  container: { maxWidth: 1100, margin: "0 auto" },
  center: { textAlign: "center" },
  topbar: { display: "flex", justifyContent: "space-between", color: "white", alignItems: "center", marginBottom: 20 },
  card: { background: "white", padding: 20, borderRadius: 16, marginBottom: 18, boxShadow: "0 10px 25px rgba(0,0,0,.2)" },
  cardCompacto: { background: "white", padding: 25, borderRadius: 16, maxWidth: 420, margin: "60px auto", boxShadow: "0 10px 25px rgba(0,0,0,.2)" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 },
  treinoTabs: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  tab: { padding: "12px 16px", borderRadius: 12, border: "none", background: "#e2e8f0", cursor: "pointer", fontWeight: "bold" },
  tabAtiva: { padding: "12px 16px", borderRadius: 12, border: "none", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: "bold" },
  treinoHeader: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  exercise: { border: "1px solid #cbd5e1", padding: 15, borderRadius: 14, marginTop: 15 },
  input: { width: "100%", padding: 10, marginTop: 5, marginBottom: 10, borderRadius: 10, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  label: { fontWeight: "bold", display: "block" },
  primary: { padding: "10px 14px", margin: 5, borderRadius: 10, border: "none", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: "bold" },
  secondary: { padding: "10px 14px", margin: 5, borderRadius: 10, border: "none", background: "#e2e8f0", cursor: "pointer", fontWeight: "bold" },
  danger: { padding: "10px 14px", margin: 5, borderRadius: 10, border: "none", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontWeight: "bold" },
  success: { padding: "10px 14px", margin: 5, borderRadius: 10, border: "none", background: "#dcfce7", color: "#166534", cursor: "pointer", fontWeight: "bold" },
  messages: { marginTop: 20, padding: 15, background: "#f1f5f9", borderRadius: 12 },
  progressBg: { width: "100%", height: 12, background: "#e2e8f0", borderRadius: 20, overflow: "hidden", marginTop: 8, marginBottom: 10 },
  progressFill: { height: "100%", background: "linear-gradient(90deg,#22c55e,#2563eb)", transition: "width .3s" },
  ok: { padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 10, fontWeight: "bold" },
  timerFixo: { position: "sticky", top: 0, zIndex: 10, padding: 12, background: "#0f172a", color: "white", borderRadius: 12, marginBottom: 15, boxShadow: "0 6px 16px rgba(0,0,0,.25)" },
  chartBox: { marginTop: 12, padding: 12, background: "white", borderRadius: 12, border: "1px solid #cbd5e1" },
  fotoPreview: { width: 90, height: 90, borderRadius: "50%", objectFit: "cover", border: "3px solid #2563eb", marginBottom: 10 },
};
