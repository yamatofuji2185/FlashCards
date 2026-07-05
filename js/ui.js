import { STATUS, buildDriveImageUrls } from "./constants.js";

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
    URL.revokeObjectURL(previousUrl);
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

  const imageUrls = buildDriveImageUrls(card.imageId);
  if (imageUrls.length === 0) {
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
  let imageUrlIndex = 0;
  const tryNextImageUrl = () => {
    if (!isCurrentImageRender(ui, renderToken)) {
      return;
    }

    const nextUrl = imageUrls[imageUrlIndex];
    imageUrlIndex += 1;
    if (nextUrl) {
      ui.frontImage.src = nextUrl;
      return;
    }

    releaseOptimizedImageUrl(ui.frontImage);
    ui.frontImage.removeAttribute("src");
    ui.frontImage.hidden = true;
    ui.frontImagePlaceholder.hidden = false;
    ui.frontImagePlaceholder.textContent = "画像を表示できません";
  };

  ui.frontImage.onerror = tryNextImageUrl;
  tryNextImageUrl();
}

// ステータスランプの色と文言を更新する。
export function updateLamp(dotEl, textEl, active, text) {
  dotEl.style.background = active ? "#2f8f46" : "#808b95";
  textEl.textContent = text;
}
