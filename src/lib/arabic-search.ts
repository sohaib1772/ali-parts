export function buildSearchOrClause(rawQuery: string): string {
  const clean = rawQuery
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // harakat & tatweel
    .replace(/['"(),\\;?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";

  const words = clean.split(" ").filter(Boolean);
  const conditions = new Set<string>();

  conditions.add(`oem_number.ilike.%${clean}%`);
  conditions.add(`name_en.ilike.%${clean}%`);
  conditions.add(`name_ar.ilike.%${clean}%`);
  conditions.add(`dialect_names.ilike.%${clean}%`);

  const normalizeToken = (token: string): string => {
    if (!token) return token;
    let t = token;
    if (t.length >= 3 && /^[أإآٱا]/.test(t)) {
      t = `_${t.slice(1)}`;
    }
    if (t.length >= 2 && /[ةه]$/.test(t)) {
      t = `${t.slice(0, -1)}_`;
    } else if (t.length >= 2 && /[يى]$/.test(t)) {
      t = `${t.slice(0, -1)}_`;
    }
    return t;
  };

  if (words.length === 1) {
    const norm = normalizeToken(words[0]);
    if (norm !== words[0]) {
      conditions.add(`name_ar.ilike.%${norm}%`);
      conditions.add(`dialect_names.ilike.%${norm}%`);
    }
  } else if (words.length > 1) {
    const normTokens = words.map(normalizeToken);
    conditions.add(`name_ar.ilike.%${normTokens.join("%")}%`);
    conditions.add(`dialect_names.ilike.%${normTokens.join("%")}%`);
    if (words.length === 2) {
      conditions.add(`name_ar.ilike.%${normTokens.slice().reverse().join("%")}%`);
      conditions.add(`dialect_names.ilike.%${normTokens.slice().reverse().join("%")}%`);
    }
  }

  return Array.from(conditions).join(",");
}
