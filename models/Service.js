const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    barber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barber",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Xizmat nomi kiritilishi shart"],
      trim: true,
      maxlength: 80,
    },
    category: {
      type: String,
      enum: ["soch", "soqol", "kombinatsiya", "bolalar", "boshqa"],
      default: "soch",
    },
    price: {
      type: Number,
      required: [true, "Narx kiritilishi shart"],
      min: 0,
    },
    durationMinutes: {
      type: Number,
      required: [true, "Davomiylik kiritilishi shart"],
      min: 5,
      default: 30,
    },
    description: { type: String, maxlength: 300, default: "" },
    shampooName: { type: String, trim: true, maxlength: 80, default: "" },
    isActive: { type: Boolean, default: true },
    orderCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", serviceSchema);
