const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// Foydalanuvchi tizimga kirganligini tekshiradi
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Ruxsat yo'q: token topilmadi. Iltimos, tizimga kiring.");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    res.status(401);
    throw new Error("Ruxsat yo'q: token yaroqsiz yoki muddati o'tgan.");
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    res.status(401);
    throw new Error("Foydalanuvchi topilmadi. Token yaroqsiz.");
  }

  if (user.isBlocked) {
    res.status(403);
    throw new Error("Hisobingiz bloklangan. Admin bilan bog'laning.");
  }

  req.user = user;
  next();
});

// Ma'lum rollarga ruxsat berish (masalan: authorize('admin'), authorize('barber','admin'))
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      throw new Error(
        `Ruxsat yo'q: bu amal faqat [${roles.join(", ")}] rollari uchun.`
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
