function normalizeGasUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    throw new Error("GASのURLが未設定です。接続設定にデプロイURLを入力してください。");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("GASのURL形式が不正です。https://script.google.com/.../exec を設定してください。");
  }

  if (url.protocol !== "https:") {
    throw new Error("GASのURLは https で始まる必要があります。");
  }

  return url;
}

function buildNetworkHint(url) {
  const hints = [
    "ネットワーク通信に失敗しました。",
    "確認項目:",
    "1) GASをウェブアプリとしてデプロイ済みか",
    "2) URLが /exec で終わっているか（/dev ではないか）",
    "3) ブラウザで直接URLを開いてJSONが返るか",
    "4) アプリを file:// ではなく HTTPS/localhost で開いているか"
  ];

  if (url.pathname.endsWith("/dev")) {
    hints.push("現在 /dev URL が設定されています。/exec URL に変更してください。");
  }

  return hints.join("\n");
}

function executeJsonp(endpoint, extraParams = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__flashcardJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONPの応答がタイムアウトしました。GASのデプロイURLを確認してください。"));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete window[callbackName];
    };

    const url = new URL(endpoint.toString());
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const script = document.createElement("script");
    url.searchParams.set("callback", callbackName);
    script.src = url.toString();
    script.async = true;

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONPの読み込みに失敗しました。GAS URLまたは公開設定を確認してください。"));
    };

    document.head.appendChild(script);
  });
}

function fetchCardsViaJsonp(endpoint) {
  return executeJsonp(endpoint);
}

async function fetchWithHints(url, options, label) {
  try {
    const response = await fetch(url.toString(), options);
    if (!response.ok) {
      throw new Error(`${label} に失敗しました（HTTP ${response.status}）。`);
    }
    return response;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(buildNetworkHint(url));
    }
    throw error;
  }
}

// GAS の doGet にアクセスしてカード配列を取得する。
export async function fetchCardsFromGas({ gasUrl, userId }) {
  const endpoint = normalizeGasUrl(gasUrl);
  if (userId) {
    endpoint.searchParams.set("userId", userId);
  }

  // GET は JSONP のみを使う。CORS制約での失敗を根本的に回避するため。
  let payload;
  try {
    payload = await fetchCardsViaJsonp(endpoint);
  } catch (error) {
    throw new Error(
      "カード取得(JSONP)に失敗しました。\n" +
        "原因候補:\n" +
        "1) GASの最新コードが再デプロイされていない\n" +
        "2) /exec URLではなく古いURLを使っている\n" +
        "3) Webアプリのアクセス権が不足している\n" +
        `詳細: ${error.message || error}`
    );
  }

  if (!Array.isArray(payload.cards)) {
    throw new Error("GASレスポンス形式が不正です。{ cards: [] } 形式で返してください。");
  }
  return payload.cards;
}

// GAS の doPost に同期待ちキューを送信する。
export async function postProgressToGas({ gasUrl, userId, items }) {
  const endpoint = normalizeGasUrl(gasUrl);
  if (!Array.isArray(items) || items.length === 0) {
    return { updated: 0 };
  }

  // URL長制限を避けるため、進捗は小分けで JSONP 送信する。
  const chunkSize = 20;
  let totalUpdated = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const payload = JSON.stringify({ userId, items: chunk });

    let result;
    try {
      result = await executeJsonp(endpoint, {
        mode: "upload",
        payload: payload
      });
    } catch (error) {
      throw new Error(`進捗送信(JSONP)に失敗しました: ${error.message || error}`);
    }

    if (!result || result.ok !== true) {
      throw new Error(`進捗送信(JSONP)でエラーが返されました: ${result && result.error ? result.error : "unknown error"}`);
    }

    totalUpdated += Number(result.updated || 0);
  }

  return { ok: true, updated: totalUpdated };
}

export async function generateCardsFromText({ gasUrl, text, categoryL1, categoryL2, categoryL3, numQuestions }) {
  const endpoint = normalizeGasUrl(gasUrl);
  const payload = JSON.stringify({
    type: "generateFromText",
    text,
    categoryL1,
    categoryL2,
    categoryL3,
    numQuestions
  });

  // GAS の POST はブラウザ側で CORS 失敗になってもサーバー処理だけ完了することがある。
  // 書き込み系のAI生成は二重実行を避けるため、最初から JSONP だけを使う。
  const result = await executeJsonp(endpoint, {
    mode: "generateFromText",
    payload
  }, 120000);

  if (!result || result.ok !== true) {
    throw new Error(`AI生成(JSONP)でエラーが返されました: ${result && result.error ? result.error : "unknown error"}`);
  }

  return result;
}

export async function generateSingleAnswer({ gasUrl, question, categoryL1, categoryL2, categoryL3 }) {
  const endpoint = normalizeGasUrl(gasUrl);
  const payload = JSON.stringify({
    type: "generateSingleAnswer",
    question,
    categoryL1,
    categoryL2,
    categoryL3
  });

  try {
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: payload
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.ok === true) {
        return data;
      }
    }
  } catch {
    // CORS やネットワークで失敗した場合は JSONP フォールバックへ移行する。
  }

  const result = await executeJsonp(endpoint, {
    mode: "generateSingleAnswer",
    payload
  }, 120000);

  if (!result || result.ok !== true) {
    throw new Error(`AI生成(JSONP)でエラーが返されました: ${result && result.error ? result.error : "unknown error"}`);
  }

  return result;
}

export async function updateAppConfig({ gasUrl, grade, difficulty }) {
  const endpoint = normalizeGasUrl(gasUrl);
  const payload = JSON.stringify({
    type: "updateAppConfig",
    grade,
    difficulty
  });

  const result = await executeJsonp(endpoint, {
    mode: "updateAppConfig",
    payload
  });

  if (!result || result.ok !== true) {
    throw new Error(`AppConfig更新でエラーが返されました: ${result && result.error ? result.error : "unknown error"}`);
  }

  return result;
}
