const express = require("express");
const multer = require("multer");
const { InferenceClient } = require("@huggingface/inference");

const router = express.Router();

const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
const hf = HF_TOKEN ? new InferenceClient(HF_TOKEN) : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const supportedImage = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (supportedImage) return cb(null, true);
    return cb(new Error("JPG, PNG yoki WebP formatidagi rasm yuklang."));
  },
});

function extractJson(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part.text || "").join("\n")
    : content;
  if (typeof text !== "string") throw new Error("AI tavsiyalarni matn ko‘rinishida qaytarmadi.");

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI tavsiyalarini o‘qib bo‘lmadi.");

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed.styles) || parsed.styles.length !== 3) {
    throw new Error("AI aynan 3 ta soch turmagi tavsiya qilmadi.");
  }

  return parsed.styles.map((style) => {
    const name = String(style.name || "").trim().slice(0, 80);
    const description = String(style.description || "").trim().slice(0, 220);
    const visualPrompt = String(style.visualPrompt || "").trim().slice(0, 260);
    if (!name || !description || !visualPrompt) throw new Error("AI tavsiyasida kerakli ma’lumot yetishmayapti.");
    return { name, description, visualPrompt };
  });
}

function getImageMimeType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

router.post("/chat", async (req, res) => {
  try {
    if (!hf) return res.status(503).json({ success: false, message: "AI xizmati hozir sozlanmagan." });
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ success: false, message: "Savol yuborilmadi." });

    const response = await hf.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages: [
        { role: "system", content: "Sen USTARA platformasining AI yordamchisisan. Sartaroshlik va platforma bo‘yicha o‘zbek tilida qisqa, foydali maslahat ber." },
        { role: "user", content: message.slice(0, 2000) },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return res.json({ success: true, answer: response?.choices?.[0]?.message?.content || "Kechirasiz, hozir javob bera olmadim." });
  } catch (error) {
    console.error("AI chat request failed:", error?.message);
    return res.status(503).json({ success: false, message: "AI hozir band. Birozdan so‘ng qayta urinib ko‘ring." });
  }
});

router.post("/hairstyle", upload.single("image"), async (req, res) => {
  let stage = "suratni tahlil qilish";
  try {
    if (!hf) return res.status(503).json({ success: false, message: "AI xizmati sozlanmagan. Serverda HF_TOKEN kalitini sozlash kerak." });
    if (!req.file) return res.status(400).json({ success: false, message: "Rasm yuklanmadi." });

    // Reject files whose actual content does not match a supported image format.
    const imageMimeType = getImageMimeType(req.file.buffer);
    if (!imageMimeType) return res.status(400).json({ success: false, message: "Yuklangan fayl haqiqiy JPG, PNG yoki WebP rasm emas." });

    const imageDataUrl = `data:${imageMimeType};base64,${req.file.buffer.toString("base64")}`;
    const analysis = await hf.chatCompletion({
      model: "Qwen/Qwen2.5-VL-7B-Instruct",
      messages: [
        {
          role: "system",
          content: "Sen USTARA uchun tajribali, ehtiyotkor sartarosh-maslahatchisan. Suratdagi odamning yuzi va ko‘rinishiga mos aynan 3 xil, bir-biridan farqli soch turmagini tanla. Taxminni faktdek aytma. O‘zbek tilida javob ber. Faqat JSON qaytar: {\"styles\":[{\"name\":\"qisqa nom\",\"description\":\"nima uchun mosligi\",\"visualPrompt\":\"ingliz tilida tasvir uchun qisqa soch kesimi va turmak tavsifi\"}]} .",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Suratdagi odamning yuz shakli, hozirgi sochi va ko‘rinishini hisobga olib 3 ta mos, turlicha soch turmagi tavsiya qil. Boshqa JSON yoki izoh yozma." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.5,
    });

    const styles = extractJson(analysis?.choices?.[0]?.message?.content);
    const results = [];
    stage = "uchta ko‘rinish rasmini yaratish";

    // Sequential generation reduces burst load and helps stay within free provider quotas.
    for (const style of styles) {
      const generated = await hf.imageToImage({
        model: "Qwen/Qwen-Image-Edit",
        provider: "fal-ai",
        inputs: new Blob([req.file.buffer], { type: imageMimeType }),
        parameters: {
          prompt: `Edit only the hairstyle in the reference photo. Give the person this haircut and style: ${style.visualPrompt}. Preserve the same person's identity, face, skin tone, age, expression, head shape, pose, camera angle, clothes and background. Keep the result photorealistic and natural. Do not change facial features, do not add text, do not create a collage.`,
        },
      });
      const bytes = Buffer.from(await generated.arrayBuffer());
      if (!bytes.length) throw new Error("Rasm yaratish xizmati bo‘sh natija qaytardi.");
      results.push({
        name: style.name,
        description: style.description,
        image: `data:${getImageMimeType(bytes) || "image/png"};base64,${bytes.toString("base64")}`,
      });
    }

    return res.json({ success: true, styles: results });
  } catch (error) {
    const status = error?.httpResponse?.status;
    const diagnosticCode = `AI_${stage === "suratni tahlil qilish" ? "ANALYSIS" : "IMAGE"}_${status || "UNKNOWN"}`;
    console.error("AI hairstyle generation failed:", diagnosticCode, error?.message || "Unknown error");
    if (status === 401 || status === 403) {
      return res.status(503).json({ success: false, message: "AI kalitida rasm yaratish huquqi yo‘q. HF_TOKEN uchun Inference Providers ruxsatini yoqing." });
    }
    if (status === 429) {
      return res.status(429).json({ success: false, message: "AI bepul limiti vaqtincha tugadi. Keyinroq qayta urinib ko‘ring." });
    }
    if (status === 402) {
      return res.status(429).json({ success: false, code: diagnosticCode, message: "AI uchun berilgan bepul kredit tugadi. Keyingi oylik limit yangilangach qayta urinib ko‘ring." });
    }
    if (status === 404) {
      return res.status(503).json({ success: false, code: diagnosticCode, message: "AI modeli hozirda ulanmayapti. Serverdagi model sozlamasini tekshirish kerak." });
    }
    return res.status(503).json({
      success: false,
      code: diagnosticCode,
      message: `AI ${stage} bosqichida xatoga uchradi. Birozdan so‘ng qayta urinib ko‘ring.`,
    });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "Rasm hajmi 5 MB dan oshmasligi kerak." });
  }
  if (err) return res.status(400).json({ success: false, message: err.message || "Rasmni yuklashda xatolik." });
  return next();
});

module.exports = router;
