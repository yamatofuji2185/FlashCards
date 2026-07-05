import { STATUS } from "./constants.js";
import { appendCards, deleteCard, getAllCards, updateCardStatus, countCards } from "./db.js";
import { downloadAndStoreCards, uploadSyncQueue } from "./sync.js";
import { generateCardsFromText, generateSingleAnswer, updateAppConfig } from "./api.js";
import {
  appendQueueItems,
  getQueueLength,
  loadSettings,
  readSyncQueue,
  saveSettings
} from "./storage.js";
import {
  applyStudyOptions,
  filterByLevels,
  renderCard,
  setSelectOptions,
  toUniqueSortedValues,
  updateLamp
} from "./ui.js";

// 画面上の要素を最初にまとめて取得しておくと、後続処理が見通しやすくなる。
const els = {
  connectionAccordion: document.getElementById("connectionAccordion"),
  saveConnectionButton: document.getElementById("saveConnectionButton"),
  saveAppConfigButton: document.getElementById("saveAppConfigButton"),
  gasUrlInput: document.getElementById("gasUrlInput"),
  aiGradeSelect: document.getElementById("aiGradeSelect"),
  aiDifficultySelect: document.getElementById("aiDifficultySelect"),
  orderSelect: document.getElementById("orderSelect"),
  directionSelect: document.getElementById("directionSelect"),
  filterSelect: document.getElementById("filterSelect"),
  rangePanel: document.getElementById("rangePanel"),
  studyRangeAccordion: document.getElementById("studyRangeAccordion"),
  level1Select: document.getElementById("level1Select"),
  level2Select: document.getElementById("level2Select"),
  level3Select: document.getElementById("level3Select"),
  createModeSingleButton: document.getElementById("createModeSingleButton"),
  createModeTextButton: document.getElementById("createModeTextButton"),
  singleCreatePanel: document.getElementById("singleCreatePanel"),
  textCreatePanel: document.getElementById("textCreatePanel"),
  createCardIdInput: document.getElementById("createCardIdInput"),
  createLevel1Input: document.getElementById("createLevel1Input"),
  createLevel2Input: document.getElementById("createLevel2Input"),
  createLevel3Input: document.getElementById("createLevel3Input"),
  createTextLevel1Input: document.getElementById("createTextLevel1Input"),
  createTextLevel2Input: document.getElementById("createTextLevel2Input"),
  createTextLevel3Input: document.getElementById("createTextLevel3Input"),
  singleQuestionInput: document.getElementById("singleQuestionInput"),
  singleAnswerInput: document.getElementById("singleAnswerInput"),
  singleDescriptionInput: document.getElementById("singleDescriptionInput"),
  singleImageIdInput: document.getElementById("singleImageIdInput"),
  generateSingleButton: document.getElementById("generateSingleButton"),
  singleAddButton: document.getElementById("singleAddButton"),
  singleDeleteButton: document.getElementById("singleDeleteButton"),
  textSourceInput: document.getElementById("textSourceInput"),
  textCountInput: document.getElementById("textCountInput"),
  textCountValue: document.getElementById("textCountValue"),
  generateTextButton: document.getElementById("generateTextButton"),
  createStatus: document.getElementById("createStatus"),
  syncButton: document.getElementById("syncButton"),
  startButton: document.getElementById("startButton"),
  studyPanel: document.getElementById("studyPanel"),
  flashcard: document.getElementById("flashcard"),
  flashcardInner: document.getElementById("flashcardInner"),
  frontTitle: document.getElementById("frontTitle"),
  frontText: document.getElementById("frontText"),
  frontImage: document.getElementById("frontImage"),
  frontImagePlaceholder: document.getElementById("frontImagePlaceholder"),
  backTitle: document.getElementById("backTitle"),
  backText: document.getElementById("backText"),
  backDescription: document.getElementById("backDescription"),
  rememberedButton: document.getElementById("rememberedButton"),
  yetButton: document.getElementById("yetButton"),
  cardCounter: document.getElementById("cardCounter"),
  onlineLamp: document.getElementById("onlineLamp"),
  onlineText: document.getElementById("onlineText"),
  cacheLamp: document.getElementById("cacheLamp"),
  cacheText: document.getElementById("cacheText"),
  queueLamp: document.getElementById("queueLamp"),
  queueText: document.getElementById("queueText")
};

