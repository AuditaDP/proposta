import { DIAS, REGIMES, gerarEscala, compararRegimes, paraCSV, fmtHora, fmtDur } from './motor.js';
import { EXEMPLO } from './exemplo.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const classeStatus = (s) => (s === 'CONFORME' ? 'CONFORME' : s === 'NÃO CONFORME' ? 'NAO' : 'RESSALVAS');
const ROTULO = { conforme: 'Conforme', ressalva: 'Ressalva', nao_conforme: 'Não conforme', operacional: 'Operacional' };
let ultimo = null;
let estadoCct = null; // regras da convenção coletiva em revisão ou aplicadas

// ---------- formulário ----------
$('regime').innerHTML = Object.values(REGIMES).map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('');
$('func').innerHTML = DIAS.map((d, i) => `
  <tr>
    <td>${d}</td>
    <td><input type="checkbox" id="ab${i}" aria-label="${d}: abre"></td>
    <td><input type="time" id="hi${i}" aria-label="${d}: abre às"></td>
    <td><input type="time" id="hf${i}" aria-label="${d}: fecha às"></td>
    <td><input type="number" id="mn${i}" min="0" max="50" aria-label="${d}: mínimo de pessoas"></td>
  </tr>`).join('');

function preencher(cfg) {
  $('empresa').value = cfg.empresa;
  $('atividade').value = cfg.atividade;
  $('inicio').value = cfg.inicio;
  $('regime').value = cfg.regimeId;
  aplicarRegime();
  $('semanas').value = cfg.semanas;
  cfg.funcionamento.forEach((f, i) => {
    $(`ab${i}`).checked = f.aberto;
    $(`hi${i}`).value = f.abre;
    $(`hf${i}`).value = f.fecha;
    $(`mn${i}`).value = cfg.minimoPorDia[i];
  });
  $('equipe').value = cfg.funcionarios.map((f) => `${f.nome}; ${f.sexo || ''}`).join('\n');
  $('cct').checked = cfg.cctAnalisada;
  $('comp').checked = cfg.permiteCompensacao;
  $('art386').checked = cfg.aplicarArt386;
}

function aplicarRegime() {
  const r = REGIMES[$('regime').value];
  $('horas').value = r.horasSemanais;
  $('dias').value = r.diasTrabalhoSemana;
}

function lerFormulario() {
  const r = REGIMES[$('regime').value];
  const dias = Number($('dias').value) || r.diasTrabalhoSemana;
  return {
    empresa: $('empresa').value.trim(),
    atividade: $('atividade').value,
    inicio: $('inicio').value || null,
    regimeId: r.id,
    regime: { horasSemanais: Number($('horas').value) || r.horasSemanais, diasTrabalhoSemana: dias, folgasMinSemana: r.folgasMinSemana },
    semanas: Number($('semanas').value) || 4,
    funcionamento: DIAS.map((_, i) => ({ aberto: $(`ab${i}`).checked, abre: $(`hi${i}`).value || '08:00', fecha: $(`hf${i}`).value || '18:00' })),
    minimoPorDia: DIAS.map((_, i) => Number($(`mn${i}`).value) || 0),
    funcionarios: $('equipe').value.split('\n').map((l) => {
      const [nome, sexo] = l.split(';').map((s) => (s || '').trim());
      return { nome, sexo: (sexo || '').toUpperCase().startsWith('F') ? 'F' : 'M' };
    }).filter((f) => f.nome),
    cctAnalisada: $('cct').checked,
    cct: estadoCct && estadoCct.aplicada ? estadoCct : null,
    permiteCompensacao: $('comp').checked,
    aplicarArt386: $('art386').checked,
  };
}

