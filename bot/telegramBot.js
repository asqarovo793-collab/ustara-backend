/**
 * Telegram Bot API integratsiyasi.
 * Bot sozlangan bo'lsa, uzun so'rovli polling orqali /start havolalarini qabul qiladi.
 */

const Barber = require("../models/Barber");

let token = "";
let polling = false;
let offset = 0;

const telegramRequest = async (method, body, signal) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram ${method} so'rovi bajarilmadi`);
  }
  return result.result;
};

const sendMessage = async (chatId, text) => {
  if (!token) throw new Error("Telegram bot sozlanmagan");
  return telegramRequest("sendMessage", { chat_id: chatId, text });
};

const replyToStart = async (message) => {
  const chatId = message.chat.id;
  const match = (message.text || "").match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
  const code = match?.[1]?.trim();

  if (!code) {
    await sendMessage(
      chatId,
      "Assalomu alaykum! Bu Ustara platformasining rasmiy boti.\n\nHisobingizni ulash uchun saytda 'Sozlamalar' bo'limidagi 'Telegram botni ulash' havolasini bosing."
    );
    return;
  }

  const barber = await Barber.findOne({ telegramLinkCode: code });
  if (!barber) {
    await sendMessage(chatId, "❌ Havola yaroqsiz yoki muddati o'tgan. Saytdan qaytadan urinib ko'ring.");
    return;
  }

  barber.telegramChatId = String(chatId);
  await barber.save();
  await sendMessage(
    chatId,
    `✅ Hisobingiz ulandi!\n\n💈 Salon: ${barber.salonName}\n\nEndi yangi bronlar haqida shu yerga xabar kelib turadi.`
  );
};

const pollUpdates = async () => {
  while (polling) {
    try {
      const updates = await telegramRequest(
        "getUpdates",
        { offset, timeout: 25, allowed_updates: ["message"] },
        AbortSignal.timeout(35_000)
      );

      for (const update of updates) {
        offset = update.update_id + 1;
        if (!update.message?.text?.startsWith("/start")) continue;
        try {
          await replyToStart(update.message);
        } catch (error) {
          console.error("❌ Telegram ulash xatosi:", error.message);
          await sendMessage(update.message.chat.id, "Xatolik yuz berdi, keyinroq urinib ko'ring.").catch(() => {});
        }
      }
    } catch (error) {
      if (!polling) break;
      console.error("❌ Telegram polling xatosi:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
};

const initTelegramBot = () => {
  token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    console.log("ℹ️  TELEGRAM_BOT_TOKEN sozlanmagan — Telegram bot ishga tushmadi (bildirishnomalar konsolga chiqadi)");
    return false;
  }

  if (!polling) {
    polling = true;
    void pollUpdates();
  }
  console.log("🤖 Telegram bot ishga tushdi (polling rejimida)");
  return true;
};

const isTelegramConfigured = () => Boolean(token);

module.exports = { initTelegramBot, sendMessage, isTelegramConfigured };