// アプリ全体で共有する状態。
// settings: ユーザー設定、cards: 全カード、studyCards: 今回学習対象、index: 現在位置。
const state = {
  settings: loadSettings(),
  cards: [],
  studyCards: [],
  index: 0,
  flipped: false,
  createMode: "single",
  editablePickers: []
};

function normalizeSearchText(value) {
  return String(value || "").trim().toLocaleLowerCase("ja");
}

function optionMatchesInput(option, inputValue) {
  const query = normalizeSearchText(inputValue);
  if (!query) {
    return true;
  }

  const searchable = normalizeSearchText(`${option.value} ${option.label || ""}`);
  return searchable.includes(query);
}

function limitOptionsForInput(options, inputValue, limit = 60) {
  return options.filter((option) => option.value && optionMatchesInput(option, inputValue)).slice(0, limit);
}

function simpleOptions(values) {
  return values.map((value) => ({ value: String(value), label: "" }));
}

function cardIdOptions() {
  return state.cards
    .filter((card) => !isUuidLikeId(card.id))
    .slice()
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || ""), "ja", { numeric: true }))
    .map((card) => ({
      value: String(card.id || ""),
      label: [
        String(card.categoryL1 || "").trim(),
        String(card.question || "").trim()
      ].filter(Boolean).join(" / ")
    }));
}

function level1Options() {
  return simpleOptions(toUniqueSortedValues(state.cards.map((card) => card.categoryL1)));
}

function level2Options(level1Value) {
  const filtered = filterByLevels(state.cards, level1Value, "", "");
  return simpleOptions(toUniqueSortedValues(filtered.map((card) => card.categoryL2)));
}

function level3Options(level1Value, level2Value) {
  const filtered = filterByLevels(state.cards, level1Value, level2Value, "");
  return simpleOptions(toUniqueSortedValues(filtered.map((card) => card.categoryL3)));
}

function createEditablePicker(inputEl, getOptions, onSelect = () => {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "editable-picker";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  const toggleButton = document.createElement("button");
  toggleButton.className = "editable-picker-toggle";
  toggleButton.type = "button";
  toggleButton.setAttribute("aria-label", "候補を表示");
  toggleButton.textContent = "⌄";
  wrapper.appendChild(toggleButton);

  const listEl = document.createElement("div");
  listEl.className = "editable-picker-list";
  listEl.setAttribute("role", "listbox");
  listEl.hidden = true;
  wrapper.appendChild(listEl);

  const picker = {
    inputEl,
    listEl,
    isOpen: false,
    render(showAll = false) {
      const rawOptions = getOptions();
      const options = limitOptionsForInput(rawOptions, showAll ? "" : inputEl.value);
      listEl.innerHTML = "";

      if (options.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "editable-picker-empty";
        emptyEl.textContent = "一致する候補はありません";
        listEl.appendChild(emptyEl);
      } else {
        for (const option of options) {
          const itemButton = document.createElement("button");
          itemButton.className = "editable-picker-option";
          itemButton.type = "button";
          itemButton.setAttribute("role", "option");
          itemButton.dataset.value = option.value;

          const valueEl = document.createElement("span");
          valueEl.className = "editable-picker-value";
          valueEl.textContent = option.value;
          itemButton.appendChild(valueEl);

          if (option.label) {
            const labelEl = document.createElement("span");
            labelEl.className = "editable-picker-label";
            labelEl.textContent = option.label;
            itemButton.appendChild(labelEl);
          }

          itemButton.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            inputEl.value = option.value;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
            onSelect(option.value);
            picker.close();
          });

          listEl.appendChild(itemButton);
        }
      }

      listEl.hidden = !picker.isOpen;
    },
    open(showAll = false) {
      picker.isOpen = true;
      wrapper.classList.add("is-open");
      picker.render(showAll);
    },
    close() {
      picker.isOpen = false;
      wrapper.classList.remove("is-open");
      listEl.hidden = true;
    },
    refresh() {
      if (picker.isOpen) {
        picker.render();
      }
    }
  };

  inputEl.setAttribute("autocomplete", "off");
  inputEl.addEventListener("focus", () => picker.open());
  inputEl.addEventListener("input", () => picker.open());
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      picker.close();
    }
  });
  toggleButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (picker.isOpen) {
      picker.close();
    } else {
      inputEl.focus();
      picker.open(true);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!wrapper.contains(event.target)) {
      picker.close();
    }
  });

  return picker;
}

