import { buildDriveImageUrl, IMAGE_CACHE_NAME } from "./constants.js";
import { countCards, replaceAllCards } from "./db.js";
import { fetchCardsFromGas, postProgressToGas } from "./api.js";
import { clearSyncQueue, readSyncQueue } from "./storage.js";

// クラウドから最新カードを取得し、ローカルDBへ安全に保存する。
export async function downloadAndStoreCards(settings) {
  const cards = await fetchCardsFromGas(settings);
  await replaceAllCards(cards);
  await prefetchImages(cards);
  return countCards();
}

// 同期待ちキューをクラウドへ送信する。
// 成功時のみキューを消すことで、通信失敗時の再送が可能になる。
export async function uploadSyncQueue(settings) {
  const queue = readSyncQueue();
  if (queue.length === 0) {
    return { updated: 0, skipped: true };
  }

  const response = await postProgressToGas({
    gasUrl: settings.gasUrl,
    userId: settings.userId,
    items: queue
  });

  clearSyncQueue();
  return response;
}

// 画像IDがあるカードだけを先読みし、Cache API に保存する。
// オフライン時でも画像表示できるようにするための処理。
export async function prefetchImages(cards) {
  const imageUrls = cards
    .map((card) => buildDriveImageUrl(card.imageId))
    .filter((url) => Boolean(url));

  if (imageUrls.length === 0 || typeof caches === "undefined") {
    return;
  }

  const cache = await caches.open(IMAGE_CACHE_NAME);
  for (const url of imageUrls) {
    const exists = await cache.match(url);
    if (!exists) {
      try {
        const response = await fetch(url, { mode: "no-cors" });
        await cache.put(url, response.clone());
      } catch {
        // 1件失敗しても全体同期は継続する。
      }
    }
  }
}
