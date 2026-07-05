const SHEET_NAME = "Cards";
const CONFIG_SHEET = "AppConfig";

// 先頭から順に使用を試す候補モデル。
// Script Properties に GEMINI_MODEL があれば最優先で使用する。
const GEMINI_MODEL_CANDIDATES = [
  "gemini-3.5-flash",
  "gemini-3.1-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

// カード一覧を返すAPI。
// 返却形式は { ok, userId, cards }。
function doGet(e) {
  try {
    // mode=upload の場合は doGet 経由で進捗更新を受け付ける（JSONP対応用）。
    if (e && e.parameter && e.parameter.mode === "upload") {
      const payload = JSON.parse((e.parameter && e.parameter.payload) || "{}");
      const items = Array.isArray(payload.items) ? payload.items : [];
      const updated = applyStatusUpdates_(items);
      return respondForGet_(e, { ok: true, updated: updated });
    }

    const userId = (e && e.parameter && e.parameter.userId) || "";
    const cards = readCardsFromSheet_();
    return respondForGet_(e, { ok: true, userId: userId, cards: cards });
  } catch (error) {
    return respondForGet_(e, { ok: false, error: String(error) });
  }
}

// 学習進捗キューを受け取り、status 列を更新するAPI。
function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const items = Array.isArray(payload.items) ? payload.items : [];
    const updated = applyStatusUpdates_(items);
    return jsonResponse_({ ok: true, updated: updated });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

// Cards シートを読み込み、ヘッダー名ベースでJSON化する。
function readCardsFromSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet not found: " + SHEET_NAME);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const indexMap = {};
  headers.forEach(function (name, idx) {
    indexMap[String(name).trim()] = idx;
  });

  const required = [
    "id",
    "categoryL1",
    "categoryL2",
    "categoryL3",
    "question",
    "answer",
    "description",
    "imageId",
    "status"
  ];

  required.forEach(function (col) {
    if (typeof indexMap[col] !== "number") {
      throw new Error("Missing required column: " + col);
    }
  });

  return values.slice(1).map(function (row) {
    return {
      id: String(row[indexMap.id] || ""),
      categoryL1: String(row[indexMap.categoryL1] || ""),
      categoryL2: String(row[indexMap.categoryL2] || ""),
      categoryL3: String(row[indexMap.categoryL3] || ""),
      question: String(row[indexMap.question] || ""),
      answer: String(row[indexMap.answer] || ""),
      description: String(row[indexMap.description] || ""),
      imageId: String(row[indexMap.imageId] || ""),
      status: String(row[indexMap.status] || "yet")
    };
  });
}

// 送信された {id, status} を使って status 列を更新する。
function applyStatusUpdates_(items) {
  if (!items.length) {
    return 0;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet not found: " + SHEET_NAME);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return 0;
  }

  const headers = values[0];
  const indexMap = {};
  headers.forEach(function (name, idx) {
    indexMap[String(name).trim()] = idx;
  });

  const idCol = indexMap.id;
  const statusCol = indexMap.status;
  if (typeof idCol !== "number" || typeof statusCol !== "number") {
    throw new Error("Columns id/status not found");
  }

  const rowById = {};
  for (let r = 1; r < values.length; r += 1) {
    const id = String(values[r][idCol] || "");
    if (id) {
      rowById[id] = r + 1;
    }
  }

  const targets = [];
  items.forEach(function (item) {
    const id = String(item.id || "");
    const status = String(item.status || "");
    if (!id || !status) {
      return;
    }
    const row = rowById[id];
    if (row) {
      targets.push({ row: row, status: status });
    }
  });

  targets.forEach(function (t) {
    sheet.getRange(t.row, statusCol + 1).setValue(t.status);
  });

  return targets.length;
}

// スプレッドシート起動時に管理メニューを追加する。
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FlashCard 管理")
    .addItem("Q&A をGeminiで生成", "generateQaRows")
    .addItem("解説をGeminiで補完", "fillDescriptions")
    .addToUi();
}

