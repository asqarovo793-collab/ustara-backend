require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

// Database
const connectDB = require("./config/db");

// Middleware
const { notFound, errorHandler } = require("./middleware/errorHandler");

// Sockets
const initSockets = require("./sockets");

// Telegram
const { initTelegramBot } = require("./bot/telegramBot");

// Routes
const authRoutes = require("./routes/auth");
const barberRoutes = require("./routes/barbers");
const serviceRoutes = require("./routes/services");
const bookingRoutes = require("./routes/bookings");
const reviewRoutes = require("./routes/reviews");
const notificationRoutes = require("./routes/notifications");
const adminRoutes = require("./routes/admin");

// 🤖 AI Route
const aiRoutes = require("./routes/aiRoutes");

const app = express();
const server = http.createServer(app);

// ======================================================
// CORS
// ======================================================

const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  process.env.ADMIN_URL || "http://localhost:5174",
];

// ======================================================
// SOCKET.IO
// ======================================================

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.set("io", io);

initSockets(io);

// ======================================================
// SECURITY MIDDLEWARE
// ======================================================

app.use(helmet());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// JSON limit
app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ======================================================
// LOGGER
// ======================================================

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ======================================================
// GENERAL RATE LIMIT
// ======================================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 500,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring.",
  },
});

app.use("/api", apiLimiter);

// ======================================================
// AUTH RATE LIMIT
// ======================================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 30,

  message: {
    success: false,
    message:
      "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring.",
  },
});

app.use("/api/auth/login", authLimiter);

app.use("/api/auth/register", authLimiter);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server ishlamoqda",
    time: new Date().toISOString(),
  });
});

// ======================================================
// API ROUTES
// ======================================================

// Authentication
app.use("/api/auth", authRoutes);

// Barbers
app.use("/api/barbers", barberRoutes);

// Services
app.use("/api/services", serviceRoutes);

// Bookings
app.use("/api/bookings", bookingRoutes);

// Reviews
app.use("/api/reviews", reviewRoutes);

// Notifications
app.use("/api/notifications", notificationRoutes);

// Admin
app.use("/api/admin", adminRoutes);

// ======================================================
// 🤖 AI HAIRSTYLE ROUTE
// ======================================================
//
// React:
// POST /api/ai/hairstyle
//
// FormData:
// image = user's photo
//
// AI:
// Hugging Face Vision Model
//
// Result:
// 3 ta mos soch turmagi
//
// ======================================================

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "AI bepul limitini asrash uchun qisqa vaqtda 5 ta so‘rov bilan cheklangan. Keyinroq qayta urinib ko‘ring.",
  },
});

app.use("/api/ai/hairstyle", aiLimiter);
app.use("/api/ai", aiRoutes);

// ======================================================
// 404
// ======================================================

app.use(notFound);

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(errorHandler);

// ======================================================
// UNHANDLED REJECTION
// ======================================================

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err.message);
});

// ======================================================
// UNCAUGHT EXCEPTION
// ======================================================

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});

// ======================================================
// SERVER PORT
// ======================================================

const PORT = process.env.PORT || 5000;

// ======================================================
// START SERVER
// ======================================================

const start = async () => {
  let databaseConnected = false;

  try {
    // MongoDB
    await connectDB();
    databaseConnected = true;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("❌ Server ishga tushmadi:", error.message);
      process.exit(1);
      return;
    }

    // AI routes do not depend on MongoDB, so keep them available in local development.
    console.warn("⚠️ MongoDB mavjud emas. Server development rejimida AI uchun ishga tushirilmoqda.");
  }

  try {
    // Telegram Bot
    if (databaseConnected) initTelegramBot();

    // Start server
    server.listen(PORT, () => {
      console.log(
        `🚀 Server ${PORT}-portda ishga tushdi (${
          process.env.NODE_ENV || "development"
        })`
      );

      console.log("🤖 AI Hairstyle Advisor: /api/ai/hairstyle");
    });
  } catch (error) {
    console.error("❌ Server ishga tushmadi:", error.message);

    if (process.env.NODE_ENV === "production") process.exit(1);
  }
};

start();

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  app,
  server,
  io,
};
