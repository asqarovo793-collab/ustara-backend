const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    barber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barber",
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    date: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    startTime: {
      type: String, // "HH:mm"
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "no_show"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cash"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    cancelledBy: {
      type: String,
      enum: ["customer", "barber", "admin", null],
      default: null,
    },
    cancelReason: { type: String, default: "" },
    reminderSentAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ barber: 1, date: 1, startTime: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
