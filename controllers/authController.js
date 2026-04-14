const User = require("../models/User");
const Master = require("../models/Master");
const Admin = require("../models/Admin");
const { buildRatedMastersForUser } = require("./ratingController");
const slugify = require("../utils/slugify");
const asyncHandler = require("express-async-handler");
const generateToken = require("../utils/generateToken");
const verifyToken = require("../utils/verifyToken");
const {
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  clearRefreshCookie,
  REFRESH_COOKIE_NAME,
} = require("../utils/setAuthCookie");
const { hashPassword, isPasswordMatched } = require("../utils/helpers");
const {
  validateSpecialty,
  getSpecialtyLabel,
} = require("../config/masterProfessions");
const { uploadToB2 } = require("../utils/uploadToB2");
const CreditTransaction = require("../models/CreditTransaction");

const issueAuthCookies = (res, id, role) => {
  const accessToken = generateToken(id, role, { tokenType: "access" });
  const refreshToken = generateToken(id, role, { tokenType: "refresh" });
  setAuthCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
};

/** When true, JSON responses include accessToken for Authorization: Bearer (helps SPA on another port where cookies may not attach). */
function shouldReturnAccessTokenInBody() {
  const explicit = process.env.AUTH_RETURN_ACCESS_TOKEN;
  if (explicit != null && String(explicit).trim() !== "") {
    return String(explicit).toLowerCase() === "true";
  }
  return process.env.NODE_ENV === "development";
}

function exposeAccessTokenPayload(accessToken) {
  if (!shouldReturnAccessTokenInBody() || !accessToken) return {};
  return { accessToken };
}

/** Normalized profile for GET/PATCH /api/auth/me (and profile aliases). */
async function buildMePayload(doc, role) {
  const raw = doc && (doc.toObject ? doc.toObject() : { ...doc });
  delete raw.password;

  if (role === "user") {
    delete raw.orders;
    const ratedMasters = await buildRatedMastersForUser(raw._id);
    return {
      _id: raw._id,
      name: raw.name,
      email: raw.email,
      role: "user",
      phone: raw.phone || "",
      location: raw.location || "",
      image: raw.image || "",
      ratedMasters,
    };
  }

  if (role === "master") {
    const avg = Number.isFinite(raw.rating) ? raw.rating : 0;
    const cnt =
      Number.isFinite(raw.reviewCount) && raw.reviewCount >= 0
        ? raw.reviewCount
        : 0;
    return {
      _id: raw._id,
      name: raw.name,
      email: raw.email,
      role: "master",
      phone: raw.phone || "",
      location: raw.location || "",
      slug: raw.slug || "",
      image: raw.image || "",
      specialty: raw.specialty || "",
      specialtyLabel: getSpecialtyLabel(raw.specialty || ""),
      bio: raw.bio || "",
      instagram: raw.instagram || "",
      website: raw.website || "",
      portfolioImages: Array.isArray(raw.portfolioImages) ? raw.portfolioImages : [],
      works: Array.isArray(raw.works) ? raw.works : [],
      credits: raw.credits ?? 0,
      rating: { average: avg, count: cnt },
    };
  }

  if (role === "admin") {
    return {
      _id: raw._id,
      name: raw.name,
      email: raw.email,
      role: "admin",
      phone: raw.phone || "",
      image: raw.image || "",
    };
  }

  return raw;
}

// @desc    Register user (normal client)
// @route   POST /api/auth/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, phone, password, location: locRaw } = req.body || {};

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({
    email: email.toLowerCase().trim(),
  });
  if (existingUser) {
    const err = new Error("User already exists with this email");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    phone: phone || "",
    location:
      locRaw != null && String(locRaw).trim() ? String(locRaw).trim() : "",
    password: hashedPassword,
    role: "user",
  });

  const tokens = issueAuthCookies(res, user._id, "user");
  const data = await buildMePayload(user, "user");

  res.status(201).json({
    success: true,
    data,
    message: "Registered successfully",
    ...exposeAccessTokenPayload(tokens.accessToken),
  });
});

// @desc    Register admin - creates in admins collection
// @route   POST /api/auth/admin/register
// @access  Public (requires ADMIN_SECRET in body if set in env)
const registerAdmin = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { name, email, phone, password, adminSecret } = body;

  if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
    const err = new Error("Invalid admin secret");
    err.statusCode = 403;
    throw err;
  }

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const emailNorm = email.toLowerCase().trim();
  const [existingUser, existingMaster, existingAdmin] = await Promise.all([
    User.findOne({ email: emailNorm }),
    Master.findOne({ email: emailNorm }),
    Admin.findOne({ email: emailNorm }),
  ]);
  if (existingUser || existingMaster || existingAdmin) {
    const err = new Error("Account already exists with this email");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const admin = await Admin.create({
    name,
    email: emailNorm,
    phone: phone || "",
    password: hashedPassword,
  });

  const tokens = issueAuthCookies(res, admin._id, "admin");
  const data = await buildMePayload(admin, "admin");

  res.status(201).json({
    success: true,
    data,
    message: "Registered successfully",
    ...exposeAccessTokenPayload(tokens.accessToken),
  });
});

// @desc    Register master (professional) - creates in masters collection
// @route   POST /api/auth/masters/register
// @access  Public
const registerMaster = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  const emailNorm = email.toLowerCase().trim();

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const [existingUser, existingMaster] = await Promise.all([
    User.findOne({ email: emailNorm }),
    Master.findOne({ email: emailNorm }),
  ]);
  if (existingUser || existingMaster) {
    const err = new Error("Account already exists with this email");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const slug = slugify(name) + "-" + Date.now().toString(36).slice(-6);
  const master = await Master.create({
    name,
    email: emailNorm,
    phone: phone || "",
    password: hashedPassword,
    slug,
  });

  let REGISTRATION_BONUS = parseInt(
    process.env.CREDIT_REGISTRATION_BONUS || "30",
    10,
  );
  if (!Number.isFinite(REGISTRATION_BONUS) || REGISTRATION_BONUS < 0) {
    REGISTRATION_BONUS = 30;
  }
  master.credits = REGISTRATION_BONUS;
  await master.save();

  await CreditTransaction.create({
    master: master._id,
    type: "grant",
    amount: REGISTRATION_BONUS,
    balanceBefore: 0,
    balanceAfter: REGISTRATION_BONUS,
    action: "registration_bonus",
  });

  const tokens = issueAuthCookies(res, master._id, "master");
  const data = await buildMePayload(master, "master");

  res.status(201).json({
    success: true,
    data,
    message: "Registered successfully",
    ...exposeAccessTokenPayload(tokens.accessToken),
  });
});

// @desc    Login - checks users (clients, admins) and masters
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = email.toLowerCase().trim();

  if (!email || !password) {
    const err = new Error("Please provide email and password");
    err.statusCode = 400;
    throw err;
  }

  let user = await User.findOne({ email: emailNorm }).select("+password");
  if (user) {
    if (user.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    const isMatch = await isPasswordMatched(password, user.password);
    if (!isMatch) {
      const err = new Error("Invalid login credentials");
      err.statusCode = 401;
      throw err;
    }
    const tokens = issueAuthCookies(res, user._id, "user");
    return res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        image: user.image || "",
      },
      message: "Logged in successfully",
      ...exposeAccessTokenPayload(tokens.accessToken),
    });
  }

  const master = await Master.findOne({ email: emailNorm }).select(
    "+password",
  );
  if (master) {
    if (master.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    const isMatch = await isPasswordMatched(password, master.password);
    if (!isMatch) {
      const err = new Error("Invalid login credentials");
      err.statusCode = 401;
      throw err;
    }
    const tokens = issueAuthCookies(res, master._id, "master");
    const data = await buildMePayload(master, "master");
    return res.json({
      success: true,
      data,
      message: "Logged in successfully",
      ...exposeAccessTokenPayload(tokens.accessToken),
    });
  }

  const admin = await Admin.findOne({ email: emailNorm }).select("+password");
  if (admin) {
    if (admin.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    const isMatch = await isPasswordMatched(password, admin.password);
    if (!isMatch) {
      const err = new Error("Invalid login credentials");
      err.statusCode = 401;
      throw err;
    }
    issueAuthCookies(res, admin._id, "admin");
    const data = await buildMePayload(admin, "admin");
    return res.json({
      success: true,
      data,
      message: "Logged in successfully",
    });
  }

  const err = new Error("Invalid login credentials");
  err.statusCode = 401;
  throw err;
});

// @desc    Refresh access token (and optionally rotate refresh token)
// @route   POST /api/auth/refresh
// @access  Public (requires refresh_token cookie)
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    const err = new Error("Refresh token missing");
    err.statusCode = 401;
    throw err;
  }

  const decoded = verifyToken(refreshToken, { tokenType: "refresh" });
  if (!decoded) {
    const err = new Error("Invalid or expired refresh token");
    err.statusCode = 401;
    throw err;
  }

  let account = null;
  if (decoded.type === "master") {
    account = await Master.findById(decoded.id).select("_id isBlocked");
  } else if (decoded.type === "admin") {
    account = await Admin.findById(decoded.id).select("_id isBlocked");
  } else {
    account = await User.findById(decoded.id).select("_id isBlocked");
  }

  if (!account) {
    const err = new Error("Account not found");
    err.statusCode = 401;
    throw err;
  }
  if (account.isBlocked) {
    const err = new Error("Account is blocked. Contact support.");
    err.statusCode = 403;
    throw err;
  }

  const role = decoded.type === "master" ? "master" : decoded.type === "admin" ? "admin" : "user";
  const accessToken = generateToken(decoded.id, role, { tokenType: "access" });
  setAuthCookie(res, accessToken);

  // Rotate refresh token by default for better security.
  const shouldRotate =
    String(process.env.ROTATE_REFRESH_TOKEN || "true").toLowerCase() !== "false";
  if (shouldRotate) {
    const newRefreshToken = generateToken(decoded.id, role, { tokenType: "refresh" });
    setRefreshCookie(res, newRefreshToken);
  }

  res.json({
    success: true,
    message: "Access token refreshed",
    ...exposeAccessTokenPayload(accessToken),
  });
});

