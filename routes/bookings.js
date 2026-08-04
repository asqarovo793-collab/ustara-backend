const express = require("express");
const asyncHandler = require("express-async-handler");
const { body, query, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");
const { generateAvailableSlots } = require("../utils/timeSlots");
const notify = require("../utils/notify");
const { sendTelegramMessage } = require("../utils/telegram");

const router = express.Router();

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(errors.array().map((e) => e.msg).join(", "));
    err.statusCode = 400;
    throw err;
  }
};

const MONTHLY_FREE_LIMIT = 30;
const MAX_ACTIVE_BOOKINGS_PER_CUSTOMER = 3;

// @route  GET /api/bookings/availability
// @desc   Berilgan sartarosh, xizmat va sana uchun bo'sh vaqtlarni qaytaradi
router.get(
  "/availability",
  [
    query("barberId").isMongoId().withMessage("barberId noto'g'ri"),
    query("serviceId").isMongoId().withMessage("serviceId noto'g'ri"),
    query("date").matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("date formati YYYY-MM-DD bo'lishi kerak"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const { barberId, serviceId, date } = req.query;

    const [barber, service] = await Promise.all([
      Barber.findById(barberId),
      Service.findById(serviceId),
    ]);

    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    if (!service) {
      res.status(404);
      throw new Error("Xizmat topilmadi");
    }

    const existingBookings = await Booking.find({
      barber: barberId,
      date,
      status: { $in: ["pending", "confirmed"] },
    }).select("startTime endTime");

    const slots = generateAvailableSlots(barber, date, service.durationMinutes, existingBookings);

    res.json({ success: true, date, slots });
  })
);

// @route  POST /api/bookings
// @desc   Yangi bron yaratish
router.post(
  "/",
  protect,
  authorize("customer"),
  [
    body("barberId").isMongoId().withMessage("barberId noto'g'ri"),
    body("serviceId").isMongoId().withMessage("serviceId noto'g'ri"),
    body("date").matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("date formati YYYY-MM-DD bo'lishi kerak"),
    body("startTime").matches(/^\d{2}:\d{2}$/).withMessage("startTime formati HH:mm bo'lishi kerak"),
    body("paymentMethod").isIn(["online", "cash"]).withMessage("To'lov turi noto'g'ri"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const { barberId, serviceId, date, startTime, paymentMethod } = req.body;

    const [barber, service] = await Promise.all([
      Barber.findById(barberId),
      Service.findById(serviceId),
    ]);

    if (!barber || barber.status !== "approved") {
      res.status(404);
      throw new Error("Sartarosh topilmadi yoki hali tasdiqlanmagan");
    }
    if (!service || !service.isActive) {
      res.status(404);
      throw new Error("Xizmat topilmadi yoki faol emas");
    }

    // Soxta/spam bronlarning oldini olish - bitta mijoz bir vaqtda faqat
    // MAX_ACTIVE_BOOKINGS_PER_CUSTOMER ta kutilayotgan/tasdiqlangan bronga ega bo'la oladi
    const activeBookingsCount = await Booking.countDocuments({
      customer: req.user._id,
      status: { $in: ["pending", "confirmed"] },
    });
    if (activeBookingsCount >= MAX_ACTIVE_BOOKINGS_PER_CUSTOMER) {
      res.status(429);
      throw new Error(
        `Sizda hozircha ${MAX_ACTIVE_BOOKINGS_PER_CUSTOMER} ta faol (kutilayotgan yoki tasdiqlangan) broningiz bor. Yangi bron qilishdan oldin avvalgilarini yakunlang yoki bekor qiling.`
      );
    }

    // Bepul tarifda oylik bron limitini tekshirish
    if (barber.plan === "free") {
      const now = new Date();
      const resetMonth = new Date(barber.monthlyBookingResetAt).getMonth();
      if (resetMonth !== now.getMonth()) {
        barber.monthlyBookingCount = 0;
        barber.monthlyBookingResetAt = now;
      }
      if (barber.monthlyBookingCount >= MONTHLY_FREE_LIMIT) {
        res.status(403);
        throw new Error(
          "Bu sartaroshning bepul tarif limiti tugagan. Iltimos, boshqa vaqt urinib ko'ring."
        );
      }
    }

    // Vaqt band emasligini qayta tekshiramiz (poyga holatini oldini olish)
    const startMin = (() => {
      const [h, m] = startTime.split(":").map(Number);
      return h * 60 + m;
    })();
    const endMin = startMin + service.durationMinutes;
    const endTime = `${Math.floor(endMin / 60)
      .toString()
      .padStart(2, "0")}:${(endMin % 60).toString().padStart(2, "0")}`;

    const conflict = await Booking.findOne({
      barber: barberId,
      date,
      status: { $in: ["pending", "confirmed"] },
      $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
    });

    if (conflict) {
      res.status(409);
      throw new Error("Kechirasiz, bu vaqt band qilindi. Boshqa vaqtni tanlang.");
    }

    const booking = await Booking.create({
      customer: req.user._id,
      barber: barberId,
      service: serviceId,
      date,
      startTime,
      endTime,
      price: service.price,
      paymentMethod,
      paymentStatus: paymentMethod === "online" ? "pending" : "pending",
      status: "pending",
    });

    barber.monthlyBookingCount += 1;
    await barber.save();

    service.orderCount += 1;
    await service.save();

    const io = req.app.get("io");
    const barberOwner = await User.findById(barber.user);
    if (barberOwner) {
      await notify(io, barberOwner._id, {
        type: "booking_confirmed",
        title: "Yangi bron",
        message: `${req.user.name} ${date} kuni soat ${startTime} ga bron qildi`,
        meta: { bookingId: booking._id },
      });
    }
    if (io) io.to(`barber:${barberId}`).emit("new_booking", booking);

    // Telegram orqali sartaroshga darhol xabar yuborish (agar ulangan bo'lsa)
    if (barber.telegramChatId) {
      sendTelegramMessage(
        barber.telegramChatId,
        `🔔 Yangi bron!\n\n` +
          `👤 Mijoz: ${req.user.name}\n` +
          `📞 Tel: ${req.user.phone}\n` +
          `💈 Xizmat: ${service.name}\n` +
          `📅 Sana: ${date}\n` +
          `🕐 Vaqt: ${startTime}\n` +
          `💰 Narx: ${service.price.toLocaleString()} so'm\n` +
          `💳 To'lov: ${paymentMethod === "online" ? "Online" : "Joyida"}`
      );
    }

    res.status(201).json({ success: true, message: "Bron muvaffaqiyatli yaratildi", booking });
  })
);

