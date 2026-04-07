
import { GoogleGenAI, Type } from "@google/genai";
import { GameConfig, GameMode, GameAction } from "../types";

const SYSTEM_INSTRUCTION = `你是一位資深的物理治療師與「度假感」遊戲設計師。
你的任務是為「HolidayBall (好樂球)」復健設備設計具備臨床價值且充滿樂趣的遊戲 JSON。

### **一、 遊戲引擎邏輯與模式 (Mode) 嚴格定義**
1. **DUAL (雙側獨立)**: 
   - 核心：左右手數據完全分流。畫面左、右各有一個獨立物件（如：左手採椰子、右手採鳳梨）。
   - 應用：雙側對稱訓練、單手孤立訓練。
2. **INDEPENDENT (節奏重置)**: 
   - 核心：隨機出現左或右目標。得分後必須「雙手完全放開 (< min_engagement)」才能進行下一次。
   - 應用：神經反應、抑制聯帶運動（如：打地鼠、接住落下的水果）。
3. **DIFF (平衡大師)**: 
   - 核心：計算左右壓力差 Math.abs(left - right)。動作必用 ROTATE。
   - **進階參數**：可設定 \`min_force\` 要求雙手皆須超過此門檻（例如 0.15）才開始計算平衡，避免作弊。
   - 應用：糾正力道不均、雙側協調（如：衝浪板平衡、天平秤重）。
4. **AVERAGE (導航者)**: 
   - 核心：雙手平均壓力 (left + right) / 2。動作必用 MOVE_Y。
   - 應用：耐力與精細控制（如：控制潛水艇升降、熱氣球飛行）。
5. **SUM (互動顯影)**: 
   - 核心：雙手總和 P_total = prs.left + prs.right (不需平均)。
   - **強制定制規則**：當使用者指令包含『合力』、『總和』、『不分左右捏爆』時，必須設定 mode: "SUM"。
   - 應用：簡單的主動動作誘發（如：捏爆泡泡、擠壓果汁）。

### **二、 視覺生成與度假感要求 (核心)**
1. **前景物件 (image_prompt)**: 
   - 描述須包含: "vibrant colors, solid 3D render, high contrast, thick black bold outline"。
   - 視覺主題：應圍繞度假、自然、休閒（如：熱帶水果、貝殼、露營裝備）。
2. **場景背景 (bg_image_prompt)**: 
   - 描述須包含: "very light colors, washed out, pastel palette, blurred background, low detail, holiday atmosphere"。
   - 視覺主題：如海灘、森林步道、度假村陽光。避免高飽和度，降低視覺干擾。
3. **透明度控制**: 
   - 前景 \`alpha\` 始終為 1.0。
   - 背景 \`bg_alpha\` 必須介於 0.15 ~ 0.3 之間，確保高對比度。

### **三、 AI 行為規範 (參數提取優先)**
1. **自動標記規則**:
   - 若模式為 \`INDEPENDENT\`，\`is_independent\` 必須為 \`true\`。
   - 若模式為 \`DUAL\`、\`DIFF\`、\`AVERAGE\`、\`SUM\`，則 \`is_independent\` 必須為 \`false\`。
2. **側性鎖定 (Side Logic)**:
   - 若提到「右手」，必須輸出 \`logic.side: "right"\` 並設 \`mode: "DUAL"\`。
   - 若提到「左手」，必須輸出 \`logic.side: "left"\` 並設 \`mode: "DUAL"\`。
   - 若提到「雙手獨立」或「左右不同物件」，必須輸出 \`logic.side: "both"\` 並設 \`mode: "DUAL"\`。
   - **硬性規定**：若使用者指令包含『雙手』且有明確的『左右物件』或要求『獨立訓練』時，mode 必須設定為 DUAL。只有在明確要求『合力、共同控制、雙手平均』時才使用 AVERAGE。
2. **數據提取**:
   - 數值精確化：『2秒』-> \`hold_time: 2.0\`；『0.8~0.9』-> \`target_range: [0.8, 0.9]\`。
3. **防代償機制**: 
   - 所有模式預設產出 \`min_engagement: 0.05\`。
4. **處方確認文字 (Prescription Summary)**:
   - 必須產出 \`prescription_summary\` 欄位。格式：『HolidayBall 度假任務：這是一個[模式]訓練，請[右手/左手/雙手]在力道[範圍]內維持[時間]秒，準備好出發了嗎？』

### **四、 設計原則**
1. **趣味度假化**: 將枯燥的復健動作轉化為長者嚮往的度假場景。
2. **臨床價值**: 標註訓練重點（如：掌內肌力、反應力）。
3. **確認與取消**: 必須生成完整的 JSON 以供前端顯示「處方確認卡片」。

### **五、 臨床進階監測**
1. **臨床總時限 (total_duration)**:
   - 目的：設定單次任務的總訓練時長。
   - 預設值：根據任務難度，分佈在 60 ~ 180 秒之間。
   - 硬性規定：必須在 logic 中產出此參數。

### **六、 歷史數據驅動之智能優化 (Auto-Optimization)**
1. **分析最近 5 筆紀錄**:
   - 若最近三筆成功率 (effective/total) 平均 > 80%，應將 \`hold_time\` 增加 0.5-1.0 秒，或將 \`target_range\` 區間縮小 0.05。
   - 若成功率 < 50%，應下調 \`hold_time\` 或放寬 \`target_range\`。
   - 若 \`compensationOccurred\` 為 \`true\`，則臨床建議應特別強調「注意姿勢」或切換至平衡模式 (\`DIFF\`) 以加強對稱性。
2. **AI 臨床建議 (Clinical Advice)**:
   - 根據歷史找出弱點（如：耐力不足、右側容易代償）。
   - 給予一段溫暖、具鼓勵性的「人名化」 clinical advice。格式：『[人名]您好，[觀察結果]！[今日優化重點]，準備好開始了嗎？』

回傳必須嚴格符合 JSON Schema。`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    game_name: {
      type: Type.STRING,
      description: "富有吸引力的度假主題遊戲名稱（如：椰子落下來了、沙灘排球平衡）"
    },
    description: {
      type: Type.STRING,
      description: "針對長輩設計的簡單玩法介紹，強調放鬆與趣味性"
    },
    prescription_summary: {
      type: Type.STRING,
      description: "處方確認文字。格式：『HolidayBall 任務：這是一個[模式]訓練，主題是[主題]，請[右手/左手/雙手]在力道[區間]維持[時間]秒。』"
    },
    theme: {
      type: Type.OBJECT,
      properties: {
        color: { type: Type.STRING, description: "主要互動物件的主色調 (格式：0xRRGGBB)" },
        bg_color: { type: Type.STRING, description: "背景場景底色 (格式：0xRRGGBB)" },
        asset_description: { type: Type.STRING, description: "視覺物件的風格細節（如：具有 3D 質感的成熟芒果）" },
        image_prompt: {
          type: Type.STRING,
          description: "物件提示詞，必須包含：vibrant colors, solid 3D render, high contrast, thick black bold outline"
        },
        bg_image_prompt: {
          type: Type.STRING,
          description: "背景提示詞，必須包含：very light colors, washed out, pastel palette, blurred background, low detail, holiday atmosphere"
        },
        alpha: {
          type: Type.NUMBER,
          description: "前景物件透明度，固定為 1.0 以確保清晰"
        },
        bg_alpha: {
          type: Type.NUMBER,
          description: "背景圖層透明度，需介於 0.15 ~ 0.3 之間以降低視覺干擾"
        },
      },
      required: ["color", "bg_color", "asset_description", "image_prompt", "bg_image_prompt", "alpha", "bg_alpha"],
    },
    logic: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          enum: ["DUAL", "AVERAGE", "DIFF", "SUM", "INDEPENDENT", "MVC_CALIBRATION"],
          description: "核心運算邏輯模式"
        },
        side: {
          type: Type.STRING,
          enum: ["left", "right", "both"],
          description: "指定訓練側，若為 left/right 則引擎需隱藏另一側物件"
        },
        target_range: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "精準壓力維持區間 [最小值, 最大值]，範圍 0.0 ~ 1.0"
        },
        hold_time: {
          type: Type.NUMBER,
          description: "在區間內需持續維持的秒數（如 2.0 代表兩秒）"
        },
        min_engagement: {
          type: Type.NUMBER,
          description: "最低出力門檻，預設 0.05，用於過濾雜訊與判斷主動參與"
        },
        is_independent: {
          type: Type.BOOLEAN,
          description: "是否啟動『放開重置』邏輯（INDEPENDENT 模式必為 true）"
        },
        difficulty_score: {
          type: Type.NUMBER,
          description: "綜合難度評分 (1-10)"
        },
        action: {
          type: Type.STRING,
          enum: ["SCALE", "MOVE_Y", "MOVE_X", "COLOR_SHIFT", "OPACITY", "PULSE", "ROTATE"],
          description: "壓力數據對應的視覺動作反饋"
        },
        total_duration: {
          type: Type.NUMBER,
          description: "本次度假任務總計時間（秒），建議範圍 60-180"
        },
        is_calibration: { 
          type: Type.BOOLEAN, 
          description: "是否為基準校準任務" 
        },
        min_force: {
          type: Type.NUMBER,
          description: "最小力道要求門檻 (0.0~1.0)，平衡或雙側模式下雙手皆須超過此值才計分"
        }
      },
      required: ["mode", "side", "target_range", "hold_time", "min_engagement", "action", "is_independent", "difficulty_score", "total_duration"],
    },
    rehab_focus: {
      type: Type.STRING,
      description: "說明此遊戲針對的復健功能（如：改善患側忽略、增強掌內肌耐力）"
    },
    difficulty_suggestion: {
      type: Type.STRING,
      description: "給治療師的臨床調整建議（如：若患者有震顫，建議下調目標區間）"
    },
    bg_image_url: {
      type: Type.STRING,
      description: "由 AI 生成或指定的背景圖片 URL"
    },
    clinical_advice: {
      type: Type.STRING,
      description: "給使用者的鼓勵性臨床建議語。需包含姓名，並提及過往數據觀察。"
    }
  },
  required: ["game_name", "description", "prescription_summary", "theme", "logic", "rehab_focus", "difficulty_suggestion", "bg_image_url", "clinical_advice"],
};

const suggestionSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description: "對患者最近 5 筆數據的深度臨床分析（如：耐力狀況、代償頻率、進步趨勢）"
    },
    clinical_advice: {
      type: Type.STRING,
      description: "給使用者的溫暖鼓勵性語句。格式：『[人名]您好，[觀察結果]！[今日優化重點]，準備好開始了嗎？』"
    },
    recommended_config: {
      type: Type.OBJECT,
      properties: {
        game_topic: { type: Type.STRING, description: "建議的遊戲主題（如：採椰子、平衡衝浪）" },
        mode: { type: Type.STRING, enum: ["DUAL", "AVERAGE", "DIFF", "SUM", "INDEPENDENT"] },
        target_range: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "優化後的目標壓力區間" },
        hold_time: { type: Type.NUMBER, description: "優化後的維持時間" },
        total_duration: { type: Type.NUMBER, description: "建議的總訓練時長" }
      },
      required: ["game_topic", "mode", "target_range", "hold_time", "total_duration"]
    }
  },
  required: ["analysis", "clinical_advice", "recommended_config"]
};

async function callWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for 429 or other retryable errors if needed
    // GoogleGenAI might return error.status, error.response.status, or error.code
    if (retries > 0 && (
      error.status === 429 ||
      error.code === 429 ||
      error.message?.includes('429') ||
      error.response?.status === 429
    )) {
      console.warn(`API Rate limit exceeded. Retrying in ${delay}ms... (${retries} retries left)`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const generateGame = async (prompt: string, history: any[] = []): Promise<{ config: GameConfig, clinicalAdvice: string }> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY in environment variables");
  }
  const ai = new GoogleGenAI({ apiKey });

  const historyContext = history.length > 0
    ? `\n使用者最近的訓練歷史：\n${JSON.stringify(history.map(h => ({
      timestamp: h.timestamp,
      game: h.game_name,
      achievement: h.best_achievement_rate,
      metrics: h.metrics
    })), null, 2)}`
    : "\n這是該受試者的第一次訓練。";

  const generate = () => ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: `請根據以下請求與歷史數據生成復健遊戲設計：\n請求：${prompt}\n${historyContext}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.8,
    },
  });

  const response = await callWithRetry(generate);

  try {
    const text = (response.text || "").trim();
    const data = JSON.parse(text);
    const clinicalAdvice = data.clinical_advice;
    delete data.clinical_advice; // 移除非 GameConfig 欄位
    return { config: data, clinicalAdvice };
  } catch (error) {
    console.error("Gemini Response Parse Error:", error, response);
    throw new Error("AI 生成的遊戲邏輯有誤，請再試一次。");
  }
};

export interface PatientSuggestion {
  analysis: string;
  clinical_advice: string;
  recommended_config: {
    game_topic: string;
    mode: string;
    target_range: [number, number];
    hold_time: number;
    total_duration: number;
  };
}

export const generatePatientSuggestion = async (patientName: string, history: any[]): Promise<PatientSuggestion> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey });

  const historyText = history.length > 0
    ? JSON.stringify(history.slice(0, 5).map(h => ({
      game: h.game_name,
      achievement: h.best_achievement_rate,
      compensation: h.metrics?.compensationOccurred,
      date: new Date(h.timestamp).toLocaleDateString()
    })), null, 2)
    : "無歷史數據";

  const prompt = `請為患者 ${patientName} 進行臨床分析。
歷史紀錄：
${historyText}

任務：
1. 分析最近數據中的弱點與進步。
2. 產出一段人名化的鼓勵建議。
3. 給出今日優化的訓練參數建議。
請嚴格遵守回傳 JSON 格式。`;

  const generate = () => ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: suggestionSchema,
    }
  });

  const response = await callWithRetry(generate);
  return JSON.parse(response.text || "{}");
};
