// 404 - topilmadi
const notFound = (req, res, next) => {
  const error = new Error(`Manzil topilmadi: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Umumiy xatoliklarni bitta formatda qaytaruvchi middleware
// Har doim JSON qaytaradi, hech qachon server "oq ekran" bilan yiqilmaydi
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || "Serverda kutilmagan xatolik yuz berdi";

  // Mongoose noto'g'ri ObjectId
  if (err.name === "CastError" && err.kind === "ObjectId") {
    statusCode = 404;
    message = "Resurs topilmadi (noto'g'ri ID formati)";
  }

  // Mongoose validatsiya xatosi
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
  }

  // Takrorlanuvchi kalit (masalan telefon raqam band)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || "maydon";
    message = `Bu ${field} allaqachon ro'yxatdan o'tgan`;
  }

  // JWT xatolari
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Token yaroqsiz";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Tizimga kirish muddati tugagan, qayta kiring";
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };
