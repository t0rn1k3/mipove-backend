const multer = require("multer");

const fourMb = 4 * 1024 * 1024;

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed."),
      false,
    );
  }
};

const memoryImageMulter = () =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: fourMb },
    fileFilter,
  });

const profileImageUpload = memoryImageMulter();
const orderAttachmentsUpload = memoryImageMulter();
const portfolioImagesUpload = memoryImageMulter();

module.exports = {
  profileImageUpload,
  orderAttachmentsUpload,
  portfolioImagesUpload,
};
