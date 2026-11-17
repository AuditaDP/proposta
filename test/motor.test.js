import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarEscala, auditar, normalizarConfig, regimeVigenteEm, compararRegimes } from '../public/motor.js';
import { EXEMPLO } from '../public/exemplo.js';

const situacao = (res, regra) => res.auditoria.itens.find((i) => i.regra.startsWith(regra))?.situacao;

test('5x2 de 40h no comércio: escala gerada cumpre as regras legais', () => {
  const res = gerarEscala({ ...EXEMPLO, regimeId: 'ec141e2', inicio: '2028-01-03' });
  for (const regra of ['Jornada diária', 'Jornada semanal', 'Folgas por semana', 'Descanso entre jornadas', 'Descanso semanal', 'Folga no domingo', 'Intervalo'])
    assert.equal(situacao(res, regra), 'conforme', regra);
  assert.equal(res.auditoria.status, 'CONFORME COM RESSALVAS'); // CCT não conferida
});

test('6x1 de 44h antes da transição: sem violações de descanso', () => {
  const res = gerarEscala({ ...EXEMPLO, regimeId: 'atual44', inicio: '2026-11-23' });
  assert.equal(situacao(res, 'Regime compatível'), 'conforme');
  assert.equal(situacao(res, 'Descanso semanal'), 'conforme');
  assert.equal(situacao(res, 'Folga no domingo'), 'conforme');
});

test('6x1 depois da 1ª etapa da EC 141/2026 é apontada como não conforme', () => {
  const res = gerarEscala({ ...EXEMPLO, regimeId: 'atual44', inicio: '2026-12-21' });
  assert.equal(situacao(res, 'Regime compatível'), 'nao_conforme');
  assert.equal(res.auditoria.status, 'NÃO CONFORME');
});

test('42h em 5 dias passa de 8h/dia: exige acordo de compensação', () => {
  const sem = gerarEscala({ ...EXEMPLO, regimeId: 'ec141e1', permiteCompensacao: false });
  assert.equal(situacao(sem, 'Jornada diária'), 'nao_conforme');
  const com = gerarEscala({ ...EXEMPLO, regimeId: 'ec141e1', permiteCompensacao: true });
  assert.equal(situacao(com, 'Jornada diária'), 'ressalva');
});

test('auditor detecta 7 dias seguidos e descanso entre jornadas menor que 11h', () => {
  const c = normalizarConfig({ ...EXEMPLO, semanas: 1, funcionarios: [{ nome: 'Teste' }], regimeId: 'atual44' });
  const dia = (ini, fim) => ({ folga: false, turno: 'A', ini, fim, trab: fim - ini - 60, int: 60 });
  // trabalha os 7 dias; termina 20h e volta 06h (10h de descanso)
  const escala = [[dia(360, 840), dia(720, 1200), dia(360, 840), dia(360, 840), dia(360, 840), dia(360, 840), dia(360, 840)]];
  const a = auditar(c, escala);
  assert.equal(a.itens.find((i) => i.regra.startsWith('Descanso semanal')).situacao, 'nao_conforme');
  assert.equal(a.itens.find((i) => i.regra.startsWith('Descanso entre')).situacao, 'nao_conforme');
});

test('regime exigido conforme a data', () => {
  assert.equal(regimeVigenteEm('2026-11-17').id, 'atual44');
  assert.equal(regimeVigenteEm('2026-12-16').id, 'ec141e1');
  assert.equal(regimeVigenteEm('2027-12-16').id, 'ec141e2');
});

test('comparação traz os três regimes', () => {
  const r = compararRegimes(EXEMPLO);
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.quadroMinimo > 0));
});
