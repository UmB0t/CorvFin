const { MongoClient } = require('mongodb');
const config = require('./config');

let client = null;
let dbInstance = null;

/**
 * Conecta ao MongoDB caso ainda não esteja conectado.
 * Reutiliza a instância singleton do MongoClient.
 */
async function connectDB() {
  if (dbInstance && client) {
    return dbInstance;
  }

  if (!config.MONGODB_URI) {
    throw new Error(
      '[MongoDB] Variável de ambiente MONGODB_URI não configurada. Defina MONGODB_URI no .env ou nas variáveis do sistema.'
    );
  }

  try {
    if (!client) {
      client = new MongoClient(config.MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000
      });
    }

    await client.connect();
    dbInstance = client.db(config.MONGODB_DB_NAME || 'financas_pro');
    return dbInstance;
  } catch (err) {
    // Sanitizar mensagem para garantir que credenciais contidas na URI não vazem
    const safeErrorMsg = err && err.message ? err.message.replace(/\/\/[^@]+@/, '//***:***@') : 'Erro de conexão desconhecido';
    console.error('[MongoDB] Falha ao conectar ao banco de dados:', safeErrorMsg);
    throw new Error(`Falha na conexão com o MongoDB: ${safeErrorMsg}`);
  }
}

/**
 * Retorna a instância do Database conectada.
 * Lança erro se connectDB() ainda não tiver sido chamado com sucesso.
 */
function getDB() {
  if (!dbInstance) {
    throw new Error('[MongoDB] Banco de dados não conectado. Execute connectDB() antes de acessar getDB().');
  }
  return dbInstance;
}

/**
 * Retorna a instância do MongoClient conectado.
 */
function getClient() {
  return client;
}

/**
 * Executa um comando ping para validar conectividade e permissões.
 */
async function pingDB() {
  const db = await connectDB();
  const result = await db.command({ ping: 1 });
  return result && result.ok === 1;
}

/**
 * Fecha a conexão de forma limpa e controlada.
 */
async function closeDB() {
  if (client) {
    try {
      await client.close();
    } finally {
      client = null;
      dbInstance = null;
    }
  }
}

module.exports = {
  connectDB,
  getDB,
  getClient,
  pingDB,
  closeDB
};