function setupEditablePickers() {
  state.editablePickers = [
    createEditablePicker(els.createCardIdInput, cardIdOptions, loadSingleCardForEdit),
    createEditablePicker(els.createLevel1Input, level1Options, () => {
      populateCreateLevel2(state.cards);
      populateCreateLevel3(state.cards);
    }),
    createEditablePicker(els.createLevel2Input, () => level2Options(els.createLevel1Input.value), () => {
      populateCreateLevel3(state.cards);
    }),
    createEditablePicker(els.createLevel3Input, () => level3Options(els.createLevel1Input.value, els.createLevel2Input.value)),
    createEditablePicker(els.createTextLevel1Input, level1Options, () => {
      populateCreateTextLevel2(state.cards);
      populateCreateTextLevel3(state.cards);
    }),
    createEditablePicker(els.createTextLevel2Input, () => level2Options(els.createTextLevel1Input.value), () => {
      populateCreateTextLevel3(state.cards);
    }),
    createEditablePicker(els.createTextLevel3Input, () => level3Options(els.createTextLevel1Input.value, els.createTextLevel2Input.value))
  ];
}

function updateEditablePickers() {
  state.editablePickers.forEach((picker) => picker.refresh());
}

// 保存済み設定を入力欄に反映する。
function bindSettingsToUi() {
  els.gasUrlInput.value = state.settings.gasUrl;
  els.aiGradeSelect.value = state.settings.aiGrade;
  els.aiDifficultySelect.value = state.settings.aiDifficulty;
  els.orderSelect.value = state.settings.order;
  els.directionSelect.value = state.settings.direction;
  els.filterSelect.value = state.settings.filter;
}

// 入力欄の値を読み取り、state と LocalStorage の両方に保存する。
function readSettingsFromUi() {
  state.settings = {
    gasUrl: els.gasUrlInput.value.trim(),
    order: els.orderSelect.value,
    direction: els.directionSelect.value,
    filter: els.filterSelect.value,
    aiGrade: els.aiGradeSelect.value,
    aiDifficulty: els.aiDifficultySelect.value
  };
  saveSettings(state.settings);
}

function applyConnectionAccordionState() {
  if (!els.connectionAccordion) {
    return;
  }
  els.connectionAccordion.open = !Boolean(state.settings.gasUrl);
}

function saveConnectionSettings() {
  readSettingsFromUi();
  if (!state.settings.gasUrl) {
    alert("GAS エンドポイントURLを入力してください。");
    return;
  }
  applyConnectionAccordionState();
}

async function saveAppConfigSettings() {
  readSettingsFromUi();
  if (!state.settings.gasUrl) {
    alert("先に GAS エンドポイントURLを入力してください。");
    return;
  }

  els.saveAppConfigButton.disabled = true;
  try {
    await updateAppConfig({
      gasUrl: state.settings.gasUrl,
      grade: state.settings.aiGrade,
      difficulty: state.settings.aiDifficulty
    });
    alert("AI設定をAppConfigに保存しました。");
  } catch (error) {
    console.error(error);
    alert(`AI設定の保存に失敗しました: ${error.message || error}`);
  } finally {
    els.saveAppConfigButton.disabled = false;
  }
}

function collapseStudyRange() {
  if (els.studyRangeAccordion) {
    els.studyRangeAccordion.open = false;
  }
}

