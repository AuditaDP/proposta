# Análise do prompt do agente de escalas

Consulta feita em 17/11/2026.

## Veredito

O prompt serve como base: cerca de 80% dele foi aproveitado. O conteúdo jurídico, os princípios e a forma de classificar a conformidade são bons e estão bem escritos.

O que precisou mudar não é falha de conteúdo. Muda o contexto de uso: o prompt foi escrito para uma conversa livre, e a ferramenta precisa dividir o trabalho entre código (contas e regras objetivas) e IA (interpretação e explicação).

## Seção por seção

| Seção do prompt original | O que fazer | Motivo |
|---|---|---|
| Identidade e missão | Aproveitar inteira | Clara e bem delimitada. |
| 1. Especialização jurídica | Aproveitar, com acréscimos | Faltavam a Lei 13.103/2015 (motoristas), o art. 386 da CLT, súmulas-chave (85, 146, 437, OJ 410) e as regras por atividade (escola, construção, transporte). |
| 2. Escala 6x1 e mudanças | Aproveitar e **atualizar** | A PEC virou a **EC 141/2026** (promulgada em 16/10/2026). O prompt ainda trata o tema como proposta em tramitação. Incluí um bloco de "situação de referência" que a equipe atualiza. |
| 3. Atualização permanente | Adaptar | Um modelo de IA não "acompanha" nada sozinho. Na ferramenta, isso virou uma busca na web restrita a sites oficiais (Planalto, DOU, Câmara, Senado, TST, STF, MTE). As regras obrigatórias foram mantidas. |
| 4. Acordos e convenções | Aproveitar inteira, com 2 acréscimos | (a) Sem CCT, adotar a hipótese mais protetiva e marcar como condicionada; (b) citar a cláusula exata. |
| 5. Construção de escalas | **Passar para o código** | Montar escala e calcular horas é onde a IA mais erra. O motor faz isso de forma exata e testada; a IA interpreta o resultado. |
| 6. Conformidade e riscos | Aproveitar a classificação; regras objetivas vão para o código | As 4 categorias (Conforme / Com ressalvas / Não conforme / Inconclusiva) viraram o resultado do motor. |
| 7. Consultoria e cenários | Aproveitar inteira | Ganhou apoio do motor: a tela já compara as três fases da transição e calcula o quadro mínimo. |
| 8. Atendimento a DP/RH | Aproveitar, resumida | Conteúdo coberto pelas demais seções. |
| 9. Metodologia | Passar para a tela | Os dados que o prompt mandava perguntar (atividade, equipe, horários, mínimo por turno, CCT) viraram campos do formulário. |
| 10. Formato das respostas | Aproveitar inteira | Ganhou o item "parâmetros sugeridos para o motor". |
| 11. Princípios inegociáveis | Aproveitar inteira | É a parte mais valiosa do prompt. |
| 12. Capacidades avançadas | Fase 2 | Pareceres, checklists e leitura de espelho de ponto entram depois do MVP. |
| 13. Postura profissional | Aproveitar inteira | Ficou junto dos princípios. |
| 14. Primeira interação | Remover | A tela já se apresenta. Na ferramenta, a IA é chamada para uma pergunta específica. |

## O que o motor revelou sobre a lei

Ao transformar as regras em código, apareceram três pontos que valem uma conversa com os clientes:

1. **42h em 5x2 dá 8h24 por dia.** Passa do limite de 8h diárias (CF art. 7º, XIII). Na 1ª etapa da EC 141/2026, quem adotar 5x2 com 42h precisa de acordo de compensação válido, ou então trabalhar 40h já na 1ª etapa. É preciso confirmar se a emenda mudou o limite diário.
2. **6x1 com domingo a cada 3 semanas é apertado.** Com uma folga por semana, mover a folga para o domingo sem passar de 6 dias seguidos (OJ 410 do TST) só funciona com folgas extras em algumas semanas. O motor faz isso automaticamente.
3. **Feriados no comércio** dependem de CCT e de lei municipal (Lei 10.101/2000, art. 6º-A). O protótipo ainda não trata feriados; ele só alerta.

## Lacunas para a próxima versão

- Cadastro de CCTs: o usuário envia o PDF, a IA extrai as regras em formato estruturado e um humano aprova.
- Regras específicas por atividade: 12x36 (art. 59-A), professores, motoristas (Lei 13.103/2015), construção civil.
- Feriados nacionais, estaduais e municipais no calendário.
- Trabalho noturno com hora reduzida no cálculo (hoje só gera alerta).
- Login, cadastro de clientes do escritório e histórico de escalas.

## Fontes da situação legislativa

- [Congresso promulga emenda que prevê escala 5x2 e reduz jornada para 40 horas (Capital News)](https://www.capitalnews.com.br/politica-e-poder/executivo/congresso-promulga-emenda-que-preve-escala-5x2-e-reduz-jornada-para-40-horas/448374)
- [Fim da escala 6x1: próximos passos da tramitação no Senado (Agência Brasil)](https://agenciabrasil.ebc.com.br/politica/noticia/2026-10/fim-da-escala-6x1-confira-proximos-passos-da-tramitacao-no-senado)
- [PEC que acaba com escala 6x1 começa a tramitar no Plenário (Senado Notícias)](https://www12.senado.leg.br/noticias/materias/2026/10/06/pec-que-acaba-com-escala-6x1-comeca-a-tramitar-no-plenario)
- [EC 141 fixa escala 5x2 com duas folgas (Mix Vale)](https://www.mixvale.com.br/2026/11/14/emenda-constitucional-141-fixa-escala-5x2-com-duas-folgas-a-partir-de/)
- [Senado prepara PEC para deixar categorias fora das regras (Exame)](https://exame.com/brasil/fim-da-escala-6x1-senado-prepara-pec-para-deixar-categorias-fora-das-regras/)

Atenção: são fontes jornalísticas. As datas exatas (15 ou 16/12/2026) divergem entre elas. Confirme no texto oficial da EC 141/2026 no Planalto ou no DOU antes de usar com clientes.
