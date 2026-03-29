/**
 * Allowed master professions (stored in Master.specialty as `id`).
 * Frontend: GET /api/masters/professions for dropdown options.
 */
const MASTER_PROFESSIONS = [
  { id: "painter", label: "Painter" },
  { id: "sculptor", label: "Sculptor" },
  { id: "illustrator", label: "Illustrator" },
  { id: "calligrapher", label: "Calligrapher" },
  { id: "tattoo_artist", label: "Tattoo Artist" },
  { id: "jewelry_Designer", label: "Jewelry Designer" },
  { id: "ceramicist", label: "Ceramicist" },
  { id: "enamel_artist", label: "Enamel Artist" },
  { id: "woodworker", label: "Woodworker" },
  { id: "tailor", label: "Tailor" },
  { id: "leather_Crafter", label: "Leather Crafter" },
  { id: "shoe_Designer", label: "Shoe Designer" },
  { id: "photographer", label: "Photographer" },
  { id: "videographer", label: "Videographer" },
  { id: "restorer", label: "Restorer" },
  { id: "other", label: "Other" },
];

const PROFESSION_IDS = new Set(MASTER_PROFESSIONS.map((p) => p.id));

/**
 * @param {unknown} value
 * @returns {string|null} normalized id or null if empty (clear specialty)
 */
function normalizeSpecialtyInput(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  return s === "" ? null : s;
}

/**
 * @param {unknown} value - raw from client
 * @returns {{ ok: true, specialty: string } | { ok: false, message: string }}
 */
function validateSpecialty(value) {
  if (value === undefined) return { ok: true, specialty: undefined };
  const normalized = normalizeSpecialtyInput(value);
  if (normalized === null) return { ok: true, specialty: "" };
  if (!PROFESSION_IDS.has(normalized)) {
    return {
      ok: false,
      message: `Invalid profession. Use one of: ${[...PROFESSION_IDS].join(", ")}`,
    };
  }
  return { ok: true, specialty: normalized };
}

const professionLabelById = Object.fromEntries(
  MASTER_PROFESSIONS.map((p) => [p.id, p.label]),
);

/** Human-readable label for a stored specialty id (or legacy free-text). */
function getSpecialtyLabel(specialtyId) {
  if (!specialtyId) return "";
  return professionLabelById[specialtyId] || String(specialtyId);
}

module.exports = {
  MASTER_PROFESSIONS,
  PROFESSION_IDS,
  validateSpecialty,
  getSpecialtyLabel,
};
