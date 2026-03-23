const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const User = require("../models/User");

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected for seeding");

    // Remove existing users with same usernames
    await User.deleteMany({
      username: { $in: ["john", "selina"] },
    });

    // Hash passwords
    const johnPassword = await bcrypt.hash("requester123", 10);
    const selinaPassword = await bcrypt.hash("approver123", 10);

    // Insert predefined users
    await User.insertMany([
      {
        username: "john",
        password: johnPassword,
        role: "requester",
      },
      {
        username: "selina",
        password: selinaPassword,
        role: "approver",
      },
    ]);

    console.log("Users seeded successfully");
    process.exit();
  } catch (error) {
    console.error("Error seeding users:", error.message);
    process.exit(1);
  }
};

seedUsers();