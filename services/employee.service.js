const User = require("../models/User");

const generateEmail = async (name) => {
  const parts = name.trim().toLowerCase().split(/\s+/);
  const base = parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
  const sanitized = base.replace(/[^a-z0-9.]/g, "");
  let email = `${sanitized}@erp.com`;
  let counter = 2;
  while (await User.findOne({ email })) {
    email = `${sanitized}${counter}@erp.com`;
    counter++;
  }
  return email;
};

const roleMap = {
  "HR Manager":        "HR_MANAGER",
  "Marketing Manager": "MARKETING_MANAGER",
  "Sales Manager":     "SALES_MANAGER",
  "Stock Manager":     "STOCK_MANAGER",
  "Purchase Manager":     "PURCHASE_MANAGER",
  "Commercial Manager":     "COMMERCIAL_MANAGER",
  "Finance Manager":     "FINANCE_MANAGER",
  "Employee":          "EMPLOYEE",
  "Intern":            "EMPLOYEE",
};

exports.getAllEmployees = (department) =>
  User.find({ department }).select("-password").sort({ createdAt: -1 });

exports.getStats = async (department) => {
  const [total, onLeave, employees] = await Promise.all([
    User.countDocuments({ department }),
    User.countDocuments({ department, status: "On Leave" }),
    User.find({ department }),
  ]);

  let avgTenure = 0;
  if (employees.length > 0) {
    const now = new Date();
    const totalYears = employees.reduce((sum, e) => {
      const diff = (now - new Date(e.joinedDate || e.createdAt)) / (1000 * 60 * 60 * 24 * 365);
      return sum + diff;
    }, 0);
    avgTenure = parseFloat((totalYears / employees.length).toFixed(1));
  }

  return { total, onLeave, avgTenure };
};

exports.createEmployee = async (department, data) => {
  const { name, position, phone, salary, joinedDate } = data;
  const email = await generateEmail(name);
  const plainPassword = Math.random().toString(36).slice(2, 10).padEnd(8, "x");
  const role = roleMap[position] || "EMPLOYEE";

  const user = await User.create({
    name,
    email,
    password: plainPassword,
    role,
    department,
    position: position || "",
    phone: phone || "",
    salary: salary || 0,
    joinedDate: joinedDate || new Date(),
  });

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    department: user.department,
    position: user.position,
    phone: user.phone,
    salary: user.salary,
    joinedDate: user.joinedDate,
    plainPassword,
  };
};

exports.updateEmployee = async (id, data) => {
  const { name, email, phone, position, salary, joinedDate } = data;
  const role = roleMap[position] || "EMPLOYEE";
  return User.findByIdAndUpdate(
    id,
    { name, email, phone, position, role, salary, joinedDate },
    { new: true, runValidators: true }
  ).select("-password");
};

exports.deleteEmployee = (id) => User.findByIdAndDelete(id);