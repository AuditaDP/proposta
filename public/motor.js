// Motor de escalas: regras determinísticas, sem dependências.
// Roda no navegador e no Node (testes). Toda conta de horas é feita aqui,
// não pela IA: a IA interpreta e explica; o motor calcula e confere.

export const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DOMINGO = 6;

// Regimes de jornada. As datas da EC 141/2026 vieram de fontes jornalísticas
// (consulta em 17/11/2026) e precisam ser conferidas no texto oficial.
export const REGIMES = {
  atual44: {
    id: 'atual44',
    nome: 'Regra anterior: 44h semanais, 1 folga (6x1)',
    horasSemanais: 44,
    diasTrabalhoSemana: 6,
    folgasMinSemana: 1,
    fundamento: 'CF art. 7º, XIII e XV (redação anterior à EC 141/2026); CLT arts. 58 e 67',
  },
  ec141e1: {
    id: 'ec141e1',
    nome: 'EC 141/2026, 1ª etapa: 42h semanais, 2 folgas (5x2)',
    horasSemanais: 42,
    diasTrabalhoSemana: 5,
    folgasMinSemana: 2,
    inicio: '2026-12-16',
    fundamento: 'CF art. 7º, na redação da EC 141/2026 (regra de transição)',
  },
  ec141e2: {
    id: 'ec141e2',
    nome: 'EC 141/2026, 2ª etapa: 40h semanais, 2 folgas (5x2)',
    horasSemanais: 40,
    diasTrabalhoSemana: 5,
    folgasMinSemana: 2,
    inicio: '2027-12-16',
    fundamento: 'CF art. 7º, na redação da EC 141/2026',
  },
};

// Regime exigido na data informada (para conferir se o regime escolhido ainda vale).
export function regimeVigenteEm(dataISO) {
  if (!dataISO) return null;
  if (dataISO >= REGIMES.ec141e2.inicio) return REGIMES.ec141e2;
  if (dataISO >= REGIMES.ec141e1.inicio) return REGIMES.ec141e1;
  return REGIMES.atual44;
}