// @desc    Update profile (partial JSON / multipart). Omitted fields unchanged. Clients: name, email, phone, location; masters also specialty, bio, socials.
// @route   PUT/PATCH /api/auth/profile, PATCH/PUT /api/auth/me
// @access  Private (works for users, masters, and admins)
const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const {
    name,
    phone,
    email,
    password,
    specialty,
    location,
    bio,
    instagram,
    website,
  } = body;
  const accountId = req.user._id;
  const isMaster = req.user.role === "master";
  const isAdmin = req.user.role === "admin";
  const isUser = req.user.role === "user";

  const updateData = {};

  if (name !== undefined) {
    const t = String(name).trim();
    if (!t) {
      const err = new Error("name cannot be empty");
      err.statusCode = 400;
      throw err;
    }
    updateData.name = t;
  }

  if (phone !== undefined) {
    updateData.phone = phone == null ? "" : String(phone).trim();
  }

  if (email !== undefined) {
    const emailNorm = String(email).toLowerCase().trim();
    if (!emailNorm) {
      const err = new Error("email cannot be empty");
      err.statusCode = 400;
      throw err;
    }
    if (isMaster) {
      const existing = await Master.findOne({
        email: emailNorm,
        _id: { $ne: accountId },
      });
      if (existing) {
        const err = new Error("Email already in use by another account");
        err.statusCode = 409;
        throw err;
      }
    } else if (isAdmin) {
      const existing = await Admin.findOne({
        email: emailNorm,
        _id: { $ne: accountId },
      });
      if (existing) {
        const err = new Error("Email already in use by another account");
        err.statusCode = 409;
        throw err;
      }
    } else {
      const existing = await User.findOne({
        email: emailNorm,
        _id: { $ne: accountId },
      });
      if (existing) {
        const err = new Error("Email already in use by another account");
        err.statusCode = 409;
        throw err;
      }
    }
    updateData.email = emailNorm;
  }

  if (password !== undefined && String(password).trim()) {
    updateData.password = await hashPassword(String(password));
  }

  if (req.file && req.file.buffer) {
    updateData.image = await uploadToB2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      "profiles",
    );
  } else if (body.image !== undefined) {
    const err = new Error(
      "Profile image must be uploaded as multipart/form-data (field name: image).",
    );
    err.statusCode = 400;
    throw err;
  }

  if (isUser && location !== undefined) {
    updateData.location = location == null ? "" : String(location).trim();
  }

  if (isMaster) {
    if (specialty !== undefined) {
      const v = validateSpecialty(specialty);
      if (!v.ok) {
        const err = new Error(v.message);
        err.statusCode = 400;
        throw err;
      }
      updateData.specialty = v.specialty === undefined ? undefined : v.specialty;
    }
    if (location !== undefined) {
      updateData.location = location == null ? "" : String(location).trim();
    }
    if (bio !== undefined) updateData.bio = bio == null ? "" : String(bio).trim();
    if (instagram !== undefined) {
      updateData.instagram = instagram == null ? "" : String(instagram).trim();
    }
    if (website !== undefined) {
      updateData.website = website == null ? "" : String(website).trim();
    }
  }

  const role = req.user.role;
  if (Object.keys(updateData).length === 0) {
    const doc = isMaster
      ? await Master.findById(accountId).select("-password")
      : isAdmin
        ? await Admin.findById(accountId).select("-password")
        : await User.findById(accountId).select("-password");
    if (!doc) {
      const err = new Error("Account not found");
      err.statusCode = 404;
      throw err;
    }
    const data = await buildMePayload(doc, role);
    return res.json({
      success: true,
      data,
      message: "No fields to update",
    });
  }

  const doc = isMaster
    ? await Master.findByIdAndUpdate(accountId, updateData, {
        new: true,
        runValidators: true,
      }).select("-password")
    : isAdmin
      ? await Admin.findByIdAndUpdate(accountId, updateData, {
          new: true,
          runValidators: true,
        }).select("-password")
      : await User.findByIdAndUpdate(accountId, updateData, {
          new: true,
          runValidators: true,
        }).select("-password");

  if (!doc) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }

  const data = await buildMePayload(doc, role);

  res.json({
    success: true,
    data,
    message: "Profile updated successfully",
  });
});

// @desc    Get current logged-in user, master, or admin
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const isMaster = req.user.role === "master";
  const isAdmin = req.user.role === "admin";
  const doc = isMaster
    ? await Master.findById(req.user._id).select("-password")
    : isAdmin
      ? await Admin.findById(req.user._id).select("-password")
      : await User.findById(req.user._id).select("-password");
  if (!doc) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }
  const data = await buildMePayload(doc, req.user.role);
  res.json({
    success: true,
    data,
  });
});

// @desc    Logout - clear auth cookie
// @route   POST /api/auth/logout
// @access  Public
const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  clearRefreshCookie(res);
  res.status(204).end();
});

module.exports = {
  registerUser,
  registerAdmin,
  registerMaster,
  login,
  refresh,
  logout,
  getMe,
  updateProfile,
};
