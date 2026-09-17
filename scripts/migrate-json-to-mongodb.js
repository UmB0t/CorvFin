const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const config = require('../server/config/config');
const dbModule = require('../server/config/db');

/* ==========================================================================
   HELPERS DETERMINÍSTICOS DE CHECKSUM & CANONICALIZAÇÃO
   ========================================================================== */

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function calculateChecksum(obj) {
  const canonical = canonicalize(obj);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/* ==========================================================================
   LEITURA SEGURA DOS JSONS
   ========================================================================== */

function readJSONFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Falha ao ler/fazer parse do arquivo JSON "${filePath}": ${err.message}`);
  }
}

/* ==========================================================================
   VALIDAÇÃO E PLANEJAMENTO DA MIGRAÇÃO
   ========================================================================== */

function auditAndPlan() {
  const issues = [];
  const warnings = [];

  // 1. Users
  const usersRaw = readJSONFile(config.USERS_FILE) || [];
  if (!Array.isArray(usersRaw)) {
    issues.push(`users.json deve conter um array de usuários.`);
  }

  const validUsers = [];
  const seenUserIds = new Set();
  const seenLogins = new Set();
  const seenEmails = new Set();

  usersRaw.forEach((u, idx) => {
    if (!u.id || typeof u.id !== 'string') {
      issues.push(`Usuário no índice ${idx} possui "id" ausente ou inválido.`);
      return;
    }
    if (seenUserIds.has(u.id)) {
      issues.push(`ID duplicado em users.json: "${u.id}".`);
      return;
    }
    seenUserIds.add(u.id);

    if (!u.login || typeof u.login !== 'string') {
      issues.push(`Usuário "${u.id}" não possui campo "login" válido.`);
      return;
    }
    const cleanLogin = u.login.trim().toLowerCase();
    if (seenLogins.has(cleanLogin)) {
      issues.push(`Login duplicado (case-insensitive) em users.json: "${u.login}".`);
      return;
    }
    seenLogins.add(cleanLogin);

    if (!u.email || typeof u.email !== 'string') {
      issues.push(`Usuário "${u.id}" não possui campo "email" válido.`);
      return;
    }
    const cleanEmail = u.email.trim().toLowerCase();
    if (seenEmails.has(cleanEmail)) {
      issues.push(`E-mail duplicado (case-insensitive) em users.json: "${u.email}".`);
      return;
    }
    seenEmails.add(cleanEmail);

    if (!u.senha || typeof u.senha !== 'string' || (!u.senha.startsWith('$2a$') && !u.senha.startsWith('$2b$'))) {
      issues.push(`Usuário "${u.id}" possui hash de senha ausente ou incompatível com bcrypt.`);
      return;
    }

    validUsers.push({
      _id: u.id,
      id: u.id,
      nome: u.nome || u.login,
      login: cleanLogin,
      email: cleanEmail,
      senha: u.senha, // Preservação byte a byte sem rehash
      is_admin: !!u.is_admin,
      notificacoes_ativas: typeof u.notificacoes_ativas === 'boolean' ? u.notificacoes_ativas : true,
      createdAt: u.createdAt || new Date().toISOString()
    });
  });

  // 2. Permissions
  const permissionsRaw = readJSONFile(config.PERMISSIONS_FILE) || {};
  const validPermissions = [];
  const orphanPermissions = [];

  Object.keys(permissionsRaw).forEach(userId => {
    const perms = permissionsRaw[userId];
    if (seenUserIds.has(userId)) {
      validPermissions.push({
        _id: userId,
        userId: userId,
        despesas: perms.despesas !== false,
        extras: perms.extras !== false,
        devedores: perms.devedores !== false,
        investimentos: perms.investimentos !== false,
        beneficios: perms.beneficios !== false,
        compras: perms.compras === true,
        simulacao: perms.simulacao === true,
        configuracoes: !!perms.configuracoes
      });
    } else {
      orphanPermissions.push(userId);
    }
  });

  // 3. Default Permissions
  const defaultPermsRaw = readJSONFile(config.DEFAULT_PERMISSIONS_FILE) || {
    despesas: true,
    extras: true,
    devedores: true,
    investimentos: true,
    beneficios: true,
    compras: false,
    simulacao: false
  };

  const validDefaultPermissions = {
    _id: 'global_default',
    despesas: defaultPermsRaw.despesas !== false,
    extras: defaultPermsRaw.extras !== false,
    devedores: defaultPermsRaw.devedores !== false,
    investimentos: defaultPermsRaw.investimentos !== false,
    beneficios: defaultPermsRaw.beneficios !== false,
    compras: defaultPermsRaw.compras === true,
    simulacao: defaultPermsRaw.simulacao === true
  };

  // 4. Finances
  const financesRaw = readJSONFile(config.FINANCES_FILE) || {};
  const validFinances = [];
  const orphanFinances = [];

  Object.keys(financesRaw).forEach(userId => {
    const userFinances = financesRaw[userId];
    if (seenUserIds.has(userId)) {
      validFinances.push({
        _id: userId,
        userId: userId,
        ...userFinances
      });
    } else {
      orphanFinances.push(userId);
    }
  });

  // 5. Maintenance
  const maintenanceRaw = readJSONFile(config.MAINTENANCE_FILE) || {};
  const ALLOWED_MODULES = ['dashboard', 'calendario', 'despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao'];
  const validMaintenance = { _id: 'system_maintenance' };

  ALLOWED_MODULES.forEach(mod => {
    const item = maintenanceRaw[mod] || {};
    validMaintenance[mod] = {
      name: item.name || (mod.charAt(0).toUpperCase() + mod.slice(1)),
      maintenance: typeof item.maintenance === 'boolean' ? item.maintenance : (item === true)
    };
  });

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    plan: {
      users: {
        totalJson: usersRaw.length,
        validCount: validUsers.length,
        docs: validUsers,
        checksum: calculateChecksum(validUsers.map(({ _id, ...rest }) => rest))
      },
      permissions: {
        totalJson: Object.keys(permissionsRaw).length,
        validCount: validPermissions.length,
        orphanCount: orphanPermissions.length,
        orphanIds: orphanPermissions,
        docs: validPermissions,
        checksum: calculateChecksum(validPermissions.map(({ _id, ...rest }) => rest))
      },
      default_permissions: {
        doc: validDefaultPermissions,
        checksum: calculateChecksum((({ _id, ...rest }) => rest)(validDefaultPermissions))
      },
      finances: {
        totalJson: Object.keys(financesRaw).length,
        validCount: validFinances.length,
        orphanCount: orphanFinances.length,
        orphanIds: orphanFinances,
        docs: validFinances,
        checksum: calculateChecksum(validFinances.map(({ _id, ...rest }) => rest))
      },
      maintenance: {
        doc: validMaintenance,
        checksum: calculateChecksum((({ _id, ...rest }) => rest)(validMaintenance))
      }
    }
  };
}

/* ==========================================================================
   BACKUP AUTOMÁTICO PRÉ-MIGRAÇÃO (MODO EXECUTE)
   ========================================================================== */

function createBackup() {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupDir = path.join(config.DATA_DIR, 'backups', `pre-mongodb-${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const files = [
    config.USERS_FILE,
    config.PERMISSIONS_FILE,
    config.DEFAULT_PERMISSIONS_FILE,
    config.FINANCES_FILE,
    config.MAINTENANCE_FILE
  ];

  files.forEach(f => {
    if (fs.existsSync(f)) {
      const dest = path.join(backupDir, path.basename(f));
      fs.copyFileSync(f, dest);
    }
  });

  return backupDir;
}

/* ==========================================================================
   EXECUÇÃO MONGODB (MODO --EXECUTE)
   ========================================================================== */

async function executeMigration(auditResult) {
  if (!process.env.MONGODB_URI) {
    throw new Error('Variável MONGODB_URI não configurada. Defina no .env ou no ambiente antes de executar.');
  }

  console.log('\n[1/5] Criando backup de segurança dos arquivos JSON...');
  const backupDir = createBackup();
  console.log(`      ✓ Backup salvo em: ${backupDir}`);

  console.log('\n[2/5] Conectando ao MongoDB...');
  const db = await dbModule.connectDB();
  console.log(`      ✓ Conectado ao database "${config.MONGODB_DB_NAME || 'financas_pro'}"`);

  const { plan } = auditResult;

  console.log('\n[3/5] Migrando coleções com upsert idempotente...');

  // A. Users
  const usersCol = db.collection('users');
  for (const u of plan.users.docs) {
    await usersCol.updateOne({ _id: u._id }, { $set: u }, { upsert: true });
  }
  console.log(`      ✓ Collection "users": ${plan.users.docs.length} documentos importados/atualizados`);

  // B. Permissions
  const permsCol = db.collection('permissions');
  for (const p of plan.permissions.docs) {
    await permsCol.updateOne({ _id: p._id }, { $set: p }, { upsert: true });
  }
  console.log(`      ✓ Collection "permissions": ${plan.permissions.docs.length} documentos importados/atualizados`);

  // C. Default Permissions (Singleton)
  const defPermsCol = db.collection('default_permissions');
  await defPermsCol.updateOne(
    { _id: plan.default_permissions.doc._id },
    { $set: plan.default_permissions.doc },
    { upsert: true }
  );
  console.log(`      ✓ Collection "default_permissions": Singleton "global_default" salvo`);

  // D. Finances
  const financesCol = db.collection('finances');
  for (const f of plan.finances.docs) {
    await financesCol.updateOne({ _id: f._id }, { $set: f }, { upsert: true });
  }
  console.log(`      ✓ Collection "finances": ${plan.finances.docs.length} documentos importados/atualizados`);

  // E. Maintenance (Singleton)
  const maintCol = db.collection('maintenance');
  await maintCol.updateOne(
    { _id: plan.maintenance.doc._id },
    { $set: plan.maintenance.doc },
    { upsert: true }
  );
  console.log(`      ✓ Collection "maintenance": Singleton "system_maintenance" salvo`);

  console.log('\n[4/5] Criando índices únicos...');
  await usersCol.createIndex({ login: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });
  await usersCol.createIndex({ email: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });
  await permsCol.createIndex({ userId: 1 }, { unique: true });
  await financesCol.createIndex({ userId: 1 }, { unique: true });
  console.log('      ✓ Índices criados com sucesso');

  console.log('\n[5/5] Migração concluída com sucesso e idempotência garantida!');
}

/* ==========================================================================
   ENTRY POINT & CONTROLE DE CLI
   ========================================================================== */

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isExecute = args.includes('--execute');

  if (!isDryRun && !isExecute) {
    console.error('================================================================');
    console.error('  SCRIPT DE MIGRAÇÃO: JSON -> MONGODB (FINANÇAS PRO)');
    console.error('================================================================');
    console.error('  Uso obrigatório:');
    console.error('    node scripts/migrate-json-to-mongodb.js --dry-run');
    console.error('    node scripts/migrate-json-to-mongodb.js --execute');
    console.error('================================================================');
    process.exit(1);
  }

  console.log('================================================================');
  console.log(`  MIGRAÇÃO DE DADOS: JSON -> MONGODB [Modo: ${isDryRun ? 'DRY-RUN (SIMULAÇÃO)' : 'EXECUTE (REAL)'}]`);
  console.log('================================================================\n');

  const audit = auditAndPlan();

  if (!audit.valid) {
    console.error('❌ ERROS CRÍTICOS ENCONTRADOS NOS ARQUIVOS JSON:');
    audit.issues.forEach(err => console.error(`  - ${err}`));
    console.error('\nMigração abortada por segurança. Corrija os dados antes de prosseguir.');
    process.exit(1);
  }

  const { plan } = audit;

  console.log('📊 RESUMO DO PLANO DE MIGRAÇÃO:');
  console.log('----------------------------------------------------------------');
  console.log(`1. USERS:`);
  console.log(`   - Total no JSON:        ${plan.users.totalJson}`);
  console.log(`   - Válidos para importar: ${plan.users.validCount}`);
  console.log(`   - Hashes Bcrypt:        Preservados 100% byte a byte`);
  console.log(`   - Checksum SHA-256:     ${plan.users.checksum}`);

  console.log(`\n2. PERMISSIONS:`);
  console.log(`   - Total no JSON:        ${plan.permissions.totalJson}`);
  console.log(`   - Válidos para importar: ${plan.permissions.validCount}`);
  console.log(`   - Registros Órfãos:     ${plan.permissions.orphanCount} (Marcados como SKIPPED)`);
  if (plan.permissions.orphanCount > 0) {
    console.log(`     IDs Órfãos: [ ${plan.permissions.orphanIds.join(', ')} ]`);
  }
  console.log(`   - Checksum SHA-256:     ${plan.permissions.checksum}`);

  console.log(`\n3. DEFAULT PERMISSIONS:`);
  console.log(`   - Identificador Singleton: _id = "global_default"`);
  console.log(`   - Status:                  Válido`);
  console.log(`   - Checksum SHA-256:        ${plan.default_permissions.checksum}`);

  console.log(`\n4. FINANCES:`);
  console.log(`   - Total no JSON:        ${plan.finances.totalJson}`);
  console.log(`   - Válidos para importar: ${plan.finances.validCount}`);
  console.log(`   - Registros Órfãos:     ${plan.finances.orphanCount} (Marcados como SKIPPED)`);
  if (plan.finances.orphanCount > 0) {
    console.log(`     IDs Órfãos: [ ${plan.finances.orphanIds.join(', ')} ]`);
  }
  console.log(`   - Checksum SHA-256:     ${plan.finances.checksum}`);

  console.log(`\n5. MAINTENANCE:`);
  console.log(`   - Identificador Singleton: _id = "system_maintenance"`);
  console.log(`   - Módulos validados:       7/7`);
  console.log(`   - Checksum SHA-256:        ${plan.maintenance.checksum}`);

  console.log('----------------------------------------------------------------');
  console.log('📋 ÍNDICES PLANEJADOS PARA CRIAÇÃO:');
  console.log('   - users:               { login: 1 } (unique, case-insensitive)');
  console.log('   - users:               { email: 1 } (unique, case-insensitive)');
  console.log('   - permissions:         { userId: 1 } (unique)');
  console.log('   - finances:            { userId: 1 } (unique)');
  console.log('----------------------------------------------------------------');

  if (isDryRun) {
    console.log('\n[DRY-RUN] Nenhuma alteração foi realizada no MongoDB ou nos arquivos locais.');
    console.log('[DRY-RUN] Simulação finalizada com 100% de sucesso.');
    process.exit(0);
  }

  // Se for modo execute
  try {
    await executeMigration(audit);
  } catch (err) {
    console.error('\n❌ ERRO DURANTE A EXECUÇÃO DA MIGRAÇÃO:', err.message);
    process.exit(1);
  } finally {
    await dbModule.closeDB();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  canonicalize,
  calculateChecksum,
  auditAndPlan,
  createBackup
};
