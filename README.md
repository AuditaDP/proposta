# Quadro de Horário (protótipo)

Ferramenta web para montar e auditar escalas de trabalho de acordo com a CLT, a EC 141/2026 (fim da escala 6x1) e a convenção coletiva da categoria. Funciona no navegador do computador e do celular, sem login no Claude.

## Como funciona

| Parte | Arquivo | O que faz |
|---|---|---|
| Motor de escalas | `public/motor.js` | Distribui folgas e turnos e confere cada regra (jornada, intervalos, 11h entre jornadas, descanso até o 7º dia, domingos no comércio, folgas da EC 141). Cálculo exato, sem IA. |
| Tela | `public/index.html`, `public/app.js`, `public/styles.css` | Formulário, quadro da escala, comparação entre as fases da transição, verificações e memória de cálculo. |
| Especialista de IA | `api/assistente.js` + `prompts/agente-escalas.md` | Recebe a escala e a auditoria e responde perguntas jurídicas, com busca restrita a sites oficiais. |
| Análise do prompt | `docs/analise-do-prompt.md` | O que foi aproveitado do prompt original e o que mudou. |

## Rodar no computador

```bash
npm install
```

```bash
npm test
```

```bash
npx serve public
```

Sem o servidor da Vercel, o motor e a auditoria funcionam, mas o especialista de IA não.

## Publicar (Vercel)

1. Importe este repositório na Vercel (framework: "Other").
2. Em Settings → Environment Variables, crie `ANTHROPIC_API_KEY` com a chave da API da Anthropic.
3. Publique. A tela fica em `https://<seu-projeto>.vercel.app` e a IA em `/api/assistente`.

Antes de abrir para clientes, coloque login (para controlar o uso e o custo da API) e um aviso de que a ferramenta apoia, mas não substitui, a análise do profissional responsável.

## Situação legislativa usada

A consulta foi feita em 17/11/2026, em fontes jornalísticas. A EC 141/2026 foi promulgada em 16/10/2026: 42h semanais e 2 folgas a partir de cerca de 16/12/2026, e 40h a partir de 16/12/2027. As datas ficam em `REGIMES`, em `public/motor.js`, e precisam ser conferidas no texto oficial.