// 上部のステータスランプを更新する。
// オンライン状態、ローカルカード件数、未送信キュー件数を可視化する。
async function refreshStatusLamps() {
  updateLamp(els.onlineLamp, els.onlineText, navigator.onLine, navigator.onLine ? "オンライン" : "オフライン");
  const localCount = await countCards();
  updateLamp(els.cacheLamp, els.cacheText, localCount > 0, `ローカル件数: ${localCount}`);
  const queueCount = getQueueLength();
  updateLamp(els.queueLamp, els.queueText, queueCount > 0, `同期待ち: ${queueCount}`);
}

// Level1/2/3 の選択肢を、現在のカード一覧から動的に生成する。
function populateRangeSelectors(cards) {
  const l1 = toUniqueSortedValues(cards.map((card) => card.categoryL1));
  setSelectOptions(els.level1Select, l1);
  populateLevel2(cards);
  populateLevel3(cards);
}

function populateCreateRangeSelectors(cards) {
  updateEditablePickers();
}

function isUuidLikeId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || "").trim());
}

function generateLocalCardId(cards) {
  let maxNum = 0;
  cards.forEach((card) => {
    const match = String(card.id || "").trim().match(/(\d+)$/);
    if (!match) {
      return;
    }
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > maxNum) {
      maxNum = num;
    }
  });

  const next = maxNum + 1;
  return `c${String(next).padStart(3, "0")}`;
}

function generateLocalCardIds(cards, count) {
  const ids = [];
  let baseCards = cards.slice();
  for (let i = 0; i < count; i += 1) {
    const id = generateLocalCardId(baseCards);
    ids.push(id);
    baseCards = baseCards.concat([{ id }]);
  }
  return ids;
}

// Level1 に応じて Level2 を絞り込む。
function populateLevel2(cards) {
  const filtered = filterByLevels(cards, els.level1Select.value, "", "");
  const l2 = toUniqueSortedValues(filtered.map((card) => card.categoryL2));
  setSelectOptions(els.level2Select, l2);
}

// Level1/2 に応じて Level3 を絞り込む。
function populateLevel3(cards) {
  const filtered = filterByLevels(cards, els.level1Select.value, els.level2Select.value, "");
  const l3 = toUniqueSortedValues(filtered.map((card) => card.categoryL3));
  setSelectOptions(els.level3Select, l3);
}

function populateCreateLevel2(cards) {
  updateEditablePickers();
}

function populateCreateTextLevel2(cards) {
  updateEditablePickers();
}

function populateCreateLevel3(cards) {
  updateEditablePickers();
}

function populateCreateTextLevel3(cards) {
  updateEditablePickers();
}

function showCreateStatus(message, isError = false) {
  if (!els.createStatus) {
    return;
  }
  els.createStatus.textContent = message;
  els.createStatus.style.color = isError ? "#b42318" : "var(--brand)";
}

function setCreateMode(mode) {
  state.createMode = mode;
  const isSingle = mode === "single";
  if (els.singleCreatePanel) {
    els.singleCreatePanel.hidden = !isSingle;
  }
  if (els.textCreatePanel) {
    els.textCreatePanel.hidden = isSingle;
  }
  if (els.createModeSingleButton) {
    els.createModeSingleButton.classList.toggle("is-active", isSingle);
  }
  if (els.createModeTextButton) {
    els.createModeTextButton.classList.toggle("is-active", !isSingle);
  }
}

function findCardById(cardId) {
  const id = String(cardId || "").trim();
  if (!id) {
    return null;
  }
  return state.cards.find((card) => String(card.id || "") === id) || null;
}

function clearSingleCreateForm({ keepId = false } = {}) {
  if (!keepId) {
    els.createCardIdInput.value = "";
  }
  els.createLevel1Input.value = "";
  els.createLevel2Input.value = "";
  els.createLevel3Input.value = "";
  els.singleQuestionInput.value = "";
  els.singleAnswerInput.value = "";
  els.singleDescriptionInput.value = "";
  els.singleImageIdInput.value = "";
}

