const { getBot } = require("../bot/telegramBot");

/**
 * Telegram orqali xabar yuborish. Hech qachon xato bilan to'xtamaydi —
 * agar bot sozlanmagan yoki chatId bo'lmasa, shunchaki jim o'tkazib
 * yuboriladi (yoki dev rejimida konsolga chiqariladi).
 */
const sendTelegramMessage = async (chatId, text) => {
  if (!chatId) {
    return { success: false, reason: "no_chat_id" };
  }

  const bot = getBot();

  if (!bot) {
    console.log(`🤖 [DEV TELEGRAM] ${chatId} ga xabar:\n${text}`);
    return { success: true, mode: "dev" };
  }

  try {
    await bot.sendMessage(chatId, text);
    return { success: true, mode: "telegram" };
  } catch (err) {
    console.error("❌ Telegram xabar yuborish xatosi:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendTelegramMessage };