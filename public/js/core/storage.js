/* ==========================================================================
   STORAGE MODULE (storage.js) - STRICT IN-MEMORY & LOCAL PREFERENCES
   OmniFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Financial state is strictly loaded in-memory from GET /api/finances
  window.loadState = function loadState() {
    return initialState();
  };

  window.loadLocalPreferences = function loadLocalPreferences() {
    try {
      const raw = localStorage.getItem('omnifin_ui_preferences');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  };

  window.saveLocalPreferences = function saveLocalPreferences(prefs) {
    try {
      const current = window.loadLocalPreferences();
      const updated = Object.assign({}, current, prefs);
      localStorage.setItem('omnifin_ui_preferences', JSON.stringify(updated));
    } catch (_) {}
  };

})();