function fillSingleCreateForm(card) {
  els.createCardIdInput.value = String(card.id || "");
  els.createLevel1Input.value = String(card.categoryL1 || "");
  els.createLevel2Input.value = String(card.categoryL2 || "");
  els.createLevel3Input.value = String(card.categoryL3 || "");
  els.singleQuestionInput.value = String(card.question || "");
  els.singleAnswerInput.value = String(card.answer || "");
  els.singleDescriptionInput.value = String(card.description || "");
  els.singleImageIdInput.value = String(card.imageId || "");
  populateCreateLevel2(state.cards);
  populateCreateLevel3(state.cards);
}

function loadSingleCardForEdit() {
  const id = String(els.createCardIdInput.value || "").trim();
  if (!id) {
    showCreateStatus("");
    return;
  }

  const card = findCardById(id);
  if (!card) {
    clearSingleCreateForm({ keepId: true });
    showCreateStatus("一致するカードIDがありません。新規カードとして保存できます。");
    return;
  }

  fillSingleCreateForm(card);
  showCreateStatus("既存カードを読み込みました。内容を修正して保存できます。");
}

function loadSingleCardForEditOnInput() {
  const card = findCardById(els.createCardIdInput.value);
  if (!card) {
    return;
  }
  fillSingleCreateForm(card);
  showCreateStatus("既存カードを読み込みました。内容を修正して保存できます。");
}

async function addSingleCard() {
  const idInput = String(els.createCardIdInput.value || "").trim();
  const existingCard = findCardById(idInput);
  const question = String(els.singleQuestionInput.value || "").trim();
  const answer = String(els.singleAnswerInput.value || "").trim();
  if (!question || !answer) {
    showCreateStatus("問題と解答を入力してください。", true);
    return;
  }

  const card = {
    id: idInput || generateLocalCardId(state.cards),
    categoryL1: els.createLevel1Input.value || "",
    categoryL2: els.createLevel2Input.value || "",
    categoryL3: els.createLevel3Input.value || "",
    question,
    answer,
    description: String(els.singleDescriptionInput.value || "").trim(),
    imageId: String(els.singleImageIdInput.value || "").trim(),
    status: existingCard ? String(existingCard.status || STATUS.yet) : STATUS.yet
  };

  await appendCards([card]);
  appendQueueItems([{
    type: "cardUpsert",
    id: card.id,
    categoryL1: card.categoryL1,
    categoryL2: card.categoryL2,
    categoryL3: card.categoryL3,
    question: card.question,
    answer: card.answer,
    description: card.description,
    imageId: card.imageId,
    status: card.status,
    timestamp: new Date().toISOString()
  }]);
  state.cards = await getAllCards();
  populateRangeSelectors(state.cards);
  populateCreateRangeSelectors(state.cards);
  await refreshStatusLamps();
  showCreateStatus(existingCard ? "ローカルのカードを更新しました。" : "ローカルにカードを1件追加しました。");
  clearSingleCreateForm();
}

async function deleteSingleCard() {
  const id = String(els.createCardIdInput.value || "").trim();
  const card = findCardById(id);
  if (!id || !card) {
    showCreateStatus("削除する既存カードIDを選択してください。", true);
    return;
  }

  if (!window.confirm(`カード ${id} を削除します。よろしいですか？`)) {
    return;
  }

  await deleteCard(id);
  appendQueueItems([{
    type: "cardDelete",
    id,
    timestamp: new Date().toISOString()
  }]);
  state.cards = await getAllCards();
  populateRangeSelectors(state.cards);
  populateCreateRangeSelectors(state.cards);
  await refreshStatusLamps();
  clearSingleCreateForm();
  showCreateStatus("ローカルのカードを削除しました。同期するとスプレッドシートにも反映されます。");
}

