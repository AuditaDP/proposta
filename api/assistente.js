// Função serverless (Vercel) que conversa com o Claude.
// A chave fica só no servidor (variável ANTHROPIC_API_KEY); o navegador nunca a vê.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROMPT = readFileSync(path.join(process.cwd(), 'prompts', 'agente-escalas.md'), 'utf8');

// Fontes oficiais que a IA pode pesquisar (seção 3 do prompt).
const DOMINIOS_OFICIAIS = [
  'planalto.gov.br', 'in.gov.br', 'camara.leg.br', 'senado.leg.br', 'congressonacional.leg.br',
  'gov.br', 'tst.jus.br', 'stf.jus.br', 'mpt.mp.br', 'jus.br',
];

let client = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const { pergunta, contexto } = req.body || {};
  if (!pergunta || typeof pergunta !== 'string' || pergunta.length > 4000)
    return res.status(400).json({ erro: 'Escreva uma pergunta de até 4.000 caracteres.' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ erro: 'O especialista de IA ainda não foi ativado: falta configurar a chave da API da Anthropic no servidor.' });
  client ||= new Anthropic();

  const hoje = new Date().toISOString().slice(0, 10);
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: `Data de hoje: ${hoje}.\n\n<escala_e_auditoria>\n${JSON.stringify(contexto ?? {}, null, 1).slice(0, 60000)}\n</escala_e_auditoria>` },
      { type: 'text', text: pergunta },
    ],
  }];

  try {
    let resposta;
    // Pesquisas longas podem pausar (pause_turn); retomamos até 3 vezes.
    for (let i = 0; i < 3; i++) {
      resposta = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'high' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5, allowed_domains: DOMINIOS_OFICIAIS }],
        messages,
      });
      if (resposta.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: resposta.content });
    }

    if (resposta.stop_reason === 'refusal')
      return res.status(422).json({ erro: 'A IA não conseguiu responder a esta pergunta. Reformule e tente de novo.' });

    const texto = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const fontes = [];
    for (const b of resposta.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content))
        for (const r of b.content) if (r.url && !fontes.some((f) => f.url === r.url)) fontes.push({ url: r.url, titulo: r.title });
    }
    return res.status(200).json({ resposta: texto, fontes: fontes.slice(0, 10) });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError)
      return res.status(429).json({ erro: 'Muitas consultas ao mesmo tempo. Aguarde um minuto e tente de novo.' });
    if (err instanceof Anthropic.AuthenticationError)
      return res.status(500).json({ erro: 'A chave da API não está configurada no servidor.' });
    if (err instanceof Anthropic.APIError)
      return res.status(502).json({ erro: `O serviço de IA respondeu com erro (${err.status}). Tente de novo.` });
    console.error(err);
    return res.status(500).json({ erro: 'Erro inesperado ao consultar a IA.' });
  }
}
