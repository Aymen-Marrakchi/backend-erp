const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: [true, "Name is required"], trim: true },
    email:    { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true },
    password: { type: String, required: [true, "Password is required"], minlength: 6 },
    role: {
      type: String,
      enum: ["ADMIN", "HR_MANAGER", "MARKETING_MANAGER", "SALES_MANAGER", "STOCK_MANAGER", "COMMERCIAL_MANAGER", "FINANCE_MANAGER", "PURCHASE_MANAGER","EMPLOYEE"],
      default: "EMPLOYEE",
    },
    department: {
      type: String,
      enum: ["HR", "Marketing", "Online Sales", "Stock", "Commercial", "Finance", "Purchase", "None"],
      default: "None",
    },
    status: {
      type: String,
      enum: ["Active", "On Leave", "Inactive"],
      default: "Active",
    },
    position:   { type: String, default: "" },
    phone:      { type: String, default: "" },
    salary:     { type: Number, default: 0 },
    joinedDate: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);