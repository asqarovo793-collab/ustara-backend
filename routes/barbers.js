const express = require("express");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");
const Barber = require("../models/Barber");
const Service = require("../models/Service");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(errors.array().map((e) => e.msg).join(", "));
    err.statusCode = 400;
    throw err;
  }
};

// @route  GET /api/barbers
// @desc   Sartaroshlarni qidirish (joylashuv, reyting, narx bo'yicha saralash)
// @query  lat, lng, maxDistance(km), sortBy(distance|rating|price), q(search), page, limit
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const {
      lat,
      lng,
      maxDistance = 15,
      sortBy = "distance",
      q,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { status: "approved" };
    if (q) {
      filter.$text = { $search: q };
    }

    let query;

    if (lat && lng) {
      filter.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseFloat(maxDistance) * 1000,
        },
      };
      query = Barber.find(filter);
    } else {
      query = Barber.find(filter);
      if (sortBy === "rating") query = query.sort({ "rating.average": -1 });
      else query = query.sort({ isPremium: -1, createdAt: -1 });
    }

    // $near operatori countDocuments() ichida ishlamaydi (u aggregatsiya ishlatadi),
    // shuning uchun sanash uchun alohida, geolokatsiyasiz filter ishlatamiz
    const countFilter = { status: "approved" };
    if (q) {
      countFilter.$text = { $search: q };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [barbers, total] = await Promise.all([
      query
        .populate("user", "name avatar")
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Barber.countDocuments(countFilter),
    ]);

    // Har bir sartarosh uchun eng arzon xizmat narxini qo'shamiz (narx bo'yicha saralash uchun frontendga foydali)
    const barberIds = barbers.map((b) => b._id);
    const cheapestServices = await Service.aggregate([
      { $match: { barber: { $in: barberIds }, isActive: true } },
      { $group: { _id: "$barber", minPrice: { $min: "$price" } } },
    ]);
    const priceMap = Object.fromEntries(cheapestServices.map((s) => [s._id.toString(), s.minPrice]));

    let result = barbers.map((b) => ({ ...b, startingPrice: priceMap[b._id.toString()] ?? null }));

    if (sortBy === "price") {
      result = result.sort((a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity));
    }

    res.json({
      success: true,
      count: result.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      barbers: result,
    });
  })
);

// @route  GET /api/barbers/me
// @desc   O'zining sartarosh profilini olish (barber roli)
router.get(
  "/me",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await Barber.findOne({ user: req.user._id }).populate("user", "name phone avatar");
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }
    res.json({ success: true, barber });
  })
);

// @route  GET /api/barbers/:id
// @desc   Bitta sartarosh profilini olish (xizmatlari bilan)
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const barber = await Barber.findOne({ _id: req.params.id, status: "approved" })
      .select("-telegramChatId -telegramLinkCode -currentQueue")
      .populate("user", "name avatar");
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    const services = await Service.find({ barber: barber._id, isActive: true }).sort({ orderCount: -1 });
    res.json({ success: true, barber, services });
  })
);

// @route  PUT /api/barbers/me
// @desc   O'zining sartarosh profilini yangilash
router.put(
  "/me",
  protect,
  authorize("barber"),
  [
    body("salonName").optional().trim().notEmpty().withMessage("Salon nomi bo'sh bo'lmasin"),
    body("address").optional().trim().notEmpty().withMessage("Manzil bo'sh bo'lmasin"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const barber = await Barber.findOne({ user: req.user._id });
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }

    const allowedFields = [
      "salonName",
      "address",
      "description",
      "slotDurationMinutes",
    ];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) barber[field] = req.body[field];
    });

    if (req.body.lat && req.body.lng) {
      barber.location = {
        type: "Point",
        coordinates: [parseFloat(req.body.lng), parseFloat(req.body.lat)],
      };
    }

    if (req.body.workingHours) {
      barber.workingHours = req.body.workingHours;
    }

    // Manzil yoki muhim ma'lumot o'zgarsa, admin tomonidan qayta ko'rib chiqilishi mumkin
    await barber.save();

    res.json({ success: true, message: "Profil yangilandi", barber });
  })
);

// @route  POST /api/barbers/me/photos
// @desc   Salon rasmini qo'shish (URL orqali - Cloudinary frontendda yuklanadi)
router.post(
  "/me/photos",
  protect,
  authorize("barber"),
  [body("url").isURL().withMessage("Rasm URL manzili noto'g'ri")],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const barber = await Barber.findOne({ user: req.user._id });
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }
    barber.photos.push({ url: req.body.url, publicId: req.body.publicId || "" });
    await barber.save();
    res.json({ success: true, photos: barber.photos });
  })
);

// @route  DELETE /api/barbers/me/photos/:photoId
router.delete(
  "/me/photos/:photoId",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await Barber.findOne({ user: req.user._id });
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }
    barber.photos = barber.photos.filter((p) => p._id.toString() !== req.params.photoId);
    await barber.save();
    res.json({ success: true, photos: barber.photos });
  })
);

// @route  POST /api/barbers/:id/favorite
// @desc   Sevimlilarga qo'shish/olib tashlash (mijoz)
router.post(
  "/:id/favorite",
  protect,
  authorize("customer"),
  asyncHandler(async (req, res) => {
    const barber = await Barber.findById(req.params.id);
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh topilmadi");
    }
    const user = req.user;
    const idx = user.favorites.findIndex((f) => f.toString() === barber._id.toString());
    let isFavorite;
    if (idx > -1) {
      user.favorites.splice(idx, 1);
      isFavorite = false;
    } else {
      user.favorites.push(barber._id);
      isFavorite = true;
    }
    await user.save();
    res.json({ success: true, isFavorite });
  })
);

// @route  GET /api/barbers/me/favorites
router.get(
  "/me/favorites/list",
  protect,
  authorize("customer"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate({
      path: "favorites",
      populate: { path: "user", select: "name avatar" },
    });
    res.json({ success: true, favorites: user.favorites });
  })
);

// @route  GET /api/barbers/me/telegram-link
// @desc   Telegram botni ulash uchun havola yaratish
router.get(
  "/me/telegram-link",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await Barber.findOne({ user: req.user._id });
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }

    if (!process.env.TELEGRAM_BOT_USERNAME) {
      res.status(400);
      throw new Error("Telegram bot hali sozlanmagan. Admin bilan bog'laning.");
    }

    if (!barber.telegramLinkCode) {
      barber.telegramLinkCode = crypto.randomBytes(12).toString("hex");
      await barber.save();
    }

    const link = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${barber.telegramLinkCode}`;

    res.json({
      success: true,
      link,
      isConnected: Boolean(barber.telegramChatId),
    });
  })
);

// @route  DELETE /api/barbers/me/telegram
// @desc   Telegram ulanishini uzish
router.delete(
  "/me/telegram",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await Barber.findOne({ user: req.user._id });
    if (!barber) {
      res.status(404);
      throw new Error("Sartarosh profili topilmadi");
    }
    barber.telegramChatId = "";
    barber.telegramLinkCode = "";
    await barber.save();
    res.json({ success: true, message: "Telegram ulanishi uzildi" });
  })
);

module.exports = router;
