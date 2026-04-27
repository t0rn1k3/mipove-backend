const multer = require("multer");

const fourMb = 4 * 1024 * 1024;

const ALLOWED_IMAGE_MIMETYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const MAX_PORTFOLIO_IMAGES = 30;

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
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
  MAX_IMAGE_FILE_BYTES: fourMb,
  MAX_PORTFOLIO_IMAGES,
  ALLOWED_IMAGE_MIMETYPES,
};
