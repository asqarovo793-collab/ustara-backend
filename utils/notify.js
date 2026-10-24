const Notification = require("../models/Notification");

/**
 * Bildirishnoma yaratadi va (agar mavjud bo'lsa) Socket.IO orqali jonli yuboradi.
 */
const notify = async (io, userId, { type, title, message, meta = {} }) => {
  const notification = await Notification.create({
    user: userId,
    type,
    title,
    message,
    meta,
  });

  if (io) {
    io.to(`user:${userId.toString()}`).emit("notification", notification);
  }

  return notification;
};

module.exports = notify;
