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
  return buildDriveImageUrls(imageId)[0] || "";
}

export function buildDriveImageUrls(imageId) {
  const rawValue = String(imageId || "").trim();
  if (/^https?:\/\//i.test(rawValue) && !/[?&]id=/.test(rawValue) && !/\/d\//.test(rawValue)) {
    return [rawValue];
  }

  const id = normalizeDriveImageId(imageId);
  if (!id) {
    return [];
  }

  const encodedId = encodeURIComponent(id);
  return [
    `https://lh3.googleusercontent.com/d/${encodedId}=w1600`,
    `https://lh3.googleusercontent.com/d/${encodedId}=s1600`,
    `https://drive.google.com/thumbnail?id=${encodedId}&sz=w1600`,
    `https://drive.google.com/thumbnail?id=${encodedId}&sz=w1000`,
    `https://drive.google.com/uc?export=view&id=${encodedId}`,
    `https://docs.google.com/uc?export=view&id=${encodedId}`,
    `https://drive.google.com/uc?export=download&id=${encodedId}`
  ];
}