// ---------- renderização ----------
function renderResumo(res) {
  const a = res.auditoria;
  const cont = (s) => a.itens.filter((i) => i.situacao === s).length;
  const p = res.premissas;
  const c = res.config;
  const falta = p.quadroMinimo > p.equipe;
  $('resumo').innerHTML = `
    <div class="status">
      <div>
        <h2>${esc(c.empresa || 'Escala')}</h2>
        <p class="nota">${esc(c.regime.nome)}${c.inicio ? ` · início em ${c.inicio.split('-').reverse().join('/')}` : ''}</p>
      </div>
      <span class="selo ${classeStatus(a.status)}">${a.status}</span>
    </div>
    <dl class="numeros">
      <div><dt>Jornada diária</dt><dd>${fmtDur(p.jornadaDiariaPadrao)}</dd></div>
      <div><dt>Intervalo</dt><dd>${p.intervaloPadrao} min</dd></div>
      <div><dt>Equipe</dt><dd>${p.equipe}</dd></div>
      <div><dt>Quadro mínimo</dt><dd>${p.quadroMinimo}</dd></div>
      <div><dt>Não conformes</dt><dd>${cont('nao_conforme')}</dd></div>
      <div><dt>Ressalvas</dt><dd>${cont('ressalva')}</dd></div>
    </dl>
    <ul class="premissas">
      <li>Jornada diária = ${c.regime.horasSemanais}h ÷ ${c.regime.diasTrabalhoSemana} dias; intervalo não entra no cálculo das horas (CLT art. 71, § 2º).</li>
      <li>A escala se repete a cada ${c.semanas} semana(s); as regras de descanso são conferidas também na virada do ciclo.</li>
      <li>Quadro mínimo = soma das pessoas exigidas na semana ÷ dias de trabalho por pessoa.${falta ? ` <b>Faltam ${p.quadroMinimo - p.equipe} pessoa(s) para cobrir o mínimo.</b>` : ''}</li>
    </ul>`;
}

function renderComparacao(cfg) {
  const linhas = compararRegimes(cfg);
  $('comparacao').innerHTML = `
    <thead><tr><th>Regra</th><th>Jornada/dia</th><th>Quadro mínimo</th><th>Resultado</th></tr></thead>
    <tbody>${linhas.map((l) => `
      <tr class="${l.regime.id === cfg.regimeId ? 'atual' : ''}">
        <td>${esc(l.regime.nome)}${l.regime.inicio ? `<br><span class="nota">a partir de ${l.regime.inicio.split('-').reverse().join('/')} (a confirmar)</span>` : ''}</td>
        <td>${fmtDur(l.jornadaDiaria)}</td>
        <td>${l.quadroMinimo} ${l.quadroMinimo > l.equipe ? `<span class="nota">(contratar ${l.quadroMinimo - l.equipe})</span>` : ''}</td>
        <td><span class="pill ${classeStatus(l.status)}">${l.status}</span>${l.naoConformidades ? `<br><span class="nota">${l.naoConformidades} regra(s) não atendida(s)</span>` : ''}</td>
      </tr>`).join('')}</tbody>`;
}

function renderEscala(res) {
  const { config: c, escala, auditoria } = res;
  let cab1 = '<th class="nome" rowspan="2">Funcionário</th>', cab2 = '';
  for (let w = 0; w < c.semanas; w++) {
    cab1 += `<th colspan="7" class="sep">Semana ${w + 1}</th>`;
    cab2 += DIAS.map((d, i) => `<th class="${i === 0 ? 'sep ' : ''}${i === 6 ? 'dom' : ''}">${d}</th>`).join('');
  }
  const corpo = escala.map((linha, e) => `<tr><th class="nome">${esc(c.funcionarios[e].nome)}</th>${linha.map((x, t) => {
    const sep = t % 7 === 0 ? ' sep' : '';
    if (x.folga) return `<td class="F${sep}">—</td>`;
    const pausa = x.pausaIni != null ? `<small>int. ${fmtHora(x.pausaIni)}</small>` : '';
    return `<td class="${x.turno}${sep}" title="${fmtDur(x.trab)} trabalhadas">${fmtHora(x.ini)}<br>${fmtHora(x.fim)}${pausa}</td>`;
  }).join('')}</tr>`).join('');
  const cob = auditoria.cobertura.map((k, t) => {
    const sep = t % 7 === 0 ? ' sep' : '';
    if (!k) return `<td class="F${sep}">fechado</td>`;
    return `<td class="${k.n < k.minimo ? 'falta' : ''}${sep}" title="mínimo ${k.minimo}">${k.n}/${k.minimo}</td>`;
  }).join('');
  $('escala').innerHTML = `<table class="quadro"><thead><tr>${cab1}</tr><tr>${cab2}</tr></thead>
    <tbody>${corpo}<tr class="cobertura"><th class="nome">Presentes/mín.</th>${cob}</tr></tbody></table>`;
}

function renderVerificacoes(res) {
  $('verificacoes').innerHTML = res.auditoria.itens.map((i) => `
    <li>
      <span class="situacao ${i.situacao}">${ROTULO[i.situacao]}</span>
      <div><h3>${esc(i.regra)}</h3><p class="fund">${esc(i.fundamento)}</p><p>${esc(i.detalhe)}</p></div>
    </li>`).join('');
}

function renderMemoria(res) {
  const { config: c, auditoria } = res;
  const lim = c.regime.horasSemanais * 60;
  const cab = Array.from({ length: c.semanas }, (_, w) => `<th>Sem. ${w + 1}</th>`).join('');
  const linhas = auditoria.memoria.map((m) => `<tr><td>${esc(m.nome)}</td>${m.semanas.map((s) =>
    `<td class="${s.minutos > lim ? 'acima' : ''}">${fmtDur(s.minutos)} · ${s.folgas}f</td>`).join('')}</tr>`).join('');
  $('memoria').innerHTML = `<table class="memoria"><thead><tr><th>Funcionário</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>
    <p class="nota">Horas efetivamente trabalhadas (sem intervalo) · número de folgas na semana. Limite semanal: ${fmtDur(lim)}.</p>`;
}

function gerar() {
  const cfg = lerFormulario();
  if (!cfg.funcionarios.length) {
    $('resumo').innerHTML = '<p>Inclua pelo menos uma pessoa na equipe para gerar a escala.</p>';
    return;
  }
  ultimo = gerarEscala(cfg);
  renderResumo(ultimo);
  renderComparacao(cfg);
  renderEscala(ultimo);
  renderVerificacoes(ultimo);
  renderMemoria(ultimo);
}

