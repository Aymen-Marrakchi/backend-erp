// services/admin.service.js

const User = require("../models/User");

const ROLE_DEPARTMENT_MAP = {
  HR_MANAGER: "HR",
  MARKETING_MANAGER: "Marketing",
  SALES_MANAGER: "Online Sales",
  STOCK_MANAGER: "Stock",
  COMMERCIAL_MANAGER: "Commercial",
  FINANCE_MANAGER: "Finance",
  PURCHASE_MANAGER: "Purchase",
  ADMIN: "None",
};

const ROLE_POSITION_MAP = {
  ADMIN: "Administrator",
  HR_MANAGER: "HR Manager",
  MARKETING_MANAGER: "Marketing Manager",
  SALES_MANAGER: "Sales Manager",
  STOCK_MANAGER: "Stock Manager",
  COMMERCIAL_MANAGER: "Commercial Manager",
  FINANCE_MANAGER: "Finance Manager",
  PURCHASE_MANAGER: "Purchase Manager",
};

exports.getDepartmentForRole = (role, department) =>
  ROLE_DEPARTMENT_MAP[role] || department || "None";

exports.getPositionForRole = (role, existingPosition) =>
  ROLE_POSITION_MAP[role] || existingPosition || "Employee";

exports.getStats = async () => {
  const [totalUsers, byRole] = await Promise.all([
    User.countDocuments(),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
  ]);
  return { totalUsers, byRole };
};

exports.getAllUsers = () =>
  User.find().select("-password").sort({ createdAt: -1 });

exports.getUserById = (id) =>
  User.findById(id).select("-password");

exports.createUser = async ({ name, email, password, role, department, position }) => {
  const exists = await User.findOne({ email });
  if (exists) throw Object.assign(new Error("Email already in use"), { statusCode: 400 });

  const assignedDept = exports.getDepartmentForRole(role, department);
  const assignedPosition = exports.getPositionForRole(role, position);

  const user = await User.create({
    name, email, password, role,
    department: assignedDept,
    position: assignedPosition,
  });

  return {
    id: user._id, name: user.name, email: user.email,
    role: user.role, department: user.department, position: user.position,
  };
};

exports.updateUser = async (id, { name, email, role, department, position }) => {
  const oldUser = await User.findById(id);
  if (!oldUser) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const assignedDept = exports.getDepartmentForRole(role, department);
  const assignedPosition = exports.getPositionForRole(role, position || oldUser.position);

  return User.findByIdAndUpdate(
    id,
    { name, email, role, department: assignedDept, position: assignedPosition },
    { new: true, runValidators: true }
  ).select("-password");
};

exports.resetPassword = async (id, newPassword) => {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  user.password = newPassword;  // pre-save hook hashes it
  await user.save();

  return { tempPassword: newPassword };  // shown once to admin
};

exports.deleteUser = (id) => User.findByIdAndDelete(id);