// @route  GET /api/bookings/mine
// @desc   Mijozning barcha bronlari
router.get(
  "/mine",
  protect,
  authorize("customer"),
  asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ customer: req.user._id })
      .populate({ path: "barber", populate: { path: "user", select: "name avatar" } })
      .populate("service", "name price durationMinutes")
      .sort({ date: -1, startTime: -1 });
    res.json({ success: true, bookings });
  })
);

// @route  GET /api/bookings/barber
// @desc   Sartaroshning barcha bronlari (filter: date, status)
router.get(
  "/barber",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await Barber.findOne({ user: req.user._id });
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }
    const filter = { barber: barber._id };
    if (req.query.date) filter.date = req.query.date;
    if (req.query.status) filter.status = req.query.status;

    const bookings = await Booking.find(filter)
      .populate("customer", "name phone avatar")
      .populate("service", "name price durationMinutes")
      .sort({ date: 1, startTime: 1 });
    res.json({ success: true, bookings });
  })
);

// @route  PUT /api/bookings/:id/status
// @desc   Bron holatini o'zgartirish (confirm, cancel, complete)
router.put(
  "/:id/status",
  protect,
  [
    body("status")
      .isIn(["confirmed", "cancelled", "completed", "no_show"])
      .withMessage("Holat noto'g'ri"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const booking = await Booking.findById(req.params.id).populate("barber");
    if (!booking) {
      res.status(404);
      throw new Error("Bron topilmadi");
    }

    const isOwnerCustomer = booking.customer.toString() === req.user._id.toString();
    const isOwnerBarber =
      req.user.role === "barber" && booking.barber.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwnerCustomer && !isOwnerBarber && !isAdmin) {
      res.status(403);
      throw new Error("Bu bronni o'zgartirishga ruxsatingiz yo'q");
    }

    const { status } = req.body;

    // Mijoz faqat bekor qila oladi
    if (isOwnerCustomer && !isAdmin && status !== "cancelled") {
      res.status(403);
      throw new Error("Mijoz faqat bronni bekor qilishi mumkin");
    }

    const wasActive = ["pending", "confirmed"].includes(booking.status);
    booking.status = status;
    if (status === "cancelled") {
      booking.cancelledBy = isOwnerCustomer ? "customer" : isOwnerBarber ? "barber" : "admin";
    }
    if (status === "completed") {
      booking.completedAt = new Date();
      // Sodiqlik dasturi uchun hisoblagichni oshiramiz
      await User.findByIdAndUpdate(booking.customer, { $inc: { loyaltyCount: 1 } });
    }
    await booking.save();

    const io = req.app.get("io");

    // Bekor qilinsa va bo'shab qolsa - "favqulodda bo'sh vaqt" bildirishnomasi
    if (status === "cancelled" && wasActive) {
      if (io) {
        io.to(`barber:${booking.barber._id}`).emit("slot_freed", {
          barberId: booking.barber._id,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        });
        io.emit("emergency_slot", {
          barberId: booking.barber._id,
          salonName: booking.barber.salonName,
          date: booking.date,
          startTime: booking.startTime,
        });
      }
      if (isOwnerBarber || isAdmin) {
        await notify(io, booking.customer, {
          type: "booking_cancelled",
          title: "Bron bekor qilindi",
          message: `${booking.date} soat ${booking.startTime} dagi broningiz bekor qilindi`,
          meta: { bookingId: booking._id },
        });
      }
    }

    if (status === "confirmed") {
      await notify(io, booking.customer, {
        type: "booking_confirmed",
        title: "Bron tasdiqlandi",
        message: `${booking.date} soat ${booking.startTime} dagi broningiz tasdiqlandi`,
        meta: { bookingId: booking._id },
      });
    }

    res.json({ success: true, message: "Bron holati yangilandi", booking });
  })
);

// @route  GET /api/bookings/barber/queue/today
// @desc   Bugungi jonli navbat holati (mijoz uchun "sizdan oldin N kishi")
router.get(
  "/barber/:barberId/queue",
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const bookings = await Booking.find({
      barber: req.params.barberId,
      date: today,
      status: { $in: ["pending", "confirmed"] },
    })
      .sort({ startTime: 1 })
      .populate("service", "durationMinutes");

    res.json({
      success: true,
      queueLength: bookings.length,
      queue: bookings.map((b, idx) => ({
        bookingId: b._id,
        position: idx + 1,
        startTime: b.startTime,
      })),
    });
  })
);

module.exports = router;
