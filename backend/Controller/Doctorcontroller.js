const Doctor      = require("../Model/DoctorModel");
const Campaign    = require("../Model/CampaignModel");
const QRScan      = require("../Model/QRScanModel");
const QuizAttempt = require("../Model/QuizAttemptModel");
const QRCode      = require("qrcode"); // npm i qrcode

// ── helpers ───────────────────────────────────────────────
const generateDoctorId = () =>
  "DOC-" + Date.now().toString(36).toUpperCase();

// Short code for QR URL: "ML9823" style
const generateShortCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// Detect device type from user-agent string
const detectDevice = (ua = "") => {
  if (!ua) return "unknown";
  if (/tablet|ipad/i.test(ua))  return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
};

// ════════════════════════════════════════════════
// GET /api/doctors
// Query: ?status=active&campaign=<id>&city=Mumbai&
//        specialty=Gastro&page=1&limit=10&search=lele
// ════════════════════════════════════════════════
const getAllDoctors = async (req, res) => {
  try {
    const {
      status, campaign, city, specialty,
      search, page = 1, limit = 10,
    } = req.query;

    const filter = {};
    if (status   && status !== "all")   filter.status   = status;
    if (campaign)                        filter.campaign = campaign;
    if (city     && city !== "all")     filter.city     = { $regex: city, $options: "i" };
    if (specialty && specialty !== "all") filter.specialty = { $regex: specialty, $options: "i" };

    if (search) {
      filter.$or = [
        { name:      { $regex: search, $options: "i" } },
        { specialty: { $regex: search, $options: "i" } },
        { clinic:    { $regex: search, $options: "i" } },
        { city:      { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Doctor.countDocuments(filter);

    const doctors = await Doctor.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("campaign", "name therapyArea brand")
      .populate("mr",       "mrName mrId HQ")
      .lean();

    res.status(200).json({
      success: true,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      data:  doctors,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/doctors/:id
// ════════════════════════════════════════════════
const getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .populate("campaign", "name therapyArea brand quiz")
      .populate("mr",       "mrName mrId HQ region")
      .lean();

    if (!doctor) return res.status(404).json({ success: false, error: "Doctor not found" });

    res.status(200).json({ success: true, data: doctor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// POST /api/doctors
// ════════════════════════════════════════════════
const createDoctor = async (req, res) => {
  try {
    const {
      name, specialty, clinic, city, state,
      campaign, mr, consentGiven, consentDate,
    } = req.body;

    if (!name)     return res.status(400).json({ success: false, error: "name is required" });
    if (!campaign) return res.status(400).json({ success: false, error: "campaign is required" });

    const campaignDoc = await Campaign.findById(campaign);
    if (!campaignDoc) return res.status(404).json({ success: false, error: "Campaign not found" });

    // Build slug — ensure uniqueness
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    let slug      = baseSlug;
    let slugTaken = await Doctor.findOne({ pageSlug: slug });
    let counter   = 1;
    while (slugTaken) {
      slug      = `${baseSlug}-${counter++}`;
      slugTaken = await Doctor.findOne({ pageSlug: slug });
    }

    const doctor = new Doctor({
      doctorId:     generateDoctorId(),
      name,
      specialty,
      clinic,
      city,
      state,
      pageSlug:    slug,
      campaign,
      mr:          mr || null,
      photo:       req.file?.path || null,
      consentGiven: consentGiven === "true" || consentGiven === true,
      consentDate:  consentDate || null,
    });

    await doctor.save();

    // Link doctor to campaign
    await Campaign.findByIdAndUpdate(campaign, {
      $addToSet: { doctors: doctor._id },
    });

    res.status(201).json({ success: true, data: doctor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// PUT /api/doctors/:id
// ════════════════════════════════════════════════
const updateDoctor = async (req, res) => {
  try {
    const allowed = [
      "name", "specialty", "clinic", "city", "state",
      "status", "pageStatus", "consentGiven", "consentDate",
      "videoStatus", "videos",
    ];

    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    if (req.file?.path) updates.photo = req.file.path;

    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!doctor) return res.status(404).json({ success: false, error: "Doctor not found" });

    res.status(200).json({ success: true, data: doctor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// DELETE /api/doctors/:id
// ════════════════════════════════════════════════
const deleteDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, error: "Doctor not found" });

    // Remove from campaign
    if (doctor.campaign) {
      await Campaign.findByIdAndUpdate(doctor.campaign, {
        $pull: { doctors: doctor._id },
      });
    }

    await Doctor.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Doctor deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// POST /api/doctors/:id/generate-qr
// Generates QR code PNG (base64) and short URL
// ════════════════════════════════════════════════
const generateQR = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, error: "Doctor not found" });

    const shortCode = generateShortCode();
    const BASE_URL  = process.env.BASE_URL || "https://quiz.pharma.com";
    console.log('BASE_URL from env:', process.env.BASE_URL);
    const shortUrl  = `${BASE_URL}/q/${shortCode}`;
    const fullUrl   = `${BASE_URL}/dr/${doctor.pageSlug}`;

    // Generate QR as base64 PNG
    const qrBase64 = await QRCode.toDataURL(fullUrl, {
      width:           400,
      margin:          2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    // Generate QR as SVG string
    const qrSvg = await QRCode.toString(fullUrl, { type: "svg" });

    // Save to doctor (in production save to S3 and store URL)
    doctor.qrCode  = qrBase64;  // swap for S3 URL in prod
    doctor.qrCodeSvg = qrSvg;
    doctor.shortUrl  = shortUrl;
    doctor.qrStatus  = "active";
    await doctor.save();

    res.status(200).json({
      success: true,
      data: {
        qrCode:   qrBase64,
        qrSvg,
        shortUrl,
        fullUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/doctors/:id/scans
// Scan history for a doctor (used in "View Scans" panel)
// ════════════════════════════════════════════════
const getDoctorScans = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip  = (Number(page) - 1) * Number(limit);

    const total = await QRScan.countDocuments({ doctor: req.params.id });
    const scans = await QRScan.find({ doctor: req.params.id })
      .sort({ scannedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: scans,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/doctors/page/:slug   ← PUBLIC ROUTE
// This is what loads when a patient scans the QR.
// Returns doctor info + quiz questions + video URLs.
// ════════════════════════════════════════════════
const getDoctorPage = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      pageSlug:   req.params.slug,
      pageStatus: "published",
      status:     "active",
    })
      .populate({
        path:     "campaign",
        populate: { path: "quiz" },
      })
      .lean();

    if (!doctor) {
      return res.status(404).json({ success: false, error: "Page not found or not published" });
    }

    // ── Log the QR scan ───────────────────────────────────
    const ua      = req.headers["user-agent"] || "";
    const ip      = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;

    await QRScan.create({
      doctor:     doctor._id,
      campaign:   doctor.campaign._id,
      deviceType: detectDevice(ua),
      userAgent:  ua,
      ipAddress:  ip,
      scannedAt:  new Date(),
    });

    // ── Increment doctor scan counter ─────────────────────
    await Doctor.findByIdAndUpdate(doctor._id, {
      $inc: { totalScans: 1 },
      $set: { lastScanned: new Date() },
    });

    // ── Return everything the quiz app needs ──────────────
    res.status(200).json({
      success: true,
      data: {
        doctor: {
          id:       doctor._id,
          name:     doctor.name,
          photo:    doctor.photo,
          specialty: doctor.specialty,
          clinic:   doctor.clinic,
          city:     doctor.city,
          videos:   doctor.videos,
        },
        quiz: doctor.campaign?.quiz || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  generateQR,
  getDoctorScans,
  getDoctorPage,
};