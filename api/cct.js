// Lê uma CCT/ACT (PDF ou Word) e devolve as regras que afetam a escala,
// com a cláusula de origem. O usuário confere antes de aplicar.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import mammoth from 'mammoth';

export const TAMANHO_MAXIMO = 3 * 1024 * 1024; // limite de envio da Vercel é 4,5 MB (base64 aumenta ~33%)

const regra = (tipo, descricao) =>
  z.object({
    valor: tipo.nullable().describe(descricao),
    clausula: z.string().nullable().describe('Número da cláusula de onde a regra foi tirada, ex.: "15ª" ou "Cláusula 15". Null se a CCT não trata do tema.'),
    trecho: z.string().nullable().describe('Trecho curto (até 300 caracteres) copiado da cláusula que sustenta o valor.'),
  });

export const EsquemaCCT = z.object({
  identificacao: z.object({
    nome: z.string().nullable().describe('Nome curto do instrumento, ex.: "CCT Comerciários de Fortaleza 2026/2027".'),
    tipo: z.enum(['CCT', 'ACT', 'outro']).nullable(),
    sindicatoLaboral: z.string().nullable(),
    sindicatoPatronal: z.string().nullable(),
    categoria: z.string().nullable(),
    baseTerritorial: z.string().nullable(),
    vigenciaInicio: z.string().nullable().describe('Data no formato AAAA-MM-DD.'),
    vigenciaFim: z.string().nullable().describe('Data no formato AAAA-MM-DD.'),
    registroMediador: z.string().nullable().describe('Número de registro no Sistema Mediador do MTE, se constar.'),
  }),
  regras: z.object({
    jornadaSemanalHoras: regra(z.number(), 'Jornada semanal normal em horas, se a CCT fixar.'),
    jornadaDiariaHoras: regra(z.number(), 'Jornada diária normal em horas, se a CCT fixar.'),
    compensacaoDeJornada: regra(z.boolean(), 'true se a CCT autoriza compensação de jornada (ex.: semana espanhola, compensação do sábado); false se proíbe.'),
    bancoDeHoras: regra(z.boolean(), 'true se autoriza banco de horas; false se proíbe.'),
    escala12x36: regra(z.boolean(), 'true se autoriza escala 12x36; false se proíbe.'),
    trabalhoAosDomingos: regra(z.boolean(), 'true se autoriza trabalho aos domingos; false se proíbe.'),
    folgaDominicalACadaSemanas: regra(z.number(), 'De quantas em quantas semanas a folga deve coincidir com o domingo. Ex.: "um domingo a cada três semanas" = 3.'),
    trabalhoEmFeriados: regra(z.boolean(), 'true se autoriza trabalho em feriados; false se proíbe.'),
    condicoesFeriados: regra(z.string(), 'Condições para trabalhar em feriados (folga compensatória, adicional, limites), em uma frase.'),
    adicionalHoraExtraPercentual: regra(z.number(), 'Percentual do adicional de horas extras em dias normais.'),
    adicionalDomingoFeriadoPercentual: regra(z.number(), 'Percentual pago pelo trabalho em domingos ou feriados.'),
    adicionalNoturnoPercentual: regra(z.number(), 'Percentual do adicional noturno.'),
    intervaloIntrajornadaMinutos: regra(z.number(), 'Intervalo para refeição em minutos, se a CCT fixar ou reduzir.'),
  }),
  outrasClausulasRelevantes: z
    .array(z.object({ clausula: z.string(), tema: z.string(), resumo: z.string() }))
    .describe('Outras cláusulas que interferem em jornada ou escala e não cabem nos campos acima.'),
  alertas: z.array(z.string()).describe('Pontos de atenção: vigência, cláusulas ambíguas, regras que dependem de acordo individual ou de autorização do sindicato, conflito com a lei.'),
});

const INSTRUCOES = `Você é especialista em Direito Coletivo do Trabalho no Brasil. Leia a convenção ou acordo coletivo enviado e extraia somente as regras que afetam jornada e escalas de trabalho.

Regras:
- Use apenas o que está escrito no documento. Não complete com a CLT nem com outras CCTs.
- Quando o documento não tratar de um tema, deixe valor, cláusula e trecho como null.
- Indique sempre o número da cláusula e copie um trecho curto que comprove o valor.
- Se a cláusula for ambígua ou condicionada (por exemplo, depende de acordo com o sindicato), preencha o valor com a leitura mais protetiva ao trabalhador e explique em "alertas".
- Datas no formato AAAA-MM-DD.
- Escreva em português do Brasil.`;

let client = null;

export async function extrairTexto(tipo, buffer) {
  if (tipo === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const { nomeArquivo = 'cct', base64 } = req.body || {};
  const ext = String(nomeArquivo).toLowerCase().split('.').pop();
  if (!base64 || typeof base64 !== 'string') return res.status(400).json({ erro: 'Nenhum arquivo foi enviado.' });
  if (ext === 'doc')
    return res.status(400).json({ erro: 'Arquivos .doc (Word antigo) não são aceitos. Abra no Word e use "Salvar como" → .docx ou PDF.' });
  if (ext !== 'pdf' && ext !== 'docx') return res.status(400).json({ erro: 'Envie a CCT em PDF ou Word (.docx).' });

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > TAMANHO_MAXIMO) return res.status(413).json({ erro: 'O arquivo passa de 3 MB. Envie a versão em Word (.docx) ou um PDF menor.' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ erro: 'A leitura automática da CCT ainda não foi ativada: falta configurar a chave da API da Anthropic no servidor. Enquanto isso, preencha as regras à mão na tabela.' });
  client ||= new Anthropic();

  let documento;
  if (ext === 'pdf') {
    documento = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: nomeArquivo };
  } else {
    let texto;
    try { texto = await extrairTexto('docx', buffer); } catch { texto = ''; }
    if (!texto || texto.trim().length < 200)
      return res.status(422).json({ erro: 'Não consegui ler o texto desse arquivo Word. Tente salvar em PDF e enviar de novo.' });
    documento = { type: 'document', source: { type: 'text', media_type: 'text/plain', data: texto }, title: nomeArquivo };
  }

  try {
    const resposta = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'high', format: betaZodOutputFormat(EsquemaCCT) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      messages: [{
        role: 'user',
        content: [documento, { type: 'text', text: 'Extraia as regras de jornada e escala deste instrumento coletivo.' }],
      }],
    });
    if (resposta.stop_reason === 'refusal' || !resposta.parsed_output)
      return res.status(422).json({ erro: 'Não foi possível ler as regras deste documento. Confira se é mesmo uma CCT/ACT e tente de novo.' });
    return res.status(200).json({ cct: resposta.parsed_output });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError)
      return res.status(429).json({ erro: 'Muitas consultas ao mesmo tempo. Aguarde um minuto e tente de novo.' });
    if (err instanceof Anthropic.BadRequestError)
      return res.status(400).json({ erro: 'O serviço de IA não aceitou este arquivo. Se for um PDF escaneado muito grande ou protegido por senha, tente a versão em Word.' });
    if (err instanceof Anthropic.APIError)
      return res.status(502).json({ erro: `O serviço de IA respondeu com erro (${err.status}). Tente de novo.` });
    console.error(err);
    return res.status(500).json({ erro: 'Erro inesperado ao ler a CCT.' });
  }
}
