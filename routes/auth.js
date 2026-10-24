const express = require("express");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Barber = require("../models/Barber");
const generateToken = require("../utils/generateToken");
const { protect } = require("../middleware/auth");

const router = express.Router();

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(errors.array().map((e) => e.msg).join(", "));
    err.statusCode = 400;
    throw err;
  }
};

// @route  POST /api/auth/register
// @desc   Ro'yxatdan o'tish (mijoz yoki sartarosh sifatida)
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Ism kiritilishi shart"),
    body("phone")
      .matches(/^\+?[0-9]{9,15}$/)
      .withMessage("Telefon raqam formati noto'g'ri (masalan: +998901234567)"),
    body("email")
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage("Email formati noto'g'ri")
      .normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Parol kamida 6 ta belgidan iborat bo'lishi kerak"),
    body("role")
      .optional()
      .isIn(["customer", "barber"])
      .withMessage("Rol noto'g'ri"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const { name, phone, password, role } = req.body;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : undefined;

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      res.status(400);
      throw new Error("Bu telefon raqam bilan foydalanuvchi allaqachon mavjud");
    }

    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        res.status(400);
        throw new Error("Bu email bilan foydalanuvchi allaqachon mavjud");
      }
    }

    const user = await User.create({
      name,
      phone,
      email,
      password,
      role: role === "barber" ? "barber" : "customer",
    });

    // Agar sartarosh sifatida ro'yxatdan o'tsa, bo'sh profil yaratamiz (keyin to'ldiradi)
    if (user.role === "barber") {
      await Barber.create({
        user: user._id,
        salonName: `${name} sartaroshxonasi`,
        address: "Manzil kiritilmagan",
        status: "pending",
      });
    }

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: "Muvaffaqiyatli ro'yxatdan o'tdingiz",
      token,
      user: user.toSafeObject(),
    });
  })
);

// @route  POST /api/auth/login
// @desc   Tizimga kirish (telefon raqam yoki email bilan)
router.post(
  "/login",
  [
    body("identifier").notEmpty().withMessage("Telefon raqam yoki email kiritilishi shart"),
    body("password").notEmpty().withMessage("Parol kiritilishi shart"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const { identifier, password } = req.body;
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes("@");

    const user = await User.findOne(
      isEmail ? { email: trimmed.toLowerCase() } : { phone: trimmed }
    ).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      throw new Error(isEmail ? "Email yoki parol noto'g'ri" : "Telefon raqam yoki parol noto'g'ri");
    }

    if (user.isBlocked) {
      res.status(403);
      throw new Error("Hisobingiz bloklangan. Admin bilan bog'laning.");
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user._id, user.role);

    res.json({
      success: true,
      message: "Muvaffaqiyatli kirdingiz",
      token,
      user: user.toSafeObject(),
    });
  })
);

// @route  GET /api/auth/me
// @desc   Joriy foydalanuvchi ma'lumotini olish
router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    res.json({ success: true, user: req.user.toSafeObject() });
  })
);

// @route  PUT /api/auth/location
// @desc   Foydalanuvchi joylashuvini yangilash
router.put(
  "/location",
  protect,
  [
    body("lat").isFloat({ min: -90, max: 90 }).withMessage("lat noto'g'ri"),
    body("lng").isFloat({ min: -180, max: 180 }).withMessage("lng noto'g'ri"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const { lat, lng } = req.body;
    req.user.location = { type: "Point", coordinates: [lng, lat] };
    await req.user.save();
    res.json({ success: true, message: "Joylashuv yangilandi", user: req.user.toSafeObject() });
  })
);

// @route  PUT /api/auth/password
// @desc   Parolni yangilash
router.put(
  "/password",
  protect,
  [
    body("currentPassword").notEmpty().withMessage("Joriy parolni kiriting"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.matchPassword(req.body.currentPassword))) {
      res.status(400);
      throw new Error("Joriy parol noto'g'ri");
    }
    user.password = req.body.newPassword;
    await user.save();
    res.json({ success: true, message: "Parol muvaffaqiyatli yangilandi" });
  })
);

module.exports = router;