async function generateSingleAnswerMode() {
  if (!state.settings.gasUrl) {
    showCreateStatus("先に GAS のエンドポイントURLを設定してください。", true);
    return;
  }

  const question = String(els.singleQuestionInput.value || "").trim();
  if (!question) {
    showCreateStatus("問題を入力してください。", true);
    return;
  }

  showCreateStatus("AIで解答・解説を作成中です…");
  els.generateSingleButton.disabled = true;

  try {
    const response = await generateSingleAnswer({
      gasUrl: state.settings.gasUrl,
      question,
      categoryL1: els.createLevel1Input.value || "",
      categoryL2: els.createLevel2Input.value || "",
      categoryL3: els.createLevel3Input.value || ""
    });

    const answer = String(response.answer || "").trim();
    const description = String(response.description || "").trim();
    if (!answer && !description) {
      throw new Error("有効な解答・解説が生成されませんでした。");
    }

    if (answer) {
      els.singleAnswerInput.value = answer;
    }
    if (description) {
      els.singleDescriptionInput.value = description;
    }
    showCreateStatus("解答・解説を作成しました。内容を確認してカードを追加してください。");
  } catch (error) {
    showCreateStatus(error.message || "AI生成に失敗しました。", true);
  } finally {
    els.generateSingleButton.disabled = false;
  }
}

async function generateCardsFromTextMode() {
  if (!state.settings.gasUrl) {
    showCreateStatus("先に GAS のエンドポイントURLを設定してください。", true);
    return;
  }

  const text = String(els.textSourceInput.value || "").trim();
  const categoryL1 = String(els.createTextLevel1Input.value || "").trim();
  const categoryL2 = String(els.createTextLevel2Input.value || "").trim();
  const categoryL3 = String(els.createTextLevel3Input.value || "").trim();
  if (!text && (!categoryL1 || !categoryL2 || !categoryL3)) {
    showCreateStatus("ソーステキストを入力するか、L1/L2/L3をすべて入力してください。", true);
    return;
  }

  const count = Math.max(1, Math.min(20, Number(els.textCountInput.value || 5)));
  const beforeCount = state.cards.length;
  showCreateStatus("AI生成中です…");
  els.generateTextButton.disabled = true;

  try {
    const response = await generateCardsFromText({
      gasUrl: state.settings.gasUrl,
      text,
      categoryL1,
      categoryL2,
      categoryL3,
      numQuestions: count
    });

    const generatedCards = Array.isArray(response.cards) ? response.cards : [];
    if (generatedCards.length === 0) {
      throw new Error("生成結果が0件でした。" );
    }

    const fallbackIds = generateLocalCardIds(state.cards, generatedCards.length);
    const localCards = generatedCards.map((card, idx) => ({
      id: String(card.id || "").trim() || fallbackIds[idx],
      categoryL1,
      categoryL2,
      categoryL3,
      question: String(card.question || "").trim(),
      answer: String(card.answer || "").trim(),
      description: String(card.description || "").trim(),
      imageId: "",
      status: STATUS.yet
    })).filter((card) => card.question && card.answer);

    if (localCards.length === 0) {
      throw new Error("有効なカードが生成されませんでした。" );
    }

    await appendCards(localCards);
    await downloadAndStoreCards(state.settings);
    state.cards = await getAllCards();
    populateRangeSelectors(state.cards);
    populateCreateRangeSelectors(state.cards);
    showCreateStatus(`${localCards.length}件のカードを登録しました。`);
    els.textSourceInput.value = "";
  } catch (error) {
    if (String(error.message || error).includes("JSONPの応答がタイムアウト")) {
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        await downloadAndStoreCards(state.settings);
        state.cards = await getAllCards();
        populateRangeSelectors(state.cards);
        populateCreateRangeSelectors(state.cards);
        await refreshStatusLamps();

        const addedCount = Math.max(0, state.cards.length - beforeCount);
        if (addedCount > 0) {
          showCreateStatus(`${addedCount}件のカードを登録しました。`);
          els.textSourceInput.value = "";
          return;
        }
      } catch (syncError) {
        console.error("タイムアウト後の確認同期に失敗しました", syncError);
      }
    }
    showCreateStatus(error.message || "AI生成に失敗しました。", true);
  } finally {
    els.generateTextButton.disabled = false;
  }
}

function currentCard() {
  return state.studyCards[state.index] || null;
}

// 現在カードの描画。カードがない場合は学習パネルを隠す。
function showCurrentCard() {
  const card = currentCard();
  if (!card) {
    els.cardCounter.textContent = "0 / 0";
    els.studyPanel.hidden = true;
    return;
  }

  els.studyPanel.hidden = false;
  els.flashcardInner.classList.remove("is-flipped");
  state.flipped = false;
  void renderCard(card, state.settings, els);
  els.cardCounter.textContent = `${state.index + 1} / ${state.studyCards.length}`;
}

