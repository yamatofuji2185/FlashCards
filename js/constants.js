export const DB_NAME = "flashcard-db";
export const DB_VERSION = 1;
export const CARD_STORE = "cards";

export const SETTING_KEYS = {
  gasUrl: "flashcard.gasUrl",
  order: "flashcard.order",
  direction: "flashcard.direction",
  filter: "flashcard.filter",
  syncQueue: "flashcard.syncQueue"
};

export const STATUS = {
  remembered: "remembered",
  yet: "yet"
};

export const IMAGE_CACHE_NAME = "flashcard-images-v1";

export function buildDriveImageUrl(imageId) {
  if (!imageId) {
    return "";
  }
  return `https://docs.google.com/uc?export=view&id=${encodeURIComponent(imageId)}`;
}
