const express = require("express");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Barber = require("../models/Barber");
const { protect, authorize } = require("../middleware/auth");
const notify = require("../utils/notify");
const User = require("../models/User");

const router = express.Router();

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(errors.array().map((e) => e.msg).join(", "));
    err.statusCode = 400;
    throw err;
  }
};

const recalcBarberRating = async (barberId) => {
  const stats = await Review.aggregate([
    { $match: { barber: barberId } },
    { $group: { _id: "$barber", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Barber.findByIdAndUpdate(barberId, {
    "rating.average": Math.round(avg * 10) / 10,
    "rating.count": count,
  });
};

// @route  POST /api/reviews
// @desc   Xizmatdan so'ng baho va izoh qoldirish (faqat tugagan bron uchun)
router.post(
  "/",
  protect,
  authorize("customer"),
  [
    body("bookingId").isMongoId().withMessage("bookingId noto'g'ri"),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Baho 1 dan 5 gacha bo'lishi kerak"),
    body("comment").optional().isLength({ max: 500 }).withMessage("Izoh 500 belgidan oshmasin"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const { bookingId, rating, comment } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404);
      throw new Error("Bron topilmadi");
    }
    if (booking.customer.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Bu bron sizga tegishli emas");
    }
    if (booking.status !== "completed") {
      res.status(400);
      throw new Error("Faqat tugagan xizmat uchun baho qoldirish mumkin");
    }

    const existing = await Review.findOne({ booking: bookingId });
    if (existing) {
      res.status(400);
      throw new Error("Bu bron uchun allaqachon baho qoldirilgan");
    }

    const review = await Review.create({
      booking: bookingId,
      customer: req.user._id,
      barber: booking.barber,
      rating,
      comment: comment || "",
    });

    await recalcBarberRating(booking.barber);

    res.status(201).json({ success: true, message: "Baho uchun rahmat!", review });
  })
);

// @route  GET /api/reviews/barber/:barberId
router.get(
  "/barber/:barberId",
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ barber: req.params.barberId })
      .populate("customer", "name avatar")
      .sort({ createdAt: -1 });
    res.json({ success: true, reviews });
  })
);

// @route  PUT /api/reviews/:id/reply
// @desc   Sartaroshning izohga javobi
router.put(
  "/:id/reply",
  protect,
  authorize("barber"),
  [body("reply").trim().notEmpty().withMessage("Javob bo'sh bo'lmasin").isLength({ max: 500 })],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const review = await Review.findById(req.params.id).populate("barber");
    if (!review) {
      res.status(404);
      throw new Error("Izoh topilmadi");
    }
    if (review.barber.user.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Bu izohga javob berish huquqingiz yo'q");
    }
    review.barberReply = req.body.reply;
    await review.save();

    const io = req.app.get("io");
    await notify(io, review.customer, {
      type: "review_reply",
      title: "Sartaroshdan javob",
      message: "Sizning izohingizga javob berildi",
      meta: { reviewId: review._id },
    });

    res.json({ success: true, message: "Javob yuborildi", review });
  })
);

module.exports = router;
