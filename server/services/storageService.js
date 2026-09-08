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
  getUserById: (...args) => getActiveStorage().getUserById(...args),
  getUserByEmail: (...args) => getActiveStorage().getUserByEmail(...args),
  saveUsers: (...args) => getActiveStorage().saveUsers(...args),
  updateUserPassword: (...args) => getActiveStorage().updateUserPassword(...args),
  updateUserPlan: (...args) => getActiveStorage().updateUserPlan(...args),

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

  // Global Email Settings Storage Helpers (Security 6A)
  getEmailSettings: (...args) => getActiveStorage().getEmailSettings(...args),
  saveEmailSettings: (...args) => getActiveStorage().saveEmailSettings(...args),

  // Security Tokens Storage Helpers (Checkpoint Security 6B)
  createSecurityToken: (...args) => getActiveStorage().createSecurityToken(...args),
  invalidateSecurityTokensForUser: (...args) => getActiveStorage().invalidateSecurityTokensForUser(...args),
  verifyEmailWithToken: (...args) => getActiveStorage().verifyEmailWithToken(...args),
  resetPasswordWithToken: (...args) => getActiveStorage().resetPasswordWithToken(...args),
  cleanExpiredSecurityTokens: (...args) => getActiveStorage().cleanExpiredSecurityTokens(...args),

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

  // Plans Storage Helpers (Lote 5B)
  getPlans: (...args) => getActiveStorage().getPlans(...args),
  getPlanById: (...args) => getActiveStorage().getPlanById(...args),
  getPlanBySlug: (...args) => getActiveStorage().getPlanBySlug(...args),
  getDefaultPlan: (...args) => getActiveStorage().getDefaultPlan(...args),
  savePlan: (...args) => getActiveStorage().savePlan(...args),
  updatePlan: (...args) => getActiveStorage().updatePlan(...args),
  setDefaultPlan: (...args) => getActiveStorage().setDefaultPlan(...args),

  // Utilitários de auditoria e inspeção
  getDriver: () => config.STORAGE_DRIVER,
  jsonStorage,
  get mongoStorage() {
    return require('./mongoStorage');
  }
};
