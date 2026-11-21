const Client   = require("../Model/ClientModel");
const Campaign = require("../Model/CampaignModel");
const Doctor   = require("../Model/DoctorModel");
const QRScan   = require("../Model/QRScanModel");
const QuizAttempt = require("../Model/QuizAttemptModel");

// ── helpers ───────────────────────────────────────────────
const generateClientId = () =>
  "CLT-" + Date.now().toString(36).toUpperCase();

// ════════════════════════════════════════════════
// GET /api/clients
// Query: ?status=active&page=1&limit=10&search=abc
// ════════════════════════════════════════════════
const getAllClients = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (search) {
      filter.$or = [
        { companyName:    { $regex: search, $options: "i" } },
        { brandName:      { $regex: search, $options: "i" } },
        { primaryContact: { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Client.countDocuments(filter);

    const clients = await Client.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("createdBy", "name email")
      .lean();

    // ── Attach live campaign/doctor counts ────────────────
    const clientIds = clients.map((c) => c._id);

    const [campaignCounts, doctorCounts] = await Promise.all([
      Campaign.aggregate([
        { $match: { client: { $in: clientIds } } },
        { $group: { _id: "$client", total: { $sum: 1 } } },
      ]),
      Doctor.aggregate([
        { $match: { campaign: { $exists: true } } },
        {
          $lookup: {
            from: "campaigns",
            localField: "campaign",
            foreignField: "_id",
            as: "camp",
          },
        },
        { $unwind: "$camp" },
        { $group: { _id: "$camp.client", total: { $sum: 1 } } },
      ]),
    ]);

    const campMap   = Object.fromEntries(campaignCounts.map((x) => [x._id.toString(), x.total]));
    const doctorMap = Object.fromEntries(doctorCounts.map((x) => [x._id.toString(), x.total]));

    const enriched = clients.map((c) => ({
      ...c,
      campaignCount: campMap[c._id.toString()] || 0,
      doctorCount:   doctorMap[c._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      data:  enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/clients/:id
// ════════════════════════════════════════════════
const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate("campaigns", "name status therapyArea startDate endDate")
      .populate("createdBy", "name email")
      .lean();

    if (!client) return res.status(404).json({ success: false, error: "Client not found" });

    res.status(200).json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// POST /api/clients
// ════════════════════════════════════════════════
const createClient = async (req, res) => {
  try {
    const {
      companyName, brandName, primaryContact,
      email, phone, address, city, state, country, website,
    } = req.body;

    if (!companyName) {
      return res.status(400).json({ success: false, error: "companyName is required" });
    }

    const client = new Client({
      clientId: generateClientId(),
      companyName,
      brandName,
      primaryContact,
      email,
      phone,
      address,
      city,
      state,
      country,
      website,
      logo:      req.file?.path || null, // if using multer for logo upload
      createdBy: req.admin?._id || null,
    });

    await client.save();
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// PUT /api/clients/:id
// ════════════════════════════════════════════════
const updateClient = async (req, res) => {
  try {
    const allowed = [
      "companyName", "brandName", "primaryContact",
      "email", "phone", "address", "city", "state",
      "country", "website", "status",
    ];

    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    if (req.file?.path) updates.logo = req.file.path;

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!client) return res.status(404).json({ success: false, error: "Client not found" });

    res.status(200).json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// DELETE /api/clients/:id
// ════════════════════════════════════════════════
const deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: "Client not found" });

    // Safety: don't delete if active campaigns exist
    const activeCampaigns = await Campaign.countDocuments({
      client: client._id,
      status: "active",
    });
    if (activeCampaigns > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete — ${activeCampaigns} active campaign(s) exist. Pause or archive them first.`,
      });
    }

    await Client.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Client deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/clients/:id/stats
// Full analytics for the Client Details side panel
// ════════════════════════════════════════════════
const getClientStats = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ success: false, error: "Client not found" });

    // All campaigns for this client
    const campaigns = await Campaign.find({ client: client._id }, "_id status").lean();
    const campIds   = campaigns.map((c) => c._id);

    const [totalDoctors, totalScans, totalAttempts] = await Promise.all([
      Doctor.countDocuments({ campaign: { $in: campIds } }),
      QRScan.countDocuments({ campaign: { $in: campIds } }),
      QuizAttempt.countDocuments({ campaign: { $in: campIds } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter((c) => c.status === "active").length,
        totalDoctors,
        totalScans,
        totalAttempts,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
};