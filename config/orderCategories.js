/**
 * Order marketplace categories for smart filter / tagging (frontend: GET /api/orders/categories).
 * Stored on Order.category; filter list with ?category=<id>.
 */
const ORDER_CATEGORIES = [
  { id: "wood", label: "Wood" },
  { id: "metal", label: "Metal" },
  { id: "jewelry", label: "Jewelry" },
  { id: "ceramics", label: "Ceramics" },
  { id: "glass", label: "Glass" },
  { id: "leather", label: "Leather" },
  { id: "handbag", label: "Handbag" },
  { id: "clothing", label: "Clothing" },
  { id: "painting", label: "Painting" },
  { id: "calligraphy", label: "Calligraphy" },
  { id: "sculpture", label: "Sculpture" },
  { id: "3d_art", label: "3D art" },
  { id: "photography_video", label: "Photography & video" },
  { id: "body_art_tattoo", label: "Body art & tattoo" },
  { id: "toys_dolls", label: "Toys & dolls" },
  { id: "repair", label: "Repair" },
  { id: "handmade", label: "Handmade" },
  { id: "goldsmith", label: "Goldsmith" },
  { id: "gifts", label: "Gifts" },
];

const ORDER_CATEGORY_IDS = ORDER_CATEGORIES.map((c) => c.id);
const ORDER_CATEGORY_ID_SET = new Set(ORDER_CATEGORY_IDS);

const labelById = Object.fromEntries(
  ORDER_CATEGORIES.map((c) => [c.id, c.label]),
);

/**
 * @param {unknown} value
 * @returns {string | null | undefined} normalized id, null to clear, undefined if not provided
 */
function normalizeOrderCategoryInput(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  let s = String(value).trim().toLowerCase();
  s = s.replace(/\s*&\s*/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
  return s === "" ? null : s;
}

/**
 * @param {unknown} value - raw from client (omit = unchanged on update)
 * @returns {{ ok: true, category: string | null | undefined } | { ok: false, message: string }}
 */
function validateOrderCategory(value) {
  if (value === undefined) {
    return { ok: true, category: undefined };
  }
  const normalized = normalizeOrderCategoryInput(value);
  if (normalized === null) {
    return { ok: true, category: null };
  }
  if (!ORDER_CATEGORY_ID_SET.has(normalized)) {
    return {
      ok: false,
      message: `Invalid category. Use one of: ${ORDER_CATEGORY_IDS.join(", ")}`,
    };
  }
  return { ok: true, category: normalized };
}

function getOrderCategoryLabel(categoryId) {
  if (!categoryId) return "";
  return labelById[categoryId] || String(categoryId);
}

module.exports = {
  ORDER_CATEGORIES,
  ORDER_CATEGORY_IDS,
  ORDER_CATEGORY_ID_SET,
  validateOrderCategory,
  getOrderCategoryLabel,
};