// ---------- utilidades de horário ----------
export const paraMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fmtHora = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const fmtDur = (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;

// Intervalo intrajornada mínimo (CLT art. 71).
export const intervaloMinimo = (trabalhoMin) => (trabalhoMin > 360 ? 60 : trabalhoMin > 240 ? 15 : 0);

function combinacoes(lista, k) {
  if (k <= 0) return [[]];
  if (k > lista.length) return [];
  const out = [];
  const rec = (ini, atual) => {
    if (atual.length === k) return out.push(atual.slice());
    for (let i = ini; i < lista.length; i++) {
      atual.push(lista[i]);
      rec(i + 1, atual);
      atual.pop();
    }
  };
  rec(0, []);
  return out;
}

function geradorAleatorio(semente) {
  let s = semente >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- configuração ----------
export function normalizarConfig(cfg) {
  const regime = { jornadaDiariaMax: 8, ...REGIMES[cfg.regimeId || 'ec141e2'], ...(cfg.regime || {}) };
  const atividade = cfg.atividade || 'comercio';
  return {
    empresa: cfg.empresa || '',
    atividade,
    regime,
    inicio: cfg.inicio || null,
    semanas: Math.max(1, Math.min(8, Number(cfg.semanas) || 4)),
    funcionamento: cfg.funcionamento,
    minimoPorDia: cfg.minimoPorDia.map((n) => Math.max(0, Number(n) || 0)),
    funcionarios: cfg.funcionarios.filter((f) => f && f.nome),
    // Lei 10.101/2000, art. 6º, parágrafo único: no comércio, folga no domingo
    // ao menos 1 vez a cada 3 semanas (salvo regra mais favorável em CCT).
    domingoACadaSemanas: cfg.domingoACadaSemanas ?? (atividade === 'comercio' ? 3 : null),
    aplicarArt386: !!cfg.aplicarArt386,
    permiteCompensacao: !!cfg.permiteCompensacao,
    cctAnalisada: !!cfg.cctAnalisada,
  };
}

// ---------- 1) distribuição das folgas (busca local) ----------
function gerarFolgas(c) {
  const E = c.funcionarios.length;
  const W = c.semanas;
  const N = W * 7;
  const aberto = c.funcionamento.map((f) => f.aberto);
  const abertos = [0, 1, 2, 3, 4, 5, 6].filter((d) => aberto[d]);
  const fechados = 7 - abertos.length;
  const F = 7 - c.regime.diasTrabalhoSemana;
  const extra = Math.max(0, Math.min(F - fechados, abertos.length));
  // opções de folga por semana: o mínimo exigido ou uma folga extra
  // (a extra só é usada quando necessária para cumprir uma regra)
  const opcoes = combinacoes(abertos, extra);
  const nBase = opcoes.length;
  if (extra + 1 <= abertos.length && extra + 1 < abertos.length) opcoes.push(...combinacoes(abertos, extra + 1));
  const domingoAberto = aberto[DOMINGO];

  const montar = (p) => {
    const folga = Array.from({ length: E }, () => new Array(N).fill(false));
    for (let e = 0; e < E; e++)
      for (let w = 0; w < W; w++) {
        for (let d = 0; d < 7; d++) if (!aberto[d]) folga[e][w * 7 + d] = true;
        for (const d of opcoes[p[e][w]]) folga[e][w * 7 + d] = true;
      }
    return folga;
  };

  const custo = (p) => {
    const folga = montar(p);
    let c0 = 0;
    // cobertura mínima por dia (forte) e equilíbrio da sobra (fraco)
    for (let t = 0; t < N; t++) {
      const d = t % 7;
      if (!aberto[d]) continue;
      let n = 0;
      for (let e = 0; e < E; e++) if (!folga[e][t]) n++;
      const falta = Math.max(0, c.minimoPorDia[d] - n);
      c0 += falta * 1000 + (n - c.minimoPorDia[d]) ** 2;
    }
    const domFolga = new Array(E).fill(0);
    for (let e = 0; e < E; e++) {
      // no máximo 6 dias seguidos de trabalho, considerando o ciclo repetido
      let seq = 0;
      for (let t = 0; t < 2 * N; t++) {
        if (folga[e][t % N]) seq = 0;
        else if (++seq > 6) c0 += 1000;
      }
      // domingos de folga dentro de janelas de k semanas (ciclo)
      const janelas = [];
      if (domingoAberto && c.domingoACadaSemanas) janelas.push(c.domingoACadaSemanas);
      if (domingoAberto && c.aplicarArt386 && c.funcionarios[e].sexo === 'F') janelas.push(2);
      for (const k of janelas) {
        for (let w = 0; w < W; w++) {
          let ok = false;
          for (let j = 0; j < k && !ok; j++) ok = folga[e][((w + j) % W) * 7 + DOMINGO];
          if (!ok) c0 += 1000;
        }
      }
      for (let w = 0; w < W; w++) if (folga[e][w * 7 + DOMINGO]) domFolga[e]++;
      for (let w = 0; w < W; w++) {
        // folga extra custa horas de trabalho: só quando ajuda a cumprir regra
        if (p[e][w] >= nBase) c0 += 60;
        // preferência: duas folgas da semana em dias seguidos
        else if (extra === 2) {
          const [a, b] = opcoes[p[e][w]];
          if (!(b - a === 1 || (a === 0 && b === 6))) c0 += 3;
        }
      }
    }
    // distribuir os domingos de folga de forma justa
    const media = domFolga.reduce((s, x) => s + x, 0) / Math.max(1, E);
    for (const x of domFolga) c0 += 5 * (x - media) ** 2;
    return c0;
  };

  let melhor = null;
  let melhorCusto = Infinity;
  if (opcoes.length === 0 || E === 0) return { folga: montar(Array.from({ length: E }, () => new Array(W).fill(0))), custo: 0 };

  for (let r = 0; r < 8; r++) {
    const rand = geradorAleatorio(1234 + r * 7919);
    const p = Array.from({ length: E }, (_, e) =>
      Array.from({ length: W }, (_, w) => (r === 0 ? (e + w * 3) % nBase : Math.floor(rand() * nBase))),
    );
    let atual = custo(p);
    for (let passo = 0, melhorou = true; melhorou && passo < 40; passo++) {
      melhorou = false;
      for (let e = 0; e < E; e++)
        for (let w = 0; w < W; w++) {
          const original = p[e][w];
          let escolha = original;
          for (let o = 0; o < opcoes.length; o++) {
            if (o === original) continue;
            p[e][w] = o;
            const v = custo(p);
            if (v < atual) { atual = v; escolha = o; melhorou = true; }
          }
          p[e][w] = escolha;
        }
    }
    if (atual < melhorCusto) { melhorCusto = atual; melhor = p.map((l) => l.slice()); }
  }
  return { folga: montar(melhor), custo: melhorCusto };
}

// ---------- 2) horários (turnos de abertura e fechamento) ----------
function modelosDeTurno(c) {
  const h = Math.round((c.regime.horasSemanais * 60) / c.regime.diasTrabalhoSemana);
  const intH = intervaloMinimo(h);
  return c.funcionamento.map((f) => {
    if (!f.aberto) return null;
    const abre = paraMin(f.abre);
    let fecha = paraMin(f.fecha);
    if (fecha <= abre) fecha += 1440;
    const D = fecha - abre;
    if (h + intH >= D) {
      // o turno cabe no horário de funcionamento: um só turno, mais curto
      let trab = D - 60, int = 60;
      if (trab <= 360) {
        trab = D - 15; int = 15;
        if (trab <= 240) { trab = D; int = 0; } else if (trab > 360) { trab = 360; }
      }
      return { unico: true, U: { ini: abre, fim: abre + trab + int, trab, int } };
    }
    return {
      unico: false,
      A: { ini: abre, fim: abre + h + intH, trab: h, int: intH },
      B: { ini: fecha - h - intH, fim: fecha, trab: h, int: intH },
    };
  });
}

function atribuirTurnos(c, folga) {
  const E = c.funcionarios.length;
  const N = c.semanas * 7;
  const modelos = modelosDeTurno(c);
  const tipo = Array.from({ length: E }, () => new Array(N).fill(null));
  const carga = { A: new Array(N).fill(0), B: new Array(N).fill(0) };

  // blocos = sequências de dias trabalhados entre folgas (o turno não muda
  // dentro do bloco, o que garante as 11h de descanso entre jornadas)
  const blocos = [];
  for (let e = 0; e < E; e++) {
    const primeiraFolga = folga[e].indexOf(true);
    if (primeiraFolga < 0) { blocos.push({ e, dias: [...Array(N).keys()] }); continue; }
    let atual = null;
    for (let i = 1; i <= N; i++) {
      const t = (primeiraFolga + i) % N;
      if (folga[e][t]) { if (atual) blocos.push(atual); atual = null; }
      else (atual ||= { e, dias: [] }).dias.push(t);
    }
    if (atual) blocos.push(atual);
  }
  blocos.sort((a, b) => a.dias[0] - b.dias[0] || a.e - b.e);
  for (const bl of blocos) {
    const duplos = bl.dias.filter((t) => modelos[t % 7] && !modelos[t % 7].unico);
    const somaA = duplos.reduce((s, t) => s + carga.A[t], 0);
    const somaB = duplos.reduce((s, t) => s + carga.B[t], 0);
    const escolha = somaA <= somaB ? 'A' : 'B';
    for (const t of bl.dias) {
      const m = modelos[t % 7];
      if (!m) continue;
      if (m.unico) tipo[bl.e][t] = 'U';
      else { tipo[bl.e][t] = escolha; carga[escolha][t]++; }
    }
  }

  return tipo.map((linha, e) =>
    linha.map((tp, t) => {
      if (folga[e][t] || !tp) return { folga: true };
      const m = modelos[t % 7][tp];
      const pausaIni = m.int ? m.ini + Math.round(m.trab / 2 / 30) * 30 : null;
      return { folga: false, turno: tp, ini: m.ini, fim: m.fim, trab: m.trab, int: m.int, pausaIni };
    }),
  );
}

// ---------- 3) auditoria (independente do gerador) ----------
export function auditar(c, escala) {
  const itens = [];
  const add = (regra, fundamento, situacao, detalhe) => itens.push({ regra, fundamento, situacao, detalhe });
  const E = c.funcionarios.length;
  const N = c.semanas * 7;
  const W = c.semanas;
  const limDia = c.regime.jornadaDiariaMax * 60;
  const nomes = c.funcionarios.map((f) => f.nome);

  // regime escolhido x regime exigido na data de início
  const exigido = regimeVigenteEm(c.inicio);
  if (exigido) {
    const pior = c.regime.horasSemanais > exigido.horasSemanais || c.regime.folgasMinSemana < exigido.folgasMinSemana;
    add(
      'Regime compatível com a data de início',
      `${exigido.fundamento}. Datas da EC 141/2026 a confirmar no texto oficial.`,
      pior ? 'nao_conforme' : 'conforme',
      pior
        ? `Em ${c.inicio.split('-').reverse().join('/')} o limite aplicável é ${exigido.horasSemanais}h semanais com ${exigido.folgasMinSemana} folga(s). O regime escolhido (${c.regime.horasSemanais}h, ${c.regime.folgasMinSemana} folga) já não atende, salvo regime diferente previsto em CCT/ACT nas hipóteses admitidas pela emenda.`
        : `Regime escolhido atende ao limite exigido na data (${exigido.horasSemanais}h semanais).`,
    );
  }

  // jornada diária e intervalo intrajornada
  const excDia = [], excComp = [], intErr = [], noturno = [];
  for (let e = 0; e < E; e++)
    for (let t = 0; t < N; t++) {
      const x = escala[e][t];
      if (x.folga) continue;
      const rot = `${nomes[e]} (sem. ${Math.floor(t / 7) + 1}, ${DIAS[t % 7]})`;
      if (x.trab > 600 || (x.trab > limDia && !c.permiteCompensacao)) excDia.push(`${rot}: ${fmtDur(x.trab)}`);
      else if (x.trab > limDia) excComp.push(`${rot}: ${fmtDur(x.trab)}`);
      if (x.int < intervaloMinimo(x.trab) || x.int > 120) intErr.push(`${rot}: intervalo de ${x.int} min para ${fmtDur(x.trab)}`);
      const notIni = Math.max(x.ini, 22 * 60), notFim = Math.min(x.fim, 29 * 60);
      if (notFim > notIni) noturno.push(`${rot}: ${fmtDur(notFim - notIni)} após 22h`);
    }
  if (excDia.length)
    add('Jornada diária', 'CF art. 7º, XIII; CLT arts. 58 e 59', 'nao_conforme',
      `Acima de ${c.regime.jornadaDiariaMax}h sem acordo de compensação, ou acima de 10h: ${resumo(excDia)}`);
  else if (excComp.length)
    add('Jornada diária', 'CF art. 7º, XIII; CLT art. 59, §§ 2º, 5º e 6º; Súmula 85 do TST', 'ressalva',
      `Acima de ${c.regime.jornadaDiariaMax}h em ${excComp.length} jornada(s), o que só é válido com acordo de compensação formalizado (conferir a CCT). Ex.: ${resumo(excComp)}`);
  else add('Jornada diária', 'CF art. 7º, XIII; CLT art. 58', 'conforme', `Nenhuma jornada acima de ${c.regime.jornadaDiariaMax}h.`);

  add('Intervalo intrajornada', 'CLT art. 71', intErr.length ? 'nao_conforme' : 'conforme',
    intErr.length ? resumo(intErr) : '1h a 2h para jornadas acima de 6h; 15 min entre 4h e 6h.');

  // jornada semanal e folgas por semana
  const memoria = [];
  const excSem = [], folgasErr = [];
  for (let e = 0; e < E; e++) {
    const semanas = [];
    for (let w = 0; w < W; w++) {
      let min = 0, folgas = 0;
      for (let d = 0; d < 7; d++) {
        const x = escala[e][w * 7 + d];
        if (x.folga) folgas++; else min += x.trab;
      }
      semanas.push({ minutos: min, folgas });
      if (min > c.regime.horasSemanais * 60) excSem.push(`${nomes[e]} sem. ${w + 1}: ${fmtDur(min)}`);
      if (folgas < c.regime.folgasMinSemana) folgasErr.push(`${nomes[e]} sem. ${w + 1}: ${folgas} folga(s)`);
    }
    memoria.push({ nome: nomes[e], semanas });
  }
  add('Jornada semanal', `${c.regime.fundamento}`, excSem.length ? 'nao_conforme' : 'conforme',
    excSem.length ? resumo(excSem) : `Todas as semanas dentro de ${c.regime.horasSemanais}h.`);
  add('Folgas por semana', c.regime.folgasMinSemana >= 2 ? 'CF art. 7º, na redação da EC 141/2026' : 'CF art. 7º, XV; CLT art. 67; Lei 605/1949',
    folgasErr.length ? 'nao_conforme' : 'conforme',
    folgasErr.length ? resumo(folgasErr) : `Mínimo de ${c.regime.folgasMinSemana} folga(s) em toda semana.`);

  // descanso entre jornadas e dias seguidos (ciclo repetido)
  const interErr = [], seguidosErr = [];
  for (let e = 0; e < E; e++) {
    let anterior = null, seq = 0, maxSeq = 0;
    const vistos = new Set();
    for (let t = 0; t < 2 * N; t++) {
      const x = escala[e][t % N];
      if (x.folga) { seq = 0; continue; }
      seq++; maxSeq = Math.max(maxSeq, Math.min(seq, N));
      if (anterior && !vistos.has(t % N)) {
        vistos.add(t % N);
        const descanso = x.ini + (t - anterior.t) * 1440 - anterior.fim;
        if (descanso < 660) interErr.push(`${nomes[e]} antes de sem. ${Math.floor((t % N) / 7) + 1} ${DIAS[t % 7]}: ${fmtDur(descanso)}`);
      }
      anterior = { t, fim: x.fim };
    }
    if (maxSeq > 6) seguidosErr.push(`${nomes[e]}: ${maxSeq} dias seguidos`);
  }
  add('Descanso entre jornadas (11h)', 'CLT art. 66', interErr.length ? 'nao_conforme' : 'conforme',
    interErr.length ? resumo(interErr) : 'Pelo menos 11h entre o fim de uma jornada e o início da seguinte.');
  add('Descanso semanal até o 7º dia', 'CF art. 7º, XV; CLT art. 67; OJ 410 da SDI-1 do TST', seguidosErr.length ? 'nao_conforme' : 'conforme',
    seguidosErr.length ? resumo(seguidosErr) : 'Ninguém trabalha mais de 6 dias seguidos (inclusive na virada do ciclo).');

  // domingos
  const domAberto = c.funcionamento[DOMINGO].aberto;
  if (c.domingoACadaSemanas) {
    const k = c.domingoACadaSemanas;
    const err = domAberto ? janelasSemDomingo(escala, k, W, nomes, () => true) : [];
    add(`Folga no domingo a cada ${k} semanas`, 'Lei 10.101/2000, art. 6º, parágrafo único (comércio)', err.length ? 'nao_conforme' : 'conforme',
      err.length ? resumo(err) : domAberto ? `Todos folgam pelo menos 1 domingo a cada ${k} semanas.` : 'Estabelecimento fechado aos domingos.');
  }
  if (c.aplicarArt386) {
    const err = domAberto ? janelasSemDomingo(escala, 2, W, nomes, (e) => c.funcionarios[e].sexo === 'F') : [];
    add('Folga dominical quinzenal (mulheres)', 'CLT art. 386 (aplicação ao comércio é tema com divergência jurisprudencial)',
      err.length ? 'nao_conforme' : 'ressalva',
      err.length ? resumo(err) : 'Atendida. Há divergência sobre a aplicação do art. 386; a escala já segue a leitura mais protetiva.');
  }
  if (c.regime.folgasMinSemana >= 2 && domAberto)
    add('Folga preferencialmente no domingo', 'CF art. 7º, na redação da EC 141/2026', 'ressalva',
      'A emenda prevê uma das folgas preferencialmente aos domingos. Conferir a redação oficial e a CCT.');

  if (noturno.length)
    add('Trabalho noturno', 'CLT art. 73 (hora reduzida de 52min30s e adicional de 20%)', 'ressalva',
      `Há trabalho após 22h: considerar hora reduzida e adicional. Ex.: ${resumo(noturno)}`);

  if (c.atividade === 'comercio')
    add('Trabalho em feriados', 'Lei 10.101/2000, art. 6º-A', 'ressalva',
      'No comércio, trabalhar em feriados exige autorização em convenção coletiva e respeito à lei municipal. A escala não trata feriados.');

  add('Instrumento coletivo (CCT/ACT)', 'CF art. 7º, XXVI; CLT arts. 611-A e 611-B', c.cctAnalisada ? 'conforme' : 'ressalva',
    c.cctAnalisada ? 'Usuário informou que a CCT/ACT aplicável foi conferida.' : 'A CCT/ACT da categoria ainda não foi conferida. Ela pode trazer regras mais restritivas (domingos, compensação, escalas permitidas).');

  // cobertura operacional (não é regra jurídica)
  const cobertura = [];
  const faltas = [];
  for (let t = 0; t < N; t++) {
    const d = t % 7;
    if (!c.funcionamento[d].aberto) { cobertura.push(null); continue; }
    let n = 0, A = 0, B = 0, U = 0;
    for (let e = 0; e < E; e++) {
      const x = escala[e][t];
      if (x.folga) continue;
      n++; if (x.turno === 'A') A++; else if (x.turno === 'B') B++; else U++;
    }
    cobertura.push({ n, A, B, U, minimo: c.minimoPorDia[d] });
    if (n < c.minimoPorDia[d]) faltas.push(`sem. ${Math.floor(t / 7) + 1} ${DIAS[d]}: ${n} de ${c.minimoPorDia[d]}`);
    else if (!U && n >= 2 && (A === 0 || B === 0)) faltas.push(`sem. ${Math.floor(t / 7) + 1} ${DIAS[d]}: sem cobertura na ${A === 0 ? 'abertura' : 'fechamento'}`);
  }
  if (faltas.length) add('Cobertura mínima', 'Necessidade operacional informada', 'operacional', resumo(faltas));

  const situacoes = itens.map((i) => i.situacao);
  const status = situacoes.includes('nao_conforme') ? 'NÃO CONFORME'
    : situacoes.includes('ressalva') ? 'CONFORME COM RESSALVAS' : 'CONFORME';
  return { status, itens, memoria, cobertura };
}

function janelasSemDomingo(escala, k, W, nomes, filtro) {
  const err = [];
  escala.forEach((linha, e) => {
    if (!filtro(e)) return;
    for (let w = 0; w < W; w++) {
      let ok = false;
      for (let j = 0; j < k && !ok; j++) ok = linha[((w + j) % W) * 7 + DOMINGO].folga;
      if (!ok) { err.push(`${nomes[e]}: semanas ${w + 1} a ${((w + k - 1) % W) + 1} sem domingo de folga`); return; }
    }
  });
  return err;
}

function resumo(lista, max = 4) {
  return lista.slice(0, max).join('; ') + (lista.length > max ? `; e mais ${lista.length - max}` : '');
}

// ---------- dimensionamento ----------
export function quadroMinimo(c) {
  const abertos = c.funcionamento.filter((f) => f.aberto).length;
  const diasPorPessoa = Math.min(c.regime.diasTrabalhoSemana, abertos);
  const pessoasDia = c.minimoPorDia.reduce((s, n, d) => s + (c.funcionamento[d].aberto ? n : 0), 0);
  return diasPorPessoa ? Math.ceil(pessoasDia / diasPorPessoa) : 0;
}

// ---------- ponto de entrada ----------
export function gerarEscala(cfgBruta) {
  const c = normalizarConfig(cfgBruta);
  const { folga } = gerarFolgas(c);
  const escala = atribuirTurnos(c, folga);
  const auditoria = auditar(c, escala);
  const h = Math.round((c.regime.horasSemanais * 60) / c.regime.diasTrabalhoSemana);
  return {
    config: c,
    escala,
    auditoria,
    premissas: {
      jornadaDiariaPadrao: h,
      intervaloPadrao: intervaloMinimo(h),
      quadroMinimo: quadroMinimo(c),
      equipe: c.funcionarios.length,
    },
  };
}

// Compara o mesmo cenário nos três regimes.
export function compararRegimes(cfgBruta) {
  return Object.values(REGIMES).map((r) => {
    const res = gerarEscala({ ...cfgBruta, regimeId: r.id, regime: undefined });
    const nao = res.auditoria.itens.filter((i) => i.situacao === 'nao_conforme').length;
    const faltas = res.auditoria.cobertura.filter((x) => x && x.n < x.minimo).length;
    return {
      regime: r,
      status: res.auditoria.status,
      jornadaDiaria: res.premissas.jornadaDiariaPadrao,
      quadroMinimo: res.premissas.quadroMinimo,
      equipe: res.premissas.equipe,
      naoConformidades: nao,
      diasSemCobertura: faltas,
    };
  });
}

export function paraCSV(res) {
  const { config: c, escala } = res;
  const cab = ['Funcionário'];
  for (let w = 0; w < c.semanas; w++) for (const d of DIAS) cab.push(`S${w + 1} ${d}`);
  const linhas = [cab];
  escala.forEach((linha, e) => {
    linhas.push([c.funcionarios[e].nome, ...linha.map((x) => (x.folga ? 'FOLGA' : `${fmtHora(x.ini)}-${fmtHora(x.fim)}`))]);
  });
  return linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
}