// ---------- IA ----------
function markdownSimples(md) {
  const linhas = esc(md).split('\n');
  let html = '', lista = false;
  for (const l of linhas) {
    let t = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    if (/^\s*[-*] /.test(l)) { if (!lista) { html += '<ul>'; lista = true; } html += `<li>${t.replace(/^\s*[-*] /, '')}</li>`; continue; }
    if (lista) { html += '</ul>'; lista = false; }
    if (/^#{1,3} /.test(l)) html += `<h3>${t.replace(/^#{1,3} /, '')}</h3>`;
    else if (/^#{4,6} /.test(l)) html += `<h4>${t.replace(/^#{4,6} /, '')}</h4>`;
    else if (t.trim()) html += `<p>${t}</p>`;
  }
  return html + (lista ? '</ul>' : '');
}

async function perguntar() {
  const pergunta = $('pergunta').value.trim();
  if (!pergunta || !ultimo) return;
  const botao = $('perguntar');
  botao.disabled = true;
  botao.textContent = 'Analisando…';
  $('resposta').innerHTML = '';
  try {
    const r = await fetch('api/assistente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta, contexto: { config: ultimo.config, premissas: ultimo.premissas, auditoria: ultimo.auditoria } }),
    });
    const dados = await r.json().catch(() => null);
    if (!r.ok || !dados) throw new Error(dados?.erro || 'servico');
    $('resposta').innerHTML = markdownSimples(dados.resposta) +
      (dados.fontes?.length ? `<h4>Fontes consultadas</h4><ul>${dados.fontes.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titulo || f.url)}</a></li>`).join('')}</ul>` : '');
  } catch (e) {
    $('resposta').innerHTML = `<p class="erro">${e.message && e.message !== 'servico' && e.message !== 'Failed to fetch'
      ? esc(e.message)
      : 'O especialista de IA só responde na versão publicada do sistema, com a chave da API configurada. Nesta prévia, o motor de escalas e a auditoria funcionam normalmente.'}</p>`;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Enviar pergunta';
  }
}


// ---------- convenção coletiva ----------
const CAMPOS_CCT = [
  ['jornadaSemanalHoras', 'Jornada semanal (horas)', 'num'],
  ['jornadaDiariaHoras', 'Jornada diária (horas)', 'num'],
  ['compensacaoDeJornada', 'Compensação de jornada', 'bool'],
  ['bancoDeHoras', 'Banco de horas', 'bool'],
  ['escala12x36', 'Escala 12x36', 'bool'],
  ['trabalhoAosDomingos', 'Trabalho aos domingos', 'bool'],
  ['folgaDominicalACadaSemanas', 'Folga no domingo a cada (semanas)', 'num'],
  ['trabalhoEmFeriados', 'Trabalho em feriados', 'bool'],
  ['condicoesFeriados', 'Condições para feriados', 'texto'],
  ['adicionalHoraExtraPercentual', 'Adicional de hora extra (%)', 'num'],
  ['adicionalDomingoFeriadoPercentual', 'Adicional de domingo/feriado (%)', 'num'],
  ['adicionalNoturnoPercentual', 'Adicional noturno (%)', 'num'],
  ['intervaloIntrajornadaMinutos', 'Intervalo para refeição (min)', 'num'],
];
const IDENT_CCT = [
  ['nome', 'Nome do instrumento', 'text'],
  ['categoria', 'Categoria', 'text'],
  ['baseTerritorial', 'Base territorial', 'text'],
  ['vigenciaInicio', 'Vigência: início', 'date'],
  ['vigenciaFim', 'Vigência: fim', 'date'],
];

function cctVazia() {
  return {
    identificacao: {},
    regras: Object.fromEntries(CAMPOS_CCT.map(([k]) => [k, { valor: null, clausula: null, trecho: null }])),
    outrasClausulasRelevantes: [],
    alertas: [],
    aplicada: false,
  };
}

function renderCct() {
  const painel = $('painelCct');
  if (!estadoCct) { painel.hidden = true; return; }
  painel.hidden = false;
  const id = estadoCct.identificacao || {};
  $('cctIdent').innerHTML = IDENT_CCT.map(([k, rot, tipo]) =>
    `<label>${rot}<input type="${tipo}" id="cctId_${k}" value="${esc(id[k] ?? '')}"></label>`).join('');
  $('cctRegras').innerHTML = CAMPOS_CCT.map(([k, rot, tipo]) => {
    const r = estadoCct.regras[k] || {};
    const v = r.valor;
    const campo = tipo === 'bool'
      ? `<select id="cctV_${k}" aria-label="${rot}"><option value="">Não trata</option><option value="sim"${v === true ? ' selected' : ''}>Sim</option><option value="nao"${v === false ? ' selected' : ''}>Não</option></select>`
      : `<input id="cctV_${k}" type="${tipo === 'num' ? 'number' : 'text'}" step="any" value="${esc(v ?? '')}" aria-label="${rot}">`;
    return `<tr class="${v != null ? 'preenchida' : ''}"><td>${rot}</td><td>${campo}</td>
      <td><input id="cctC_${k}" type="text" value="${esc(r.clausula ?? '')}" aria-label="Cláusula: ${rot}"></td>
      <td class="trecho">${r.trecho ? `“${esc(r.trecho)}”` : '—'}</td></tr>`;
  }).join('');
  const outras = estadoCct.outrasClausulasRelevantes || [];
  const alertas = estadoCct.alertas || [];
  $('cctExtras').innerHTML =
    (alertas.length ? `<h3>Pontos de atenção</h3><ul class="cct-lista">${alertas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '') +
    (outras.length ? `<h3>Outras cláusulas sobre jornada</h3><ul class="cct-lista">${outras.map((o) => `<li><b>Cláusula ${esc(o.clausula)}</b> (${esc(o.tema)}): ${esc(o.resumo)}</li>`).join('')}</ul>` : '');
  $('cctConferida').checked = estadoCct.aplicada;
  $('aplicarCct').disabled = !estadoCct.aplicada;
  mensagemCct(estadoCct.aplicada ? 'Regras aplicadas à escala.' : '', 'ok');
}

function lerTabelaCct() {
  for (const [k] of IDENT_CCT) estadoCct.identificacao[k] = $(`cctId_${k}`).value.trim() || null;
  for (const [k, , tipo] of CAMPOS_CCT) {
    const bruto = $(`cctV_${k}`).value.trim();
    const valor = bruto === '' ? null : tipo === 'bool' ? bruto === 'sim' : tipo === 'num' ? Number(bruto) : bruto;
    estadoCct.regras[k] = { ...estadoCct.regras[k], valor, clausula: $(`cctC_${k}`).value.trim() || null };
  }
  estadoCct.nome = estadoCct.identificacao.nome;
  estadoCct.vigenciaInicio = estadoCct.identificacao.vigenciaInicio;
  estadoCct.vigenciaFim = estadoCct.identificacao.vigenciaFim;
}

function statusCct(texto, tipo = '') { $('statusCct').textContent = texto; $('statusCct').className = `nota ${tipo}`; }
function mensagemCct(texto, tipo = '') { $('cctMsg').textContent = texto; $('cctMsg').className = `nota ${tipo}`; }

function lerArquivoBase64(arquivo) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => falha(new Error('Não foi possível abrir o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

async function lerCct() {
  const arquivo = $('arquivoCct').files[0];
  if (!arquivo) return statusCct('Escolha o arquivo da convenção primeiro.', 'erro');
  const ext = arquivo.name.toLowerCase().split('.').pop();
  if (ext === 'doc') return statusCct('Arquivos .doc (Word antigo) não são aceitos. Abra no Word e use "Salvar como" → .docx ou PDF.', 'erro');
  if (ext !== 'pdf' && ext !== 'docx') return statusCct('Envie a convenção em PDF ou Word (.docx).', 'erro');
  if (arquivo.size > 3 * 1024 * 1024) return statusCct('O arquivo passa de 3 MB. Envie a versão em Word (.docx) ou um PDF menor.', 'erro');
  const botao = $('lerCct');
  botao.disabled = true;
  botao.textContent = 'Lendo…';
  statusCct('Lendo a convenção. Isso pode levar até 2 minutos.');
  try {
    const base64 = await lerArquivoBase64(arquivo);
    const r = await fetch('api/cct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeArquivo: arquivo.name, base64 }),
    });
    const dados = await r.json().catch(() => null);
    if (!r.ok || !dados?.cct) throw new Error(dados?.erro || 'servico');
    estadoCct = { ...cctVazia(), ...dados.cct, aplicada: false };
    estadoCct.regras = { ...cctVazia().regras, ...dados.cct.regras };
    renderCct();
    statusCct('Convenção lida. Confira as regras no painel ao lado e clique em "Aplicar à escala".', 'ok');
    $('painelCct').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    statusCct(e.message && e.message !== 'servico' && e.message !== 'Failed to fetch'
      ? e.message
      : 'A leitura automática só funciona na versão publicada do sistema. Use "Preencher à mão" para digitar as regras.', 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Ler convenção';
  }
}

$('lerCct').addEventListener('click', lerCct);
$('manualCct').addEventListener('click', () => {
  if (!estadoCct) estadoCct = cctVazia();
  renderCct();
  $('painelCct').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('cctConferida').addEventListener('change', () => { $('aplicarCct').disabled = !$('cctConferida').checked; });
$('aplicarCct').addEventListener('click', () => {
  lerTabelaCct();
  estadoCct.aplicada = true;
  gerar();
  renderCct();
  mensagemCct('Regras aplicadas. A escala e a verificação de conformidade foram atualizadas.', 'ok');
});
$('removerCct').addEventListener('click', () => {
  estadoCct = null;
  $('arquivoCct').value = '';
  statusCct('');
  renderCct();
  gerar();
});
$('painelCct').addEventListener('input', (ev) => {
  if (ev.target.id === 'cctConferida' || !estadoCct?.aplicada) return;
  mensagemCct('Há alterações ainda não aplicadas. Clique em "Aplicar à escala".');
});

// ---------- eventos ----------
$('regime').addEventListener('change', aplicarRegime);
$('form').addEventListener('submit', (ev) => { ev.preventDefault(); gerar(); });
$('exemplo').addEventListener('click', () => { estadoCct = null; renderCct(); preencher(EXEMPLO); gerar(); });
$('perguntar').addEventListener('click', perguntar);
$('copiar').addEventListener('click', async () => {
  if (!ultimo) return;
  const csv = paraCSV(ultimo);
  const b = $('copiar');
  try { await navigator.clipboard.writeText(csv); b.textContent = 'Copiado'; }
  catch { b.textContent = 'Não foi possível copiar'; }
  setTimeout(() => (b.textContent = 'Copiar como CSV'), 2000);
});

preencher(EXEMPLO);
gerar();
