import { CARD_STORE, DB_NAME, DB_VERSION, STATUS } from "./constants.js";

let dbPromise;

// IndexedDB は接続コストがあるため、Promise を再利用して1回だけ開く。
function openDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CARD_STORE)) {
        const store = db.createObjectStore(CARD_STORE, { keyPath: "id" });
        store.createIndex("l1", "categoryL1");
        store.createIndex("l2", "categoryL2");
        store.createIndex("l3", "categoryL3");
        store.createIndex("status", "status");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function replaceAllCards(cards) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    // readwrite トランザクション内で「全削除 -> 全追加」を実行。
    // 途中失敗時は自動でロールバックされるため、既存データ破壊を避けやすい。
    const tx = db.transaction(CARD_STORE, "readwrite");
    const store = tx.objectStore(CARD_STORE);

    store.clear();
    for (const card of cards) {
      // 受信データに欠損があっても動くように、最低限の正規化を行う。
      const normalized = {
        id: String(card.id || card.rowId || crypto.randomUUID()),
        categoryL1: card.categoryL1 || "",
        categoryL2: card.categoryL2 || "",
        categoryL3: card.categoryL3 || "",
        question: card.question || "",
        answer: card.answer || "",
        description: card.description || "",
        imageId: card.imageId || "",
        status: card.status || STATUS.yet
      };
      store.put(normalized);
    }

    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("replaceAllCards aborted"));
    tx.onerror = () => reject(tx.error || new Error("replaceAllCards failed"));
  });
}

export async function getAllCards() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, "readonly");
    const request = tx.objectStore(CARD_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function countCards() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, "readonly");
    const request = tx.objectStore(CARD_STORE).count();
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

export async function updateCardStatus(cardId, status) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    // まず対象カードを1件取得してから status を更新する。
    const tx = db.transaction(CARD_STORE, "readwrite");
    const store = tx.objectStore(CARD_STORE);
    const getReq = store.get(String(cardId));

    getReq.onsuccess = () => {
      const data = getReq.result;
      if (!data) {
        resolve(false);
        return;
      }
      data.status = status;
      store.put(data);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve(true);
    tx.onabort = () => reject(tx.error || new Error("updateCardStatus aborted"));
    tx.onerror = () => reject(tx.error || new Error("updateCardStatus failed"));
  });
}
