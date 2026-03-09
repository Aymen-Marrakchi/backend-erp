const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const User = require("./models/User");

dotenv.config();

const users = [
  { name: "Admin User",        email: "admin@erp.com",      password: "123456", role: "ADMIN" },
  { name: "HR Manager",        email: "hr@erp.com",         password: "123456", role: "HR_MANAGER" },
  { name: "Marketing Manager", email: "marketing@erp.com",  password: "123456", role: "MARKETING_MANAGER" },
  { name: "Sales Manager",     email: "sales@erp.com",      password: "123456", role: "SALES_MANAGER" },
  { name: "Employee",          email: "employee@erp.com",   password: "123456", role: "EMPLOYEE" },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Delete all existing users
    await User.deleteMany({});
    console.log("🗑️  Deleted old users");

    // ✅ Hash passwords manually then use insertMany
    const hashedUsers = await Promise.all(
      users.map(async (u) => ({
        ...u,
        password: await bcrypt.hash(u.password, 10),
      }))
    );
    await User.insertMany(hashedUsers);
    console.log("🌱 Users seeded with hashed passwords!");

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    process.exit(1);
  }
};

seed();