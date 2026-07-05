import { STATUS, buildDriveImageUrl } from "./constants.js";

const optimizedImageCache = new Map();
const OPTIMIZED_IMAGE_MAX_WIDTH = 900;
const OPTIMIZED_IMAGE_QUALITY = 0.82;
const IMAGE_LOAD_TIMEOUT_MS = 4000;

function beginImageRender(ui) {
  const token = String(Date.now()) + "-" + String(Math.random());
  ui.frontImage.dataset.renderToken = token;
  return token;
}

function isCurrentImageRender(ui, token) {
  return ui.frontImage.dataset.renderToken === token;
}

function releaseOptimizedImageUrl(imageEl) {
  const previousUrl = imageEl.getAttribute("data-optimized-url");
  if (previousUrl) {
    const isCached = Array.from(optimizedImageCache.values()).includes(previousUrl);
    if (!isCached) {
      URL.revokeObjectURL(previousUrl);
    }
    imageEl.removeAttribute("data-optimized-url");
  }
}

function resetFrontImage(ui) {
  ui.frontImage.onload = null;
  ui.frontImage.onerror = null;
  releaseOptimizedImageUrl(ui.frontImage);
  ui.frontImage.removeAttribute("src");
  ui.frontImage.hidden = true;
  ui.frontImagePlaceholder.hidden = true;
  ui.frontImagePlaceholder.textContent = "";
}

function probeImageUrl(imageUrl) {
  return new Promise((resolve) => {
    const probe = new Image();
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, IMAGE_LOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      probe.onload = null;
      probe.onerror = null;
    };

    probe.referrerPolicy = "no-referrer";
    probe.onload = () => {
      cleanup();
      resolve(true);
    };
    probe.onerror = () => {
      cleanup();
      resolve(false);
    };
    probe.src = imageUrl;
  });
}

async function loadOptimizedImage(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  if (optimizedImageCache.has(imageUrl)) {
    return optimizedImageCache.get(imageUrl);
  }

  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";

  await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("image load timeout"));
    }, IMAGE_LOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      resolve();
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("image load failed"));
    };
    img.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  const width = Math.min(OPTIMIZED_IMAGE_MAX_WIDTH, img.naturalWidth || img.width || OPTIMIZED_IMAGE_MAX_WIDTH);
  const height = Math.round((width / (img.naturalWidth || img.width || 1)) * (img.naturalHeight || img.height || 1));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/webp", OPTIMIZED_IMAGE_QUALITY);
  });

  if (!blob) {
    return null;
  }

  const objectUrl = URL.createObjectURL(blob);
  optimizedImageCache.set(imageUrl, objectUrl);
  return objectUrl;
}

// 重複を除去し、表示用に並び替えた値配列を返す。
export function toUniqueSortedValues(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// セレクトボックスや datalist の選択肢を作り直す。
export function setSelectOptions(selectEl, values, includeAll = true) {
  selectEl.innerHTML = "";
  const tag = String(selectEl.tagName).toLowerCase();
  const isDatalist = tag === "datalist";
  if (includeAll && !isDatalist) {
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "（すべて）";
    selectEl.appendChild(allOption);
  }
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  }
}

// Level1/2/3 の選択値でカードを絞り込む。
export function filterByLevels(cards, level1, level2, level3) {
  return cards.filter((card) => {
    if (level1 && card.categoryL1 !== level1) {
      return false;
    }
    if (level2 && card.categoryL2 !== level2) {
      return false;
    }
    if (level3 && card.categoryL3 !== level3) {
      return false;
    }
    return true;
  });
}

// 出題条件（未完了のみ、ランダム）を適用する。
export function applyStudyOptions(cards, settings) {
  let result = cards.slice();
  if (settings.filter === "pending") {
    result = result.filter((card) => card.status !== STATUS.remembered);
  }

  if (settings.order === "random") {
    result = shuffle(result);
  }

  return result;
}

function shuffle(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 設定（通常/逆引き）に合わせてカード表示内容を切り替える。
export async function renderCard(card, settings, ui) {
  const renderToken = beginImageRender(ui);
  const isReverse = settings.direction === "reverse";
  const frontText = isReverse ? card.answer : card.question;
  const backText = isReverse ? card.question : card.answer;

  ui.frontTitle.textContent = isReverse ? "解答" : "質問";
  ui.frontText.textContent = frontText || "（未入力）";
  ui.backTitle.textContent = isReverse ? "質問" : "解答";
  ui.backText.textContent = backText || "（未入力）";
  ui.backDescription.textContent = card.description || "";

  const hasImageId = Boolean(card.imageId && String(card.imageId).trim());
  if (!hasImageId) {
    resetFrontImage(ui);
    return;
  }

  const imageUrl = buildDriveImageUrl(card.imageId);
  if (!imageUrl) {
    resetFrontImage(ui);
    return;
  }

  resetFrontImage(ui);
  ui.frontImage.dataset.renderToken = renderToken;
  ui.frontImagePlaceholder.hidden = false;
  ui.frontImagePlaceholder.textContent = "画像読み込み中…";
  ui.frontImage.hidden = true;
  ui.frontImage.referrerPolicy = "no-referrer";
  ui.frontImage.onload = () => {
    if (!isCurrentImageRender(ui, renderToken)) {
      return;
    }
    ui.frontImagePlaceholder.hidden = true;
    ui.frontImage.hidden = false;
  };
  ui.frontImage.onerror = () => {
    if (!isCurrentImageRender(ui, renderToken)) {
      return;
    }
    releaseOptimizedImageUrl(ui.frontImage);
    ui.frontImage.removeAttribute("src");
    ui.frontImage.hidden = true;
    ui.frontImagePlaceholder.hidden = true;
    ui.frontImagePlaceholder.textContent = "";
  };

  const directLoadSuccess = await probeImageUrl(imageUrl);
  if (!isCurrentImageRender(ui, renderToken)) {
    return;
  }

  if (!directLoadSuccess) {
    ui.frontImage.onerror?.(new Event("error"));
    return;
  }

  releaseOptimizedImageUrl(ui.frontImage);
  ui.frontImage.src = imageUrl;
  ui.frontImagePlaceholder.hidden = true;
  ui.frontImage.hidden = false;

  try {
    const optimizedUrl = await loadOptimizedImage(imageUrl);
    if (optimizedUrl && isCurrentImageRender(ui, renderToken)) {
      releaseOptimizedImageUrl(ui.frontImage);
      ui.frontImage.setAttribute("data-optimized-url", optimizedUrl);
      ui.frontImage.src = optimizedUrl;
    }
  } catch {
    // 最適化失敗時は元画像をそのまま使う。
  }
}

// ステータスランプの色と文言を更新する。
export function updateLamp(dotEl, textEl, active, text) {
  dotEl.style.background = active ? "#2f8f46" : "#808b95";
  textEl.textContent = text;
}
