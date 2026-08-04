require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const initSockets = require("./sockets");
const { initTelegramBot } = require("./bot/telegramBot");

const authRoutes = require("./routes/auth");
const barberRoutes = require("./routes/barbers");
const serviceRoutes = require("./routes/services");
const bookingRoutes = require("./routes/bookings");
const reviewRoutes = require("./routes/reviews");
const notificationRoutes = require("./routes/notifications");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  process.env.ADMIN_URL || "http://localhost:5174",
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.set("io", io);
initSockets(io);

// --- Middleware ---
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Umumiy so'rovlarni cheklash (DDOS/brute-force dan himoya)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring." },
});
app.use("/api", apiLimiter);

// Login/register uchun qattiqroq cheklov
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// --- Routes ---
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server ishlamoqda", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/barbers", barberRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

// --- Xatolarni ushlash ---
app.use(notFound);
app.use(errorHandler);

// --- Kutilmagan xatoliklarni ushlash (server umuman yiqilmasligi uchun) ---
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err.message);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  initTelegramBot();
  server.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda ishga tushdi (${process.env.NODE_ENV || "development"})`);
  });
};

start();

module.exports = { app, server, io };