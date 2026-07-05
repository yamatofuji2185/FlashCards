import { STATUS, buildDriveImageUrl } from "./constants.js";

// 重複を除去し、表示用に並び替えた値配列を返す。
export function toUniqueSortedValues(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// セレクトボックスの選択肢を作り直す。
export function setSelectOptions(selectEl, values, includeAll = true) {
  selectEl.innerHTML = "";
  if (includeAll) {
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
export function renderCard(card, settings, ui) {
  const isReverse = settings.direction === "reverse";
  const frontText = isReverse ? card.answer : card.question;
  const backText = isReverse ? card.question : card.answer;

  ui.frontTitle.textContent = isReverse ? "解答" : "質問";
  ui.frontText.textContent = frontText || "（未入力）";
  ui.backTitle.textContent = isReverse ? "質問" : "解答";
  ui.backText.textContent = backText || "（未入力）";
  ui.backDescription.textContent = card.description || "";

  const imageUrl = buildDriveImageUrl(card.imageId);
  if (imageUrl) {
    ui.frontImage.src = imageUrl;
    ui.frontImage.hidden = false;
  } else {
    ui.frontImage.removeAttribute("src");
    ui.frontImage.hidden = true;
  }
}

// ステータスランプの色と文言を更新する。
export function updateLamp(dotEl, textEl, active, text) {
  dotEl.style.background = active ? "#2f8f46" : "#808b95";
  textEl.textContent = text;
}
