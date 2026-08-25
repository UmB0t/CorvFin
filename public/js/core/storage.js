window.loadState = function loadState() {
  try {
    const keys = [STORAGE_KEY, OLD_STORAGE_KEY_3, OLD_STORAGE_KEY_2, 'minhas-financas:v1', 'minhas-financas', 'minhas_financas'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && ((parsed.fixed && parsed.fixed.length > 0) || (parsed.variable && parsed.variable.length > 0) || (parsed.profile && parsed.profile.name !== 'Usuário'))) {
            return migrateState(parsed);
          }
        } catch (_) {}
      }
    }
    return initialState();
  } catch (_) {
    return initialState();
  }
};
