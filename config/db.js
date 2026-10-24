const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI topilmadi. .env faylida MongoDB Atlas ulanish satrini kiriting."
      );
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`✅ MongoDB ulandi: ${conn.connection.host}`);

    mongoose.connection.on("error", (err) => {
      console.error(`❌ MongoDB xatosi: ${err.message}`);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB ulanishi uzildi. Qayta ulanishga urinilmoqda...");
    });

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB ulanish xatosi: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
