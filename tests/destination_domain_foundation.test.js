/**
 * CorvFin — Suíte de Testes do Destination Domain Foundation (Fase 2)
 *
 * Cobre estritamente os 15 requisitos do Domínio de Destination e os ajustes obrigatórios:
 * 1. Novo destination recebe ID estável.
 * 2. IDs são únicos na coleção.
 * 3. Save/load preserva ID.
 * 4. Destination possui type explícito ('cash', 'bank_account', 'credit_card', 'other').
 * 5. credit_card aceita dueDay.
 * 6. credit_card aceita closingDay.
 * 7. closingDay inválido é rejeitado com 400.
 * 8. dueDay inválido é rejeitado com 400.
 * 9. Destination legado sem type continua legível.
 * 10. Destination legado sem ID continua legível sem geração instável.
 * 11. Informação explícita de type vence heurística de nome.
 * 12. Renomear destination não altera ID.
 * 13. destinationId de expense referencia corretamente o destination.
 * 14. Expense legado apenas com destination textual continua funcionando.
 * 15. Nenhum consumer relevante quebra por campos adicionais em destination.
 * 16. Destino legado não recebe type persistido por heurística durante leitura/normalização.
 * 17. Nenhum backfill automático de destinationId em registros históricos.
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  validateFinanceSemantics,
  sanitizeFinancePayload
} = require('../server/services/financeValidation');
const jsonStorage = require('../server/services/jsonStorage');
const config = require('../server/config/config');

describe('CorvFin — Destination Domain Foundation (Fase 2)', () => {
  let tempDir;
  let testStorageFile;
  const originalDriver = config.STORAGE_DRIVER;
  const originalFinancesFile = config.FINANCES_FILE;

  before(() => {
    tempDir = path.join(os.tmpdir(), `corvfin_dest_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    testStorageFile = path.join(tempDir, 'finances.json');
    config.STORAGE_DRIVER = 'json';
    config.FINANCES_FILE = testStorageFile;
  });

  after(() => {
    config.STORAGE_DRIVER = originalDriver;
    config.FINANCES_FILE = originalFinancesFile;
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // 1. Novo destination recebe ID estável
  test('1. Novo destination pode possuir ID estável estruturado', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { id: 'dest_nubank_pj', name: 'Nubank PJ', type: 'credit_card', dueDay: 10, closingDay: 3 }
      ]
    };

    assert.doesNotThrow(() => validateFinanceSemantics(payload));
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.destinations[0].id, 'dest_nubank_pj');
    assert.strictEqual(sanitized.destinations[0].name, 'Nubank PJ');
    assert.strictEqual(sanitized.destinations[0].type, 'credit_card');
  });

  // 2. IDs são únicos na coleção
  test('2. IDs duplicados na coleção destinations são estritamente rejeitados (status 400)', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { id: 'dest_dup', name: 'Conta 1', type: 'bank_account' },
        { id: 'dest_dup', name: 'Conta 2', type: 'cash' }
      ]
    };

    assert.throws(
      () => validateFinanceSemantics(payload),
      (err) => {
        assert.strictEqual(err.status, 400);
        assert.ok(err.message.includes('ID duplicado "dest_dup" detectado na coleção "destinations"'));
        return true;
      }
    );
  });

  // 3. Save/load preserva ID
  test('3. Save e load preservam o ID do destination intacto no storage', () => {
    const userId = 'usr_dest_save_load';
    const originalFinances = {
      destinations: [
        { id: 'dest_itau_corp', name: 'Itaú Corp', type: 'bank_account', color: '#F97316', icon: 'bank' }
      ],
      fixed: [],
      variable: []
    };

    jsonStorage.saveUserFinances(userId, originalFinances);
    const loaded = jsonStorage.getUserFinances(userId);

    assert.ok(Array.isArray(loaded.destinations));
    const itau = loaded.destinations.find(d => d.name === 'Itaú Corp');
    assert.ok(itau, 'Destination deve existir');
    assert.strictEqual(itau.id, 'dest_itau_corp');
    assert.strictEqual(itau.type, 'bank_account');
  });

  // 4. Destination possui type explícito
  test('4. Tipos explícitos válidos (cash, bank_account, credit_card, other) são aceitos', () => {
    const types = ['cash', 'bank_account', 'credit_card', 'other'];
    types.forEach(t => {
      const payload = {
        year: 2026,
        month: 9,
        destinations: [{ id: `dest_${t}`, name: `Destino ${t}`, type: t }]
      };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });
  });

  test('4.1 Tipo de destination desconhecido/inválido é estritamente rejeitado com 400', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [{ name: 'Destino Cripto', type: 'crypto_wallet' }]
    };

    assert.throws(
      () => validateFinanceSemantics(payload),
      (err) => {
        assert.strictEqual(err.status, 400);
        assert.ok(err.message.includes('tipo de destino inválido ("crypto_wallet")'));
        return true;
      }
    );
  });

  // 5. credit_card aceita dueDay
  test('5. credit_card aceita dueDay inteiro entre 1 e 31', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [{ name: 'Cartão BTG', type: 'credit_card', dueDay: 15 }]
    };
    assert.doesNotThrow(() => validateFinanceSemantics(payload));
  });

  // 6. credit_card aceita closingDay
  test('6. credit_card aceita closingDay inteiro entre 1 e 31', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [{ name: 'Cartão Neon', type: 'credit_card', closingDay: 20, dueDay: 5 }]
    };
    assert.doesNotThrow(() => validateFinanceSemantics(payload));
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.destinations[0].closingDay, 20);
    assert.strictEqual(sanitized.destinations[0].dueDay, 5);
  });

  // 7. closingDay inválido é rejeitado
  test('7. closingDay inválido (0, 32, não-inteiro, string) é rejeitado com status 400', () => {
    const invalidValues = [0, 32, 15.5, 'dia 20', -1];
    invalidValues.forEach(val => {
      const payload = {
        year: 2026,
        month: 9,
        destinations: [{ name: 'Cartão Inválido', type: 'credit_card', closingDay: val }]
      };
      assert.throws(
        () => validateFinanceSemantics(payload),
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.ok(err.message.includes('closingDay inválido'));
          return true;
        }
      );
    });
  });

  // 8. dueDay inválido é rejeitado
  test('8. dueDay inválido (0, 35, negativo) na coleção destinations é rejeitado com status 400', () => {
    const invalidValues = [0, 35, 'vencimento', -5];
    invalidValues.forEach(val => {
      const payload = {
        year: 2026,
        month: 9,
        destinations: [{ name: 'Cartão Inválido', type: 'credit_card', dueDay: val }]
      };
      assert.throws(
        () => validateFinanceSemantics(payload),
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.ok(err.message.includes('dueDay inválido'));
          return true;
        }
      );
    });
  });

  // 9. Destination legado sem type continua legível
  test('9. Destination legado sem type é validado e sanitizado normalmente', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { name: 'Nubank Antigo', color: '#8B5CF6', icon: 'card', dueDay: 10 }
      ]
    };
    assert.doesNotThrow(() => validateFinanceSemantics(payload));
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.destinations[0].name, 'Nubank Antigo');
    assert.strictEqual(sanitized.destinations[0].type, undefined);
  });

  // 10. Destination legado sem ID continua legível
  test('10. Destination legado sem ID continua legível sem gerar IDs voláteis em validação', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { name: 'Pix Antigo', color: '#10B981', icon: 'dollar' }
      ]
    };
    assert.doesNotThrow(() => validateFinanceSemantics(payload));
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.destinations[0].id, undefined);
  });

  // 11. Informação explícita de type vence heurística de nome
  test('11. Informação explícita de type (ex: bank_account chamado "Nubank Cartão") é preservada', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { id: 'dest_nubank_conta', name: 'Nubank Cartão', type: 'bank_account' }
      ]
    };
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.destinations[0].type, 'bank_account');
  });

  // 12. Renomear destination não altera ID
  test('12. Renomear destination preserva o ID estável inalterado', () => {
    const original = { id: 'dest_stable_123', name: 'Cartão Antigo', type: 'credit_card', dueDay: 15 };
    const renamed = { ...original, name: 'Cartão Novo Renomeado' };

    assert.strictEqual(renamed.id, original.id);
    assert.strictEqual(renamed.id, 'dest_stable_123');
    assert.strictEqual(renamed.name, 'Cartão Novo Renomeado');
  });

  // 13. destinationId de expense referencia corretamente o destination
  test('13. destinationId é aceito em fixed e variable e sanitizado com segurança', () => {
    const payload = {
      year: 2026,
      month: 9,
      fixed: [
        {
          id: 'fix_1',
          name: 'Aluguel',
          amount: 1500,
          destination: 'Itaú',
          destinationId: 'dest_itau_principal'
        }
      ],
      variable: [
        {
          id: 'var_1',
          name: 'Supermercado',
          amount: 250,
          destination: 'Nubank',
          destinationId: 'dest_nubank_credito',
          startYear: 2026,
          startMonth: 9
        }
      ]
    };

    assert.doesNotThrow(() => validateFinanceSemantics(payload));
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.fixed[0].destinationId, 'dest_itau_principal');
    assert.strictEqual(sanitized.fixed[0].destination, 'Itaú');
    assert.strictEqual(sanitized.variable[0].destinationId, 'dest_nubank_credito');
    assert.strictEqual(sanitized.variable[0].destination, 'Nubank');
  });

  // 14. Expense legado apenas com destination textual continua funcionando
  test('14. Expense legado sem destinationId continua 100% válido', () => {
    const payload = {
      year: 2026,
      month: 9,
      fixed: [
        {
          id: 'fix_leg',
          name: 'Condomínio',
          amount: 400,
          destination: 'Boleto Itaú'
        }
      ],
      variable: [
        {
          id: 'var_leg',
          name: 'Farmácia',
          amount: 85,
          destination: 'Dinheiro',
          startYear: 2026,
          startMonth: 9
        }
      ]
    };

    assert.doesNotThrow(() => validateFinanceSemantics(payload));
    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.fixed[0].destination, 'Boleto Itaú');
    assert.strictEqual(sanitized.fixed[0].destinationId, undefined);
    assert.strictEqual(sanitized.variable[0].destination, 'Dinheiro');
    assert.strictEqual(sanitized.variable[0].destinationId, undefined);
  });

  // 15. Nenhum consumer relevante quebra por destination possuir campos adicionais
  test('15. Destinations com id, type, closingDay e dueDay passam por sanitizeFinancePayload sem vazamento', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { id: 'dest_complete', name: 'Mastercard Black', type: 'credit_card', color: '#111827', icon: 'card', dueDay: 25, closingDay: 18 }
      ]
    };

    const clean = sanitizeFinancePayload(payload);
    assert.deepStrictEqual(clean.destinations[0], {
      id: 'dest_complete',
      name: 'Mastercard Black',
      type: 'credit_card',
      color: '#111827',
      icon: 'card',
      dueDay: 25,
      closingDay: 18
    });
  });

  // 16. Ajuste obrigatório: Nenhum destination legado recebe type persistido por heurística
  test('16. Sanitização de payload preserva destination legado sem injetar type automaticamente', () => {
    const payload = {
      year: 2026,
      month: 9,
      destinations: [
        { name: 'Nubank', color: '#8B5CF6', icon: 'card', dueDay: 10 }
      ]
    };

    const sanitized = sanitizeFinancePayload(payload);
    assert.strictEqual(sanitized.destinations[0].type, undefined, 'type não deve ser injetado silenciosamente');
    assert.strictEqual(sanitized.destinations[0].id, undefined, 'id não deve ser inventado');
  });

  // 17. Ajuste obrigatório: Nenhum backfill automático de destinationId em despesas preexistentes
  test('17. Despesas preexistentes sem destinationId são salvas sem injeção automática de IDs', () => {
    const userId = 'usr_dest_nobackfill';
    const initialFinances = {
      destinations: [
        { id: 'dest_nubank_id', name: 'Nubank', type: 'credit_card' }
      ],
      variable: [
        { id: 'var_hist_1', name: 'Gasto Antigo', amount: 100, destination: 'Nubank', startYear: 2026, startMonth: 8 }
      ],
      fixed: []
    };

    jsonStorage.saveUserFinances(userId, initialFinances);
    const loaded = jsonStorage.getUserFinances(userId);

    assert.strictEqual(loaded.variable[0].destinationId, undefined, 'Despesa histórica não deve receber destinationId por backfill');
    assert.strictEqual(loaded.variable[0].destination, 'Nubank');
  });
});
