const express = require("express");
const asyncHandler = require("express-async-handler");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");

const router = express.Router();

// @route  GET /api/notifications
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ success: true, notifications, unreadCount });
  })
);

// @route  PUT /api/notifications/:id/read
router.put(
  "/:id/read",
  protect,
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      res.status(404);
      throw new Error("Bildirishnoma topilmadi");
    }
    res.json({ success: true, notification });
  })
);

// @route  PUT /api/notifications/read-all
router.put(
  "/read-all",
  protect,
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: "Barchasi o'qilgan deb belgilandi" });
  })
);

module.exports = router;
