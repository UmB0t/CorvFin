window.STORAGE_KEY = 'minhas-financas:v4';
window.OLD_STORAGE_KEY_3 = 'minhas-financas:v3';
window.OLD_STORAGE_KEY_2 = 'minhas-financas:v2';

window.MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
window.MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

window.DEFAULT_DESTINATIONS = [
  { name: 'Pix', color: '#10B981', icon: 'dollar', dueDay: null },
  { name: 'Dinheiro', color: '#F59E0B', icon: 'wallet', dueDay: null },
  { name: 'Nubank', color: '#8B5CF6', icon: 'card', dueDay: 10 },
  { name: 'XP Investimentos', color: '#1F7A5C', icon: 'bank', dueDay: null },
  { name: 'BTG Pactual', color: '#2563EB', icon: 'bank', dueDay: null },
  { name: 'Neon', color: '#06B6D4', icon: 'card', dueDay: 15 },
  { name: 'Itaú', color: '#F97316', icon: 'card', dueDay: 20 },
  { name: 'Bradesco', color: '#EF4444', icon: 'card', dueDay: 5 },
  { name: 'Terceiro', color: '#6B7280', icon: 'globe', dueDay: null },
  { name: 'Binance', color: '#EAB308', icon: 'globe', dueDay: null }
];

window.DEFAULT_CATEGORY_ICONS_MAP = {
  'Moradia': 'home',
  'Lazer': 'star',
  'Alimentação': 'utensils',
  'Cartão': 'card',
  'Transporte': 'car',
  'Saúde': 'health',
  'Educação': 'book',
  'Gerais': 'tag',
  'Outros': 'tag',
  'Investimento': 'chart',
  'Investimentos': 'chart',
  'Assinatura': 'receipt',
  'Assinaturas': 'receipt',
  'Trabalho': 'briefcase'
};

window.DEFAULT_CATEGORIES = [
  { name: 'Moradia', icon: 'home' },
  { name: 'Lazer', icon: 'star' },
  { name: 'Alimentação', icon: 'utensils' },
  { name: 'Cartão', icon: 'card' },
  { name: 'Transporte', icon: 'car' },
  { name: 'Saúde', icon: 'health' },
  { name: 'Educação', icon: 'book' },
  { name: 'Gerais', icon: 'tag' },
  { name: 'Outros', icon: 'tag' }
];

window.DEFAULT_BUDGETS = { 'Moradia': 2000, 'Lazer': 800, 'Alimentação': 1500, 'Cartão': 3000, 'Gerais': 1000 };

