// A number for display: 1 decimal by default, "–" when missing.
export const fmt = (v, decimals) => (v == null ? "–" : Number(v).toFixed(decimals == null ? 1 : decimals));
