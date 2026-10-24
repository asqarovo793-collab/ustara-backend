const mongoose = require("mongoose");

const workingHourSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ["Dush", "Sesh", "Chor", "Pay", "Jum", "Shan", "Yak"],
      required: true,
    },
    isOpen: { type: Boolean, default: true },
    open: { type: String, default: "09:00" }, // HH:mm
    close: { type: String, default: "20:00" },
  },
  { _id: false }
);

const barberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    salonName: {
      type: String,
      required: [true, "Salon nomi kiritilishi shart"],
      trim: true,
      maxlength: 80,
    },
    address: {
      type: String,
      required: [true, "Manzil kiritilishi shart"],
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [0, 0],
      },
    },
    description: { type: String, maxlength: 1000, default: "" },
    photos: [
      {
        url: String,
        publicId: String,
      },
    ],
    workingHours: {
      type: [workingHourSchema],
      default: () => [
        { day: "Dush", isOpen: true, open: "09:00", close: "20:00" },
        { day: "Sesh", isOpen: true, open: "09:00", close: "20:00" },
        { day: "Chor", isOpen: true, open: "09:00", close: "20:00" },
        { day: "Pay", isOpen: true, open: "09:00", close: "20:00" },
        { day: "Jum", isOpen: true, open: "09:00", close: "20:00" },
        { day: "Shan", isOpen: true, open: "10:00", close: "18:00" },
        { day: "Yak", isOpen: false, open: "10:00", close: "18:00" },
      ],
    },
    slotDurationMinutes: { type: Number, default: 30 },
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    isPremium: { type: Boolean, default: false },
    premiumUntil: { type: Date },
    plan: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
    },
    monthlyBookingCount: { type: Number, default: 0 },
    monthlyBookingResetAt: { type: Date, default: Date.now },
    telegramChatId: { type: String, default: "" },
    telegramLinkCode: { type: String, default: "", index: true },
    currentQueue: [
      {
        booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
        position: Number,
      },
    ],
  },
  { timestamps: true }
);

barberSchema.index({ location: "2dsphere" });
barberSchema.index({ salonName: "text", address: "text" });

module.exports = mongoose.model("Barber", barberSchema);