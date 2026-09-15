/**
 * CorvFin V2 — Suíte de Testes da Preservação de TemporalRules em migrateState() (tests/state_migration_temporal_rules.test.js)
 *
 * Lote A3.4.1 — Runtime Integration Fix:
 * Validação da hidratação do frontend via migrateState(serverData):
 * - 1. Preserva fixed_day legado/canônico
 * - 2. Preserva fixed_day com weekendAdjustment
 * - 3. Preserva nth_business_day ordinal 5
 * - 4. Preserva nth_business_day ordinal -1
 * - 5. salaryPayment tem prioridade sobre salaryDay
 * - 6. salaryDay é preservado quando salaryPayment não existe
 * - 7. Ausência de ambos não cria regra
 * - 8. benefitsConfig.creditRule continua preservado
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createSandbox() {
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    todayYM: () => ({ year: 2026, month: 9 }),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    loadLocalPreferences: () => ({}),
    API: {
      getUser: () => ({ nome: 'Lorenzo Cabral' })
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const constantsJs = fs.readFileSync(path.join(__dirname, '../public/js/core/constants.js'), 'utf8');
  const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/core/state.js'), 'utf8');

  vm.runInContext(constantsJs, sandbox);
  vm.runInContext(stateJs, sandbox);

  return sandbox;
}

function toPlain(obj) {
  if (obj === undefined) return undefined;
  return JSON.parse(JSON.stringify(obj));
}

describe('CORVFIN V2 — LOTE A3.4.1 — PRESERVE TEMPORAL RULES IN MIGRATESTATE()', () => {

  test('1. preserva fixed_day legado/canônico no profile.salaryPayment', () => {
    const { migrateState } = createSandbox();
    const serverData = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'fixed_day', day: 5 }
      }
    };

    const state = migrateState(serverData);

    assert.ok(state.profile, 'state.profile deve existir');
    assert.deepEqual(toPlain(state.profile.salaryPayment), { type: 'fixed_day', day: 5 });
    // Garante que é cópia e não muta referência original
    assert.notEqual(state.profile.salaryPayment, serverData.profile.salaryPayment);
    assert.strictEqual(state.profile.salaryDay, undefined, 'salaryDay não deve ser definido quando salaryPayment existe');
  });

  test('2. preserva fixed_day com weekendAdjustment no profile.salaryPayment', () => {
    const { migrateState } = createSandbox();
    const serverDataPrev = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'fixed_day', day: 5, weekendAdjustment: 'previous_business_day' }
      }
    };

    const statePrev = migrateState(serverDataPrev);
    assert.deepEqual(toPlain(statePrev.profile.salaryPayment), {
      type: 'fixed_day',
      day: 5,
      weekendAdjustment: 'previous_business_day'
    });

    const serverDataNext = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'fixed_day', day: 10, weekendAdjustment: 'next_business_day' }
      }
    };

    const stateNext = migrateState(serverDataNext);
    assert.deepEqual(toPlain(stateNext.profile.salaryPayment), {
      type: 'fixed_day',
      day: 10,
      weekendAdjustment: 'next_business_day'
    });
  });

  test('3. preserva nth_business_day ordinal 5 no profile.salaryPayment', () => {
    const { migrateState } = createSandbox();
    const serverData = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'nth_business_day', ordinal: 5 }
      }
    };

    const state = migrateState(serverData);

    assert.ok(state.profile.salaryPayment, 'salaryPayment deve estar presente');
    assert.deepEqual(toPlain(state.profile.salaryPayment), { type: 'nth_business_day', ordinal: 5 });
    assert.notEqual(state.profile.salaryPayment, serverData.profile.salaryPayment, 'deve ser cópia isolada');
    assert.strictEqual(state.profile.salaryDay, undefined, 'salaryDay não deve ser definido');
  });

  test('4. preserva nth_business_day ordinal -1 (último dia útil) no profile.salaryPayment', () => {
    const { migrateState } = createSandbox();
    const serverData = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'nth_business_day', ordinal: -1 }
      }
    };

    const state = migrateState(serverData);

    assert.ok(state.profile.salaryPayment, 'salaryPayment deve estar presente');
    assert.deepEqual(toPlain(state.profile.salaryPayment), { type: 'nth_business_day', ordinal: -1 });
  });

  test('5. salaryPayment tem prioridade sobre salaryDay quando ambos presentes', () => {
    const { migrateState } = createSandbox();
    const serverData = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'nth_business_day', ordinal: 5 },
        salaryDay: 10
      }
    };

    const state = migrateState(serverData);

    assert.deepEqual(toPlain(state.profile.salaryPayment), { type: 'nth_business_day', ordinal: 5 });
    assert.strictEqual(state.profile.salaryDay, undefined, 'salaryPayment tem precedência absoluta sobre salaryDay');
  });

  test('6. salaryDay é preservado quando salaryPayment não existe', () => {
    const { migrateState } = createSandbox();
    const serverDataLegacy = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryDay: 12
      }
    };

    const stateLegacy = migrateState(serverDataLegacy);

    assert.strictEqual(stateLegacy.profile.salaryPayment, undefined, 'salaryPayment não deve ser inventado');
    assert.strictEqual(stateLegacy.profile.salaryDay, 12, 'salaryDay legado deve ser preservado');

    // Teste com salaryPayment explicitamente nulo
    const serverDataNull = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: null,
        salaryDay: 15
      }
    };

    const stateNull = migrateState(serverDataNull);
    assert.strictEqual(stateNull.profile.salaryPayment, undefined);
    assert.strictEqual(stateNull.profile.salaryDay, 15);
  });

  test('7. ausência de ambos não cria regra', () => {
    const { migrateState } = createSandbox();
    const serverDataEmpty = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23
      }
    };

    const stateEmpty = migrateState(serverDataEmpty);

    assert.strictEqual(stateEmpty.profile.salaryPayment, undefined, 'salaryPayment não deve ser criado');
    assert.strictEqual(stateEmpty.profile.salaryDay, undefined, 'salaryDay não deve ser criado');

    // Caso sem profile nenhum no payload
    const stateNoProfile = migrateState({});
    assert.strictEqual(stateNoProfile.profile.salaryPayment, undefined);
    assert.strictEqual(stateNoProfile.profile.salaryDay, undefined);
  });

  test('8. benefitsConfig.creditRule continua preservado', () => {
    const { migrateState } = createSandbox();
    const serverData = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: { type: 'nth_business_day', ordinal: 5 }
      },
      benefitsConfig: {
        amount: 2553.63,
        creditRule: { type: 'nth_business_day', ordinal: -1 }
      }
    };

    const state = migrateState(serverData);

    assert.strictEqual(state.benefitsConfig.amount, 2553.63);
    assert.deepEqual(toPlain(state.benefitsConfig.creditRule), { type: 'nth_business_day', ordinal: -1 });
    assert.notEqual(state.benefitsConfig.creditRule, serverData.benefitsConfig.creditRule, 'deve ser cópia isolada');

    // Com fixed_day em benefitsConfig.creditRule
    const serverDataFixedBen = {
      benefitsConfig: {
        amount: 1200,
        creditRule: { type: 'fixed_day', day: 1, weekendAdjustment: 'next_business_day' }
      }
    };

    const stateFixedBen = migrateState(serverDataFixedBen);
    assert.deepEqual(toPlain(stateFixedBen.benefitsConfig.creditRule), {
      type: 'fixed_day',
      day: 1,
      weekendAdjustment: 'next_business_day'
    });
  });

  test('9. fluxo completo integrado: round-trip com dados reais do Perfil', () => {
    const { migrateState } = createSandbox();
    const realHmlUserDoc = {
      profile: {
        name: 'Lorenzo Cabral',
        baseSalary: 7899.23,
        salaryPayment: {
          type: 'nth_business_day',
          ordinal: 5
        }
      },
      benefitsConfig: {
        amount: 2553.63,
        creditRule: {
          type: 'nth_business_day',
          ordinal: -1
        }
      }
    };

    const state = migrateState(realHmlUserDoc);

    // Ambas as TemporalRules sobrevivem à hidratação
    assert.deepEqual(toPlain(state.profile.salaryPayment), { type: 'nth_business_day', ordinal: 5 });
    assert.deepEqual(toPlain(state.benefitsConfig.creditRule), { type: 'nth_business_day', ordinal: -1 });
    assert.strictEqual(state.profile.baseSalary, 7899.23);
    assert.strictEqual(state.benefitsConfig.amount, 2553.63);
  });

});