// 次のカードに進む。末尾まで行ったら先頭に戻る。
function moveNextCard() {
  if (state.studyCards.length === 0) {
    return;
  }
  state.index = (state.index + 1) % state.studyCards.length;
  showCurrentCard();
}

// 「覚えた / まだ」の判定処理。
// 1) IndexedDB を更新 2) 同期待ちキューへ追加 3) 次カードへ遷移。
async function recordJudgement(status) {
  const card = currentCard();
  if (!card) {
    return;
  }

  const ok = await updateCardStatus(card.id, status);
  if (!ok) {
    return;
  }

  const event = {
    id: card.id,
    status,
    timestamp: new Date().toISOString()
  };
  appendQueueItems([event]);

  card.status = status;
  await refreshStatusLamps();
  moveNextCard();
}

// 同期ボタン押下時の処理。
// 先に未送信キューをアップロードし、その後に最新カードをダウンロードする。
async function syncNow() {
  readSettingsFromUi();
  if (!state.settings.gasUrl) {
    alert("先に GAS のエンドポイントURLを設定してください。");
    return;
  }

  // file:// で直接開くとブラウザ制約で通信失敗しやすいため、先に案内を出す。
  if (location.protocol === "file:") {
    alert(
      "このページは file:// で開かれています。\n" +
        "同期するには、localhost または HTTPS で配信して開いてください。\n" +
        "例: VS Code の Live Server を利用"
    );
    return;
  }

  if (!navigator.onLine) {
    alert("現在オフラインのため、同期をスキップしました。");
    return;
  }

  let uploadError = null;

  // 1) 先に進捗アップロードを試す（失敗してもダウンロードは続行する）
  try {
    await uploadSyncQueue(state.settings);
  } catch (error) {
    uploadError = error;
    console.error("進捗アップロードに失敗", error);
  }

  // 2) カードダウンロードは必ず試す
  try {
    await downloadAndStoreCards(state.settings);
    state.cards = await getAllCards();
    populateRangeSelectors(state.cards);
    populateCreateRangeSelectors(state.cards);
    await refreshStatusLamps();
  } catch (error) {
    console.error(error);
    alert(`同期に失敗しました（ダウンロード段階）: ${error.message}`);
    return;
  }

  if (uploadError) {
    alert(
      "カード取得は成功しましたが、進捗アップロードに失敗しました。\n" +
        `理由: ${uploadError.message}\n` +
        "学習は続けられます。次回オンライン時に再同期してください。"
    );
    return;
  }

  alert("同期が完了しました。");
}

// 選択範囲と設定から、今回学習するカード配列を作る。
function startStudy() {
  readSettingsFromUi();

  if (els.connectionAccordion) {
    els.connectionAccordion.open = false;
  }

  collapseStudyRange();

  const filtered = filterByLevels(
    state.cards,
    els.level1Select.value,
    els.level2Select.value,
    els.level3Select.value
  );

  state.studyCards = applyStudyOptions(filtered, state.settings);
  state.index = 0;
  showCurrentCard();
}

// カードの表裏を反転する。
function flipCard() {
  if (!currentCard()) {
    return;
  }
  state.flipped = !state.flipped;
  els.flashcardInner.classList.toggle("is-flipped", state.flipped);
}

