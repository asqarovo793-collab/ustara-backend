const express = require("express");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Barber = require("../models/Barber");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const { protect, authorize } = require("../middleware/auth");
const notify = require("../utils/notify");

const router = express.Router();

router.use(protect, authorize("admin"));

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(errors.array().map((e) => e.msg).join(", "));
    err.statusCode = 400;
    throw err;
  }
};

// @route  GET /api/admin/dashboard
// @desc   Umumiy statistika
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const [
      totalUsers,
      totalCustomers,
      totalBarbers,
      pendingBarbers,
      totalBookings,
      completedBookings,
      cancelledBookings,
      revenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "barber" }),
      Barber.countDocuments({ status: "pending" }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "cancelled" }),
      Booking.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$price" } } },
      ]),
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyBookings = await Booking.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          revenue: { $sum: "$price" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalCustomers,
        totalBarbers,
        pendingBarbers,
        totalBookings,
        completedBookings,
        cancelledBookings,
        totalRevenue: revenueAgg[0]?.total || 0,
      },
      dailyBookings,
    });
  })
);

// @route  GET /api/admin/barbers
// @desc   Barcha sartaroshlar (filter: status)
router.get(
  "/barbers",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const barbers = await Barber.find(filter).populate("user", "name phone createdAt").sort({ createdAt: -1 });
    res.json({ success: true, barbers });
  })
);

// @route  PUT /api/admin/barbers/:id/approve
router.put(
  "/barbers/:id/approve",
  asyncHandler(async (req, res) => {
    const barber = await Barber.findById(req.params.id);
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    barber.status = "approved";
    barber.rejectionReason = "";
    await barber.save();

    const io = req.app.get("io");
    await notify(io, barber.user, {
      type: "barber_approved",
      title: "Profilingiz tasdiqlandi",
      message: "Tabriklaymiz! Sartaroshxona profilingiz admin tomonidan tasdiqlandi.",
    });

    res.json({ success: true, message: "Sartarosh tasdiqlandi", barber });
  })
);

// @route  PUT /api/admin/barbers/:id/reject
router.put(
  "/barbers/:id/reject",
  [body("reason").optional().isLength({ max: 300 })],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const barber = await Barber.findById(req.params.id);
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    barber.status = "rejected";
    barber.rejectionReason = req.body.reason || "Ma'lumotlar yetarli emas";
    await barber.save();

    const io = req.app.get("io");
    await notify(io, barber.user, {
      type: "barber_rejected",
      title: "Profil rad etildi",
      message: `Sabab: ${barber.rejectionReason}`,
    });

    res.json({ success: true, message: "Sartarosh rad etildi", barber });
  })
);

// @route  PUT /api/admin/barbers/:id/suspend
router.put(
  "/barbers/:id/suspend",
  asyncHandler(async (req, res) => {
    const barber = await Barber.findByIdAndUpdate(
      req.params.id,
      { status: "suspended" },
      { new: true }
    );
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    res.json({ success: true, message: "Sartarosh vaqtincha to'xtatildi", barber });
  })
);

// @route  GET /api/admin/users
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.q) filter.$or = [
      { name: new RegExp(req.query.q, "i") },
      { phone: new RegExp(req.query.q, "i") },
    ];
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, users });
  })
);

// @route  PUT /api/admin/users/:id/block
router.put(
  "/users/:id/block",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: true }, { new: true });
    if (!user) {
      res.status(404);
      throw new Error("Foydalanuvchi topilmadi");
    }
    res.json({ success: true, message: "Foydalanuvchi bloklandi", user: user.toSafeObject() });
  })
);

// @route  PUT /api/admin/users/:id/unblock
router.put(
  "/users/:id/unblock",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: false }, { new: true });
    if (!user) {
      res.status(404);
      throw new Error("Foydalanuvchi topilmadi");
    }
    res.json({ success: true, message: "Foydalanuvchi blokdan chiqarildi", user: user.toSafeObject() });
  })
);

// @route  GET /api/admin/bookings
router.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.date) filter.date = req.query.date;
    const bookings = await Booking.find(filter)
      .populate("customer", "name phone")
      .populate({ path: "barber", select: "salonName", populate: { path: "user", select: "name" } })
      .populate("service", "name price")
      .sort({ createdAt: -1 })
      .limit(300);
    res.json({ success: true, bookings });
  })
);

// @route  GET /api/admin/payments
// @desc   To'lovlar hisobotini kuzatish
router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const filter = { paymentStatus: { $ne: "pending" } };
    if (req.query.method) filter.paymentMethod = req.query.method;

    const payments = await Booking.find(filter)
      .populate("customer", "name phone")
      .populate({ path: "barber", select: "salonName" })
      .sort({ updatedAt: -1 })
      .limit(300);

    const summary = await Booking.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$price" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({ success: true, payments, summary });
  })
);

// @route  PUT /api/admin/barbers/:id/premium
// @desc   Sartaroshni premium tarifga o'tkazish
router.put(
  "/barbers/:id/premium",
  [body("months").optional().isInt({ min: 1, max: 24 })],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const barber = await Barber.findById(req.params.id);
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    const months = req.body.months || 1;
    const base = barber.premiumUntil && barber.premiumUntil > new Date() ? barber.premiumUntil : new Date();
    const until = new Date(base);
    until.setMonth(until.getMonth() + months);

    barber.isPremium = true;
    barber.plan = "premium";
    barber.premiumUntil = until;
    await barber.save();

    res.json({ success: true, message: "Premium tarif faollashtirildi", barber });
  })
);

module.exports = router;
