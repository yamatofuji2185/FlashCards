export const DB_NAME = "flashcard-db";
export const DB_VERSION = 1;
export const CARD_STORE = "cards";

export const SETTING_KEYS = {
  gasUrl: "flashcard.gasUrl",
  order: "flashcard.order",
  direction: "flashcard.direction",
  filter: "flashcard.filter",
  aiGrade: "flashcard.aiGrade",
  aiDifficulty: "flashcard.aiDifficulty",
  syncQueue: "flashcard.syncQueue"
};

export const STATUS = {
  remembered: "remembered",
  yet: "yet"
};

export const IMAGE_CACHE_NAME = "flashcard-images-v1";

export function normalizeDriveImageId(imageId) {
  const value = String(imageId || "").trim();
  if (!value) {
    return "";
  }

  const idMatch = value.match(/[?&]id=([^&]+)/) || value.match(/\/d\/([^/]+)/);
  if (idMatch) {
    return decodeURIComponent(idMatch[1]);
  }

  return value;
}

export function buildDriveImageUrl(imageId) {
  const id = normalizeDriveImageId(imageId);
  if (!id) {
    return "";
  }
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`;
}
