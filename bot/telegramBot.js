/**
 * Telegram bot integratsiyasi.
 *
 * Agar .env faylida TELEGRAM_BOT_TOKEN to'ldirilgan bo'lsa, bot "polling"
 * rejimida ishga tushadi va sartaroshlarning Telegram hisobini saytga
 * ulaydi. Agar sozlanmagan bo'lsa, bildirishnomalar shunchaki konsolga
 * chiqariladi — dastur hech qachon xato bilan to'xtamaydi.
 */

const Barber = require("../models/Barber");

let bot = null;

const initTelegramBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log(
      "ℹ️  TELEGRAM_BOT_TOKEN sozlanmagan — Telegram bot ishga tushmadi (bildirishnomalar konsolga chiqadi)"
    );
    return null;
  }

  try {
    const TelegramBot = require("node-telegram-bot-api");
    bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const code = match?.[1]?.trim();

      if (!code) {
        bot.sendMessage(
          chatId,
          "Assalomu alaykum! Bu Ustara platformasining rasmiy boti.\n\nHisobingizni ulash uchun saytda 'Sozlamalar' bo'limidagi 'Telegram botni ulash' havolasini bosing."
        );
        return;
      }

      try {
        const barber = await Barber.findOne({ telegramLinkCode: code });
        if (!barber) {
          bot.sendMessage(
            chatId,
            "❌ Havola yaroqsiz yoki muddati o'tgan. Saytdan qaytadan urinib ko'ring."
          );
          return;
        }

        barber.telegramChatId = String(chatId);
        await barber.save();

        bot.sendMessage(
          chatId,
          `✅ Hisobingiz ulandi!\n\n💈 Salon: ${barber.salonName}\n\nEndi yangi bronlar haqida shu yerga xabar kelib turadi.`
        );
      } catch (err) {
        console.error("❌ Telegram ulash xatosi:", err.message);
        bot.sendMessage(chatId, "Xatolik yuz berdi, keyinroq urinib ko'ring.");
      }
    });

    bot.on("polling_error", (err) => {
      console.error("❌ Telegram polling xatosi:", err.message);
    });

    console.log("🤖 Telegram bot ishga tushdi (polling rejimida)");
    return bot;
  } catch (err) {
    console.error("❌ Telegram botni ishga tushirishda xatolik:", err.message);
    return null;
  }
};

const getBot = () => bot;

module.exports = { initTelegramBot, getBot };