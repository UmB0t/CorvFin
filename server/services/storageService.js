const config = require('../config/config');
const jsonStorage = require('./jsonStorage');

/**
 * Seleciona dinamicamente a implementação de storage ativa com base em config.STORAGE_DRIVER.
 * Default: 'json'
 */
function getActiveStorage() {
  if (config.STORAGE_DRIVER === 'mongodb') {
    return require('./mongoStorage');
  }
  return jsonStorage;
}

module.exports = {
  // User Storage Helpers
  getUsers: (...args) => getActiveStorage().getUsers(...args),
  saveUsers: (...args) => getActiveStorage().saveUsers(...args),

  // Permissions Storage Helpers
  getPermissions: (...args) => getActiveStorage().getPermissions(...args),
  savePermissions: (...args) => getActiveStorage().savePermissions(...args),
  getDefaultPermissions: (...args) => getActiveStorage().getDefaultPermissions(...args),
  saveDefaultPermissions: (...args) => getActiveStorage().saveDefaultPermissions(...args),
  getUserPermissions: (...args) => getActiveStorage().getUserPermissions(...args),
  setUserPermissions: (...args) => getActiveStorage().setUserPermissions(...args),

  // Maintenance Storage Helpers
  getMaintenanceConfig: (...args) => getActiveStorage().getMaintenanceConfig(...args),
  saveMaintenanceConfig: (...args) => getActiveStorage().saveMaintenanceConfig(...args),

  // Finances Storage Helpers
  getAllFinances: (...args) => getActiveStorage().getAllFinances(...args),
  saveAllFinances: (...args) => getActiveStorage().saveAllFinances(...args),
  getUserFinances: (...args) => getActiveStorage().getUserFinances(...args),
  saveUserFinances: (...args) => getActiveStorage().saveUserFinances(...args),
  getDefaultUserFinances: (...args) => getActiveStorage().getDefaultUserFinances(...args),

  // AI Proposals Storage Helpers
  saveAiProposal: (...args) => getActiveStorage().saveAiProposal(...args),
  getAiProposal: (...args) => getActiveStorage().getAiProposal(...args),
  updateAiProposalStatus: (...args) => getActiveStorage().updateAiProposalStatus(...args),
  deleteAiProposal: (...args) => getActiveStorage().deleteAiProposal(...args),

  // AI Multi-Turn Pending Actions Storage Helpers
  saveAiPendingAction: (...args) => getActiveStorage().saveAiPendingAction(...args),
  getAiPendingAction: (...args) => getActiveStorage().getAiPendingAction(...args),
  clearAiPendingAction: (...args) => getActiveStorage().clearAiPendingAction(...args),
  updateAiPendingAction: (...args) => getActiveStorage().updateAiPendingAction(...args),

  // Utilitários de auditoria e inspeção
  getDriver: () => config.STORAGE_DRIVER,
  jsonStorage,
  get mongoStorage() {
    return require('./mongoStorage');
  }
};