window.TAB_TITLES = {
  'tab-expenses': 'Despesas',
  'tab-extras': 'Rendas Extras',
  'tab-debtors': 'Devedores',
  'tab-benefits': 'Benefícios',
  'tab-investments': 'Investimentos & Patrimônio',
  'tab-simulation': 'Simulação de Cenários & Novas Despesas',
  'tab-profile': 'Perfil',
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

window.CATEGORY_SVG_ICONS = {
  tag: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  home: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  car: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="7" rx="2"/><path d="M5 11l2-5h10l2 5"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/></svg>`,
  wallet: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>`,
  banknote: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  health: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 7v6M9 10h6"/></svg>`,
  utensils: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 2v20M21 15V2a5 5 0 0 0-5 5v8h5zM7 2v20M3 2v6a4 4 0 0 0 4 4 4 4 0 0 0 4-4V2"/></svg>`,
  shopping: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  book: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  briefcase: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  chart: `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  receipt: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
  star: `<svg class="svg-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  card: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`
};

window.getCategoryName = function getCategoryName(cat) {
  if (!cat) return 'Gerais';
  if (typeof cat === 'string') return cat;
  if (typeof cat === 'object' && cat !== null && cat.name) return String(cat.name);
  return 'Gerais';
};

window.getCategoryMeta = function getCategoryMeta(cat) {
  const catName = window.getCategoryName(cat);
  const catIcon = (typeof cat === 'object' && cat !== null && cat.icon) ? cat.icon : null;
  const cats = (typeof getState === 'function' && getState()?.categories) || window.DEFAULT_CATEGORIES;
  if (Array.isArray(cats)) {
    const found = cats.find(c => (typeof c === 'string' ? c === catName : c?.name === catName));
    if (found) {
      if (typeof found === 'string') return { name: found, icon: catIcon || window.DEFAULT_CATEGORY_ICONS_MAP[found] || 'tag' };
      return { name: found.name || catName, icon: catIcon || found.icon || window.DEFAULT_CATEGORY_ICONS_MAP[found.name] || 'tag' };
    }
  }
  return { name: catName, icon: catIcon || window.DEFAULT_CATEGORY_ICONS_MAP[catName] || 'tag' };
};

window.getCategoryIconSvg = function getCategoryIconSvg(catNameOrIcon) {
  if (typeof catNameOrIcon === 'string' && window.CATEGORY_SVG_ICONS[catNameOrIcon]) {
    return window.CATEGORY_SVG_ICONS[catNameOrIcon];
  }
  const meta = window.getCategoryMeta(catNameOrIcon);
  return window.CATEGORY_SVG_ICONS[meta.icon] || window.CATEGORY_SVG_ICONS.tag;
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

window.normalizeShoppingItemName = function normalizeShoppingItemName(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

window.DEFAULT_SHOPPING_CATALOG = [
  { name: 'Arroz', category: 'Carboidrato', unit: 'kg' },
  { name: 'Feijão', category: 'Carboidrato', unit: 'kg' },
  { name: 'Macarrão', category: 'Carboidrato', unit: 'pct' },
  { name: 'Molho de Tomate', category: 'Complemento', unit: 'un' },
  { name: 'Açúcar', category: 'Complemento', unit: 'kg' },
  { name: 'Sal', category: 'Tempero', unit: 'kg' },
  { name: 'Café', category: 'Complemento', unit: 'pct' },
  { name: 'Leite', category: 'Complemento', unit: 'L' },
  { name: 'Pão', category: 'Carboidrato', unit: 'un' },
  { name: 'Ovos', category: 'Proteína', unit: 'cx' },
  { name: 'Frango', category: 'Proteína', unit: 'kg' },
  { name: 'Carne', category: 'Proteína', unit: 'kg' },
  { name: 'Queijo', category: 'Proteína', unit: 'g' },
  { name: 'Presunto', category: 'Proteína', unit: 'g' },
  { name: 'Manteiga', category: 'Complemento', unit: 'un' },
  { name: 'Óleo', category: 'Complemento', unit: 'un' },
  { name: 'Farinha', category: 'Carboidrato', unit: 'kg' },
  { name: 'Sabão em Pó', category: 'Extras', unit: 'cx' },
  { name: 'Detergente', category: 'Extras', unit: 'un' },
  { name: 'Papel Higiênico', category: 'Extras', unit: 'pct' },
  { name: 'Alho', category: 'Tempero', unit: 'kg' },
  { name: 'Cebola', category: 'Legumes', unit: 'kg' },
  { name: 'Tomate', category: 'Legumes', unit: 'kg' },
  { name: 'Batata', category: 'Legumes', unit: 'kg' },
  { name: 'Cenoura', category: 'Legumes', unit: 'kg' },
  { name: 'Banana', category: 'Frutas', unit: 'kg' },
  { name: 'Maçã', category: 'Frutas', unit: 'kg' },
  { name: 'Peito de Frango', category: 'Proteína', unit: 'kg' },
  { name: 'Azeite', category: 'Complemento', unit: 'un' },
  { name: 'Biscoito', category: 'Complemento', unit: 'pct' },
  { name: 'Iogurte', category: 'Complemento', unit: 'un' },
  { name: 'Sabonete', category: 'Extras', unit: 'un' },
  { name: 'Shampoo', category: 'Extras', unit: 'un' },
  { name: 'Desinfetante', category: 'Extras', unit: 'un' },
  { name: 'Água Sanitária', category: 'Extras', unit: 'un' },
  { name: 'Esponja', category: 'Extras', unit: 'pct' },
  { name: 'Amaciante', category: 'Extras', unit: 'un' },
  { name: 'Creme Dental', category: 'Extras', unit: 'un' }
];
