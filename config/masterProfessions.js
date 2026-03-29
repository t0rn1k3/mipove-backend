/**
 * Allowed master professions (stored in Master.specialty as `id`).
 * Frontend: GET /api/masters/professions for dropdown options.
 */
const MASTER_PROFESSIONS = [
  { id: "barber", label: "Barber" },
  { id: "hairdresser", label: "Hairdresser / stylist" },
  { id: "nail_technician", label: "Nail technician" },
  { id: "makeup_artist", label: "Makeup artist" },
  { id: "esthetician", label: "Esthetician / skincare" },
  { id: "massage_therapist", label: "Massage therapist" },
  { id: "tattoo_artist", label: "Tattoo artist" },
  { id: "piercer", label: "Piercer" },
  { id: "lash_technician", label: "Lash technician" },
  { id: "brow_specialist", label: "Brow specialist" },
  { id: "cosmetologist", label: "Cosmetologist" },
  { id: "spa_therapist", label: "Spa therapist" },
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
