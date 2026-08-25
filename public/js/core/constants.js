window.STORAGE_KEY = 'minhas-financas:v4';
window.OLD_STORAGE_KEY_3 = 'minhas-financas:v3';
window.OLD_STORAGE_KEY_2 = 'minhas-financas:v2';

window.MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
window.MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

window.DEFAULT_DESTINATIONS = [
  { name: 'XP Investimentos', color: '#1F7A5C', icon: 'bank' },
  { name: 'BTG Pactual', color: '#2563EB', icon: 'bank' },
  { name: 'Nubank', color: '#8B5CF6', icon: 'card' },
  { name: 'Neon', color: '#06B6D4', icon: 'card' },
  { name: 'Pix', color: '#10B981', icon: 'dollar' },
  { name: 'Em dinheiro', color: '#F59E0B', icon: 'wallet' },
  { name: 'Terceiro', color: '#6B7280', icon: 'globe' },
  { name: 'Itaú', color: '#F97316', icon: 'card' },
  { name: 'Bradesco', color: '#EF4444', icon: 'card' },
  { name: 'Binance', color: '#EAB308', icon: 'globe' }
];

window.DEFAULT_CATEGORIES = ['Moradia', 'Lazer', 'Alimentação', 'Cartão', 'Transporte', 'Saúde', 'Educação', 'Gerais', 'Outros'];
window.DEFAULT_BUDGETS = { 'Moradia': 2000, 'Lazer': 800, 'Alimentação': 1500, 'Cartão': 3000, 'Gerais': 1000 };

window.TAB_TITLES = {
  'tab-expenses': 'Despesas',
  'tab-extras': 'Rendas Extras',
  'tab-debtors': 'Devedores',
  'tab-benefits': 'Benefícios',
  'tab-investments': 'Investimentos & Patrimônio',
  'tab-simulation': 'Simulação de Cenários & Novas Despesas',
  'tab-profile': 'Perfil & Destinos',
  'tab-admin': 'Configurações / Usuários & Permissões'
};

window.CATEGORY_COLORS = [
  '#1F7A5C', '#2563EB', '#8B5CF6', '#EC4899', '#F59E0B',
  '#06B6D4', '#10B981', '#6366F1', '#F97316', '#14B8A6',
  '#84CC16', '#E11D48', '#A855F7', '#3B82F6'
];

window.BENEFIT_TYPES_MAP = {
  saude: { label: 'Saúde', short: 'SAÚDE', color: 'var(--danger)', bg: 'var(--danger-soft)' },
  vr: { label: 'Vale Refeição (VR)', short: 'VR', color: 'var(--warning)', bg: 'var(--warning-soft)' },
  va: { label: 'Vale Alimentação (VA)', short: 'VA', color: 'var(--success)', bg: 'var(--success-soft)' },
  transporte: { label: 'Transporte', short: 'TRANS', color: 'var(--info)', bg: 'var(--info-soft)' },
  educacao: { label: 'Educação', short: 'EDUC', color: 'var(--c-fixed)', bg: 'var(--c-fixed-soft)' },
  cultura: { label: 'Cultura', short: 'CULT', color: 'var(--c-extra)', bg: 'var(--c-extra-soft)' },
  farmacia: { label: 'Farmácia', short: 'FARM', color: '#EC4899', bg: '#FCE7F3' }
};

window.DEST_SVG_ICONS = {
  card: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  bank: `<svg class="svg-icon" viewBox="0 0 24 24"><polygon points="12 2 2 7 22 7 12 2"/><line x1="4" y1="11" x2="4" y2="17"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/><line x1="20" y1="11" x2="20" y2="17"/><line x1="2" y1="21" x2="22" y2="21"/></svg>`,
  wallet: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>`,
  dollar: `<svg class="svg-icon" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  shopping: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  phone: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  file: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  globe: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
};

window.ICONS = {
  check: `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke-width:2.5;"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  edit: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  bank: window.DEST_SVG_ICONS.bank,
  close: `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke-width:2.5;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  box: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  sun: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  alert: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  eye: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  fullscreen: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18-5h-3a2 2 0 0 0-2 2v3M3 16v3a2 2 0 0 0 2 2h3m13 0h3a2 2 0 0 0 2-2v-3"/></svg>`
};

window.DEBTOR_COLORS_PALETTE = [
  '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#A855F7', '#E11D48', '#0284C7', '#16A34A'
];
