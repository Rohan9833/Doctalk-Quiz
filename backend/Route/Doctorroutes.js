const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect, restrictTo } = require("../Controller/Authmiddleware");
const {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  generateQR,
  getDoctorScans,
  getDoctorPage,
} = require("../Controller/Doctorcontroller");

const upload = multer({ storage: multer.memoryStorage() });

// Public patient-facing page
router.get("/page/:slug", getDoctorPage);

// Protect all admin doctor routes below this
router.use(protect);

router.get("/", getAllDoctors);
router.get("/:id", getDoctorById);
router.get("/:id/scans", getDoctorScans);
router.post("/", upload.single("photo"), createDoctor);
router.put("/:id", upload.single("photo"), updateDoctor);
router.post("/:id/generate-qr", generateQR);
router.delete("/:id", restrictTo("superadmin", "admin"), deleteDoctor);

module.exports = router;