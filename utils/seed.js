/**
 * Boshlang'ich ma'lumotlarni yaratish uchun skript.
 * Ishga tushirish: npm run seed
 * Bu skript birinchi ADMIN foydalanuvchisini .env dagi ADMIN_PHONE/ADMIN_PASSWORD asosida yaratadi.
 * Agar admin allaqachon mavjud bo'lsa, qayta yaratilmaydi.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

const run = async () => {
  await connectDB();

  const adminPhone = process.env.ADMIN_PHONE;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPhone || !adminPassword) {
    console.log("⚠️  ADMIN_PHONE yoki ADMIN_PASSWORD .env faylida topilmadi. O'tkazib yuborildi.");
  } else {
    const existingAdmin = await User.findOne({ phone: adminPhone });
    if (existingAdmin) {
      console.log(`ℹ️  Admin (${adminPhone}) allaqachon mavjud.`);
    } else {
      await User.create({
        name: "Bosh Admin",
        phone: adminPhone,
        password: adminPassword,
        role: "admin",
      });
      console.log(`✅ Admin yaratildi: ${adminPhone}`);
      console.log("   Maxfiylik uchun parol terminalga chiqarilmadi.");
    }
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("❌ Seed xatosi:", err.message);
  process.exit(1);
});
