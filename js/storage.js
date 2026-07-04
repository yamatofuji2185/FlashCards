import { SETTING_KEYS } from "./constants.js";

const DEFAULT_SETTINGS = {
  gasUrl: "",
  order: "sequential",
  direction: "normal",
  filter: "all"
};

function getValue(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? fallback : value;
}

// LocalStorage から設定値を読み込む。
// 値がなければ DEFAULT_SETTINGS を使う。
export function loadSettings() {
  return {
    gasUrl: getValue(SETTING_KEYS.gasUrl, DEFAULT_SETTINGS.gasUrl),
    order: getValue(SETTING_KEYS.order, DEFAULT_SETTINGS.order),
    direction: getValue(SETTING_KEYS.direction, DEFAULT_SETTINGS.direction),
    filter: getValue(SETTING_KEYS.filter, DEFAULT_SETTINGS.filter)
  };
}

// 現在設定を LocalStorage に保存する。
export function saveSettings(settings) {
  localStorage.setItem(SETTING_KEYS.gasUrl, settings.gasUrl || "");
  localStorage.setItem(SETTING_KEYS.order, settings.order || DEFAULT_SETTINGS.order);
  localStorage.setItem(SETTING_KEYS.direction, settings.direction || DEFAULT_SETTINGS.direction);
  localStorage.setItem(SETTING_KEYS.filter, settings.filter || DEFAULT_SETTINGS.filter);
}

// 同期待ちキューを配列として読み込む。
// JSON破損時は空配列で復旧する。
export function readSyncQueue() {
  const raw = localStorage.getItem(SETTING_KEYS.syncQueue);
  if (!raw) {
    return [];
  }
  try {
    const queue = JSON.parse(raw);
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

// キュー末尾にイベントを追記する。
export function appendQueueItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }
  const queue = readSyncQueue();
  queue.push(...items);
  localStorage.setItem(SETTING_KEYS.syncQueue, JSON.stringify(queue));
}

// キューを空配列に初期化する。
export function clearSyncQueue() {
  localStorage.setItem(SETTING_KEYS.syncQueue, JSON.stringify([]));
}

// UI表示用にキュー件数だけ取得する。
export function getQueueLength() {
  return readSyncQueue().length;
}