// 空行へ Q&A データをまとめて追加する。
function generateQaRows() {
  const ui = SpreadsheetApp.getUi();

  const subjectInput = ui.prompt("Q&A生成", "教科を入力してください（例: 国語, 理科）", ui.ButtonSet.OK_CANCEL);
  if (subjectInput.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const subject = String(subjectInput.getResponseText() || "").trim();
  if (!subject) {
    ui.alert("教科が未入力です。処理を中断しました。");
    return;
  }

  const genreInput = ui.prompt("Q&A生成", "ジャンル/単元を入力してください（例: 四字熟語, 植物）", ui.ButtonSet.OK_CANCEL);
  if (genreInput.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const genre = String(genreInput.getResponseText() || "").trim();
  if (!genre) {
    ui.alert("ジャンル/単元が未入力です。処理を中断しました。");
    return;
  }

  const countInput = ui.prompt("Q&A生成", "問題数を入力してください（1-100）", ui.ButtonSet.OK_CANCEL);
  if (countInput.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const requestedCount = Number(String(countInput.getResponseText() || "").trim());
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100) {
    ui.alert("問題数は 1 から 100 の整数で入力してください。");
    return;
  }

  const config = readConfig_();
  const prompt =
    "Create flashcard Q&A data for school learning. " +
    "Subject: " +
    subject +
    ". Genre/unit: " +
    genre +
    ". " +
    "Generate exactly " +
    requestedCount +
    " items. " +
    "Audience grade: " +
    config.grade +
    ". Difficulty: " +
    config.level +
    ". " +
    "Return JSON array with keys categoryL1, categoryL2, categoryL3, question, answer, description.";

  const generated = callGemini_(prompt);
  const rows = Array.isArray(generated) ? generated.slice(0, requestedCount) : [];
  if (rows.length === 0) {
    ui.alert("生成結果が0件でした");
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const indexMap = buildHeaderIndexMap_(headers);
  const idCol = getColumnIndexOrThrow_(indexMap, "id");

  const generatedIds = generateSequentialIds_(sheet, idCol, rows.length);

  const startRow = sheet.getLastRow() + 1;
  const values = rows.map(function (row, idx) {
    return [
      generatedIds[idx],
      row.categoryL1 || "",
      row.categoryL2 || "",
      row.categoryL3 || "",
      row.question || "",
      row.answer || "",
      row.description || "",
      row.imageId || "",
      "yet"
    ];
  });

  sheet.getRange(startRow, 1, values.length, 9).setValues(values);
  ui.alert("生成行数: " + values.length + "\n教科: " + subject + "\nジャンル: " + genre);
}

// question と answer はあるが description が空欄の行だけを補完する。
function fillDescriptions() {
  const config = readConfig_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return;
  }

  const headers = values[0];
  const indexMap = buildHeaderIndexMap_(headers);
  const questionCol = indexMap.question;
  const answerCol = indexMap.answer;
  const descCol = indexMap.description;
  if (typeof questionCol !== "number" || typeof answerCol !== "number" || typeof descCol !== "number") {
    throw new Error("Columns question/answer/description not found");
  }

  for (let r = 1; r < values.length; r += 1) {
    const question = String(values[r][questionCol] || "");
    const answer = String(values[r][answerCol] || "");
    const description = String(values[r][descCol] || "");

    if (!question || !answer || description) {
      continue;
    }

    const prompt =
      "Explain this learning pair for " +
      config.grade +
      " and level " +
      config.level +
      ": Q=" +
      question +
      " A=" +
      answer;
    const text = callGeminiText_(prompt);
    if (text) {
      sheet.getRange(r + 1, descCol + 1).setValue(text);
    }
  }
}

// ヘッダー名を trim して列番号へ変換する共通ヘルパー。
function buildHeaderIndexMap_(headers) {
  const map = {};
  headers.forEach(function (name, idx) {
    map[String(name).trim()] = idx;
  });
  return map;
}

function getColumnIndexOrThrow_(indexMap, name) {
  const col = indexMap[name];
  if (typeof col !== "number") {
    throw new Error("Missing required column: " + name);
  }
  return col;
}

// 既存IDの末尾数字を見て、c001, c002 ... の連番IDを採番する。
function generateSequentialIds_(sheet, idCol, count) {
  const lastRow = sheet.getLastRow();
  const existing = lastRow > 1 ? sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues() : [];

  let maxNum = 0;
  existing.forEach(function (row) {
    const id = String(row[0] || "").trim();
    const m = id.match(/(\d+)$/);
    if (m) {
      const num = Number(m[1]);
      if (Number.isFinite(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  const width = Math.max(3, String(maxNum + count).length);
  const ids = [];
  for (let i = 1; i <= count; i += 1) {
    const n = maxNum + i;
    ids.push("c" + String(n).padStart(width, "0"));
  }
  return ids;
}

// AppConfig から対象学年と難易度を読み込む。
function readConfig_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    return { grade: "middle", level: "standard" };
  }

  const values = sheet.getDataRange().getValues();
  const map = {};
  values.forEach(function (row) {
    map[String(row[0] || "")] = String(row[1] || "");
  });

  return {
    grade: map.targetGrade || "middle",
    level: map.difficulty || "standard"
  };
}

// Gemini API を呼び出し、JSONレスポンスを返す共通処理。
function callGeminiApi_(payload, responseMimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY in Script Properties");
  }

  const preferredModel = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL");
  const models = preferredModel
    ? [preferredModel].concat(GEMINI_MODEL_CANDIDATES.filter(function (m) {
        return m !== preferredModel;
      }))
    : GEMINI_MODEL_CANDIDATES.slice();

  const body = {
    contents: payload.contents
  };

  if (responseMimeType) {
    body.generationConfig = {
      responseMimeType: responseMimeType
    };
  }

  let lastError = "";

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

    const response = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const raw = response.getContentText();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("Gemini API response is not JSON. status=" + status + " body=" + raw.slice(0, 300));
    }

    if (status >= 200 && status < 300) {
      return json;
    }

    const message = json && json.error && json.error.message ? json.error.message : raw.slice(0, 300);
    lastError = "model=" + model + " status=" + status + " message=" + message;

    // モデル未対応(404)の場合は次候補へ、それ以外は即エラーにする。
    if (status !== 404) {
      throw new Error("Gemini API error. " + lastError);
    }
  }

  throw new Error("Gemini API error. all model candidates failed. " + lastError);
}

// candidates から text を安全に取り出す。
function extractGeminiText_(json) {
  const candidates = json && json.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const blockReason = json && json.promptFeedback && json.promptFeedback.blockReason;
    if (blockReason) {
      throw new Error("Gemini blocked prompt: " + blockReason);
    }
    throw new Error("Gemini response has no candidates");
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const parts = candidates[i] && candidates[i].content && candidates[i].content.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (let j = 0; j < parts.length; j += 1) {
      if (typeof parts[j].text === "string" && parts[j].text.trim()) {
        return parts[j].text.trim();
      }
    }
  }

  const finishReason = candidates[0] && candidates[0].finishReason;
  throw new Error("Gemini text not found in candidates. finishReason=" + String(finishReason || "unknown"));
}

// ```json ... ``` のようなコードブロック付きJSONを剥がして parse する。
function parseJsonText_(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

// Gemini に JSON 形式の回答を要求し、配列として返す。
function callGemini_(prompt) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  const json = callGeminiApi_(payload, "application/json");
  const text = extractGeminiText_(json);

  try {
    return parseJsonText_(text);
  } catch {
    throw new Error("Gemini response parse failed. text=" + text.slice(0, 300));
  }
}

// Gemini に自然文を生成させ、文字列として返す。
function callGeminiText_(prompt) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const json = callGeminiApi_(payload);
  return extractGeminiText_(json);
}

// JSONレスポンス共通化ヘルパー。
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// doGet専用: callback パラメータがあれば JSONP で返す。
function respondForGet_(e, obj) {
  const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback) : "";
  if (!callback) {
    return jsonResponse_(obj);
  }

  // コールバック関数名の最小バリデーション。
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    throw new Error("Invalid callback parameter");
  }

  const script = callback + "(" + JSON.stringify(obj) + ");";
  return ContentService.createTextOutput(script).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
