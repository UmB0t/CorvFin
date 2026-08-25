window.getBenefitTypeInfo = function getBenefitTypeInfo(typeKey) {
  if (BENEFIT_TYPES_MAP[typeKey]) return BENEFIT_TYPES_MAP[typeKey];
  return { label: typeKey || 'Outro', short: (typeKey || 'BEN').toUpperCase().slice(0, 5), color: 'var(--brand)', bg: 'var(--brand-soft)' };
};
