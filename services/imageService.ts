
import { GoogleGenAI } from "@google/genai";

/**
 * 輔助函式：移除白色背景並轉為透明 PNG
 * 利用瀏覽器 Canvas API 進行像素處理
 */
const removeWhiteBackground = async (base64Data: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("無法取得 Canvas Context"));
                return;
            }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // 遍歷像素，將接近白色的部分轉為透明
            // 閾值設為 240 (可根據需求調整)
            const threshold = 240;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (r > threshold && g > threshold && b > threshold) {
                    data[i + 3] = 0; // Alpha 設為 0 (透明)
                }
            }

            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = base64Data;
    });
};

export const generateImage = async (prompt: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing VITE_GEMINI_API_KEY in environment variables");
    }

    const genAI = new GoogleGenAI({ apiKey });

    // 強化咒語：確保適合遊戲使用（去背、高品質、樂齡友善）
    const enhancedPrompt = `${prompt}, white background, game asset, high quality vector illustration, minimalist, bright colors, elderly friendly, 4K, high fidelity`;

    try {
        console.log("Generating image with prompt:", enhancedPrompt);
        const response = await genAI.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }]
        });

        // 取得候選結果
        const candidate = response.candidates?.[0];
        const part = candidate?.content?.parts?.[0];

        if (part?.inlineData) {
            // 成功的 Base64 資料
            const rawBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;

            // 執行去背處理
            try {
                return await removeWhiteBackground(rawBase64);
            } catch (removeBgErr) {
                console.warn("Background removal failed, returning raw image:", removeBgErr);
                return rawBase64;
            }
        }

        // 備援機制：如果 AI 只回傳了文字描述而沒生圖
        throw new Error("模型未回傳圖像數據，可能是模型不支持直接生成。");

    } catch (error: any) {
        console.error("Image Generation Error:", error);
        throw new Error("影像生成失敗：" + (error.message || "請檢查網路連線或 API Key 額度"));
    }
};
