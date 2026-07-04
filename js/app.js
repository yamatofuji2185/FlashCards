import { STATUS } from "./constants.js";
import { getAllCards, updateCardStatus, countCards } from "./db.js";
import { downloadAndStoreCards, uploadSyncQueue } from "./sync.js";
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
  gasUrlInput: document.getElementById("gasUrlInput"),
  orderSelect: document.getElementById("orderSelect"),
  directionSelect: document.getElementById("directionSelect"),
  filterSelect: document.getElementById("filterSelect"),
  level1Select: document.getElementById("level1Select"),
  level2Select: document.getElementById("level2Select"),
  level3Select: document.getElementById("level3Select"),
  syncButton: document.getElementById("syncButton"),
  startButton: document.getElementById("startButton"),
  studyPanel: document.getElementById("studyPanel"),
  flashcard: document.getElementById("flashcard"),
  flashcardInner: document.getElementById("flashcardInner"),
  frontTitle: document.getElementById("frontTitle"),
  frontText: document.getElementById("frontText"),
  frontImage: document.getElementById("frontImage"),
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
  flipped: false
};

// 保存済み設定を入力欄に反映する。
function bindSettingsToUi() {
  els.gasUrlInput.value = state.settings.gasUrl;
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
    filter: els.filterSelect.value
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
  renderCard(card, state.settings, els);
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

  state.cards = await getAllCards();
  populateRangeSelectors(state.cards);

  els.level1Select.addEventListener("change", () => {
    populateLevel2(state.cards);
    populateLevel3(state.cards);
  });

  els.level2Select.addEventListener("change", () => populateLevel3(state.cards));

  for (const el of [
    els.gasUrlInput,
    els.orderSelect,
    els.directionSelect,
    els.filterSelect
  ]) {
    el.addEventListener("change", readSettingsFromUi);
  }

  els.saveConnectionButton.addEventListener("click", saveConnectionSettings);

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
