const jwt = require("jsonwebtoken");

/**
 * Socket.IO ulanishlarini sozlaydi.
 * Har bir foydalanuvchi o'z xonasiga (user:<id>) qo'shiladi,
 * sartaroshlar esa qo'shimcha ravishda (barber:<barberId>) xonasiga qo'shiladi
 * shu orqali live queue va emergency slot bildirishnomalari yuboriladi.
 */
const initSockets = (io) => {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
      }
      next();
    } catch (err) {
      // Token noto'g'ri bo'lsa ham ulanishga ruxsat beramiz (anonim - faqat umumiy eventlarni tinglaydi)
      next();
    }
  });

  io.on("connection", (socket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Mijoz muayyan sartaroshning navbatini kuzatishi uchun
    socket.on("watch_barber_queue", (barberId) => {
      if (barberId) socket.join(`barber:${barberId}`);
    });

    socket.on("unwatch_barber_queue", (barberId) => {
      if (barberId) socket.leave(`barber:${barberId}`);
    });

    socket.on("disconnect", () => {
      // Tozalash avtomatik amalga oshadi
    });
  });
};

module.exports = initSockets;