// 初期化処理。
// 画面反映、Service Worker登録、イベント接続、初回ステータス更新を行う。
async function init() {
  bindSettingsToUi();
  applyConnectionAccordionState();

  if ("serviceWorker" in navigator) {
    const isLocalDev = location.hostname === "127.0.0.1" || location.hostname === "localhost";

    if (isLocalDev) {
      // 開発中は古いキャッシュが原因で不具合切り分けが難しくなるため、SWを無効化する。
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));

      // 既存の controller が残っている場合は1回だけ再読み込みして切り離す。
      if (navigator.serviceWorker.controller && !sessionStorage.getItem("swResetDone")) {
        sessionStorage.setItem("swResetDone", "1");
        location.reload();
        return;
      }
    } else {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.error("Service Worker の登録に失敗しました", error);
      });
    }
  }

  setupEditablePickers();
  state.cards = await getAllCards();
  populateRangeSelectors(state.cards);
  populateCreateRangeSelectors(state.cards);
  setCreateMode(state.createMode);

  els.level1Select.addEventListener("change", () => {
    populateLevel2(state.cards);
    populateLevel3(state.cards);
  });

  els.level2Select.addEventListener("change", () => populateLevel3(state.cards));

  els.createLevel1Input.addEventListener("input", () => {
    populateCreateLevel2(state.cards);
    populateCreateLevel3(state.cards);
  });

  els.createLevel2Input.addEventListener("input", () => populateCreateLevel3(state.cards));

  els.createTextLevel1Input.addEventListener("input", () => {
    populateCreateTextLevel2(state.cards);
    populateCreateTextLevel3(state.cards);
  });

  els.createTextLevel2Input.addEventListener("input", () => populateCreateTextLevel3(state.cards));

  els.createModeSingleButton.addEventListener("click", () => setCreateMode("single"));
  els.createModeTextButton.addEventListener("click", () => setCreateMode("text"));
  els.createCardIdInput.addEventListener("input", loadSingleCardForEditOnInput);
  els.createCardIdInput.addEventListener("change", loadSingleCardForEdit);
  els.createCardIdInput.addEventListener("blur", loadSingleCardForEdit);
  els.generateSingleButton.addEventListener("click", () => generateSingleAnswerMode().catch((error) => {
    console.error(error);
    showCreateStatus(error.message || "AI生成に失敗しました。", true);
  }));
  els.singleAddButton.addEventListener("click", () => addSingleCard().catch((error) => {
    console.error(error);
    showCreateStatus(error.message || "カード保存に失敗しました。", true);
  }));
  els.singleDeleteButton.addEventListener("click", () => deleteSingleCard().catch((error) => {
    console.error(error);
    showCreateStatus(error.message || "カード削除に失敗しました。", true);
  }));
  els.generateTextButton.addEventListener("click", () => generateCardsFromTextMode().catch((error) => {
    console.error(error);
    showCreateStatus(error.message || "AI生成に失敗しました。", true);
  }));
  els.textCountInput.addEventListener("input", () => {
    if (els.textCountValue) {
      els.textCountValue.textContent = String(els.textCountInput.value || 5);
    }
  });

  for (const el of [
    els.gasUrlInput,
    els.aiGradeSelect,
    els.aiDifficultySelect,
    els.orderSelect,
    els.directionSelect,
    els.filterSelect
  ]) {
    el.addEventListener("change", readSettingsFromUi);
  }

  els.saveConnectionButton.addEventListener("click", saveConnectionSettings);
  els.saveAppConfigButton.addEventListener("click", () => saveAppConfigSettings().catch((error) => {
    console.error(error);
    alert(`AI設定の保存に失敗しました: ${error.message || error}`);
  }));

  els.syncButton.addEventListener("click", syncNow);
  els.startButton.addEventListener("click", startStudy);

  els.flashcard.addEventListener("click", flipCard);
  els.flashcard.addEventListener("keypress", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flipCard();
    }
  });

  els.rememberedButton.addEventListener("click", () => recordJudgement(STATUS.remembered));
  els.yetButton.addEventListener("click", () => recordJudgement(STATUS.yet));

  window.addEventListener("online", async () => {
    // オンライン復帰時は未送信キューがあれば自動アップロードする。
    await refreshStatusLamps();
    if (readSyncQueue().length > 0 && state.settings.gasUrl) {
      try {
        await uploadSyncQueue(state.settings);
        await refreshStatusLamps();
      } catch (error) {
        console.error("オンライン復帰時の自動アップロードに失敗しました", error);
      }
    }
  });

  window.addEventListener("offline", () => {
    refreshStatusLamps().catch(console.error);
  });

  await refreshStatusLamps();
}

init().catch((error) => {
  console.error("初期化に失敗しました", error);
  alert(`初期化に失敗しました: ${error.message}`);
});
