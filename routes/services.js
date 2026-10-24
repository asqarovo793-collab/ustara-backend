const express = require("express");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const Service = require("../models/Service");
const Barber = require("../models/Barber");
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

const getOwnBarber = async (userId) => {
  const barber = await Barber.findOne({ user: userId });
  if (!barber) {
    const err = new Error("Sartarosh profili topilmadi");
    err.statusCode = 404;
    throw err;
  }
  return barber;
};

// @route  GET /api/services/mine
// @desc   O'zining xizmatlar ro'yxati
router.get(
  "/mine",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await getOwnBarber(req.user._id);
    const services = await Service.find({ barber: barber._id }).sort({ createdAt: -1 });
    res.json({ success: true, services });
  })
);

// @route  POST /api/services
// @desc   Yangi xizmat qo'shish
router.post(
  "/",
  protect,
  authorize("barber"),
  [
    body("name").trim().notEmpty().withMessage("Xizmat nomi kiritilishi shart"),
    body("price").isFloat({ min: 0 }).withMessage("Narx to'g'ri kiritilishi kerak"),
    body("durationMinutes").isInt({ min: 5 }).withMessage("Davomiylik kamida 5 daqiqa bo'lishi kerak"),
  ],
  asyncHandler(async (req, res) => {
    handleValidation(req);
    const barber = await getOwnBarber(req.user._id);
    const { name, price, durationMinutes, category, description, shampooName } = req.body;
    const service = await Service.create({
      barber: barber._id,
      name,
      price,
      durationMinutes,
      category,
      description,
      shampooName,
    });
    res.status(201).json({ success: true, message: "Xizmat qo'shildi", service });
  })
);

// @route  PUT /api/services/:id
router.put(
  "/:id",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await getOwnBarber(req.user._id);
    const service = await Service.findOne({ _id: req.params.id, barber: barber._id });
    if (!service) {
      res.status(404);
      throw new Error("Xizmat topilmadi");
    }
    const allowed = ["name", "price", "durationMinutes", "category", "description", "shampooName", "isActive"];
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) service[f] = req.body[f];
    });
    await service.save();
    res.json({ success: true, message: "Xizmat yangilandi", service });
  })
);

// @route  DELETE /api/services/:id
router.delete(
  "/:id",
  protect,
  authorize("barber"),
  asyncHandler(async (req, res) => {
    const barber = await getOwnBarber(req.user._id);
    const service = await Service.findOneAndDelete({ _id: req.params.id, barber: barber._id });
    if (!service) {
      res.status(404);
      throw new Error("Xizmat topilmadi");
    }
    res.json({ success: true, message: "Xizmat o'chirildi" });
  })
);

module.exports = router;
