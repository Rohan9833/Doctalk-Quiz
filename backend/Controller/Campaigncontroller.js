const Campaign    = require("../Model/CampaignModel");
const Client      = require("../Model/ClientModel");
const Doctor      = require("../Model/DoctorModel");
const QRScan      = require("../Model/QRScanModel");
const QuizAttempt = require("../Model/QuizAttemptModel");

// ── helpers ───────────────────────────────────────────────
const generateCampaignId = () =>
  "CMP-" + Date.now().toString(36).toUpperCase();

// ════════════════════════════════════════════════
// GET /api/campaigns
// Query: ?status=active&client=<id>&page=1&limit=10&search=gerd
// ════════════════════════════════════════════════
const getAllCampaigns = async (req, res) => {
  console.log("Fetching campaigns with filters:", req.query);
  try {
    const { status, client, search, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (client)                     filter.client = client;
    if (search) {
      filter.$or = [
        { name:         { $regex: search, $options: "i" } },
        { therapyArea:  { $regex: search, $options: "i" } },
        { brand:        { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Campaign.countDocuments(filter);

    const campaigns = await Campaign.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("client", "companyName brandName logo")
      .populate("quiz",   "name version status")
      .populate("createdBy", "name")
      .lean();

    // ── Attach live stats per campaign ────────────────────
    const campIds = campaigns.map((c) => c._id);

    const [scanCounts, attemptCounts, doctorCounts] = await Promise.all([
      QRScan.aggregate([
        { $match: { campaign: { $in: campIds } } },
        { $group: { _id: "$campaign", total: { $sum: 1 } } },
      ]),
      QuizAttempt.aggregate([
        { $match: { campaign: { $in: campIds } } },
        { $group: {
            _id:         "$campaign",
            total:       { $sum: 1 },
            completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            avgScore:    { $avg: "$score" },
        }},
      ]),
      Doctor.aggregate([
        { $match: { campaign: { $in: campIds } } },
        { $group: { _id: "$campaign", total: { $sum: 1 } } },
      ]),
    ]);

    const scanMap    = Object.fromEntries(scanCounts.map((x) => [x._id.toString(), x.total]));
    const attemptMap = Object.fromEntries(attemptCounts.map((x) => [x._id.toString(), x]));
    const doctorMap  = Object.fromEntries(doctorCounts.map((x) => [x._id.toString(), x.total]));

    const enriched = campaigns.map((c) => {
      const id   = c._id.toString();
      const att  = attemptMap[id] || {};
      const comp = att.completions || 0;
      const tot  = att.total || 0;
      return {
        ...c,
        doctorCount:      doctorMap[id] || 0,
        totalScans:       scanMap[id]   || 0,
        quizAttempts:     tot,
        completions:      comp,
        completionRate:   tot > 0 ? +((comp / tot) * 100).toFixed(1) : 0,
        avgScore:         att.avgScore ? +(att.avgScore).toFixed(1) : 0,
      };
    });

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
// GET /api/campaigns/:id
// ════════════════════════════════════════════════
const getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate("client",    "companyName brandName logo")
      .populate("quiz",      "name version questions status timePerQuestion")
      .populate("createdBy", "name email")
      .lean();

    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });

    // ── Progress overview (for the side panel) ───────────
    const [doctorCount, scanCount, attemptAgg] = await Promise.all([
      Doctor.countDocuments({ campaign: campaign._id }),
      QRScan.countDocuments({ campaign: campaign._id }),
      QuizAttempt.aggregate([
        { $match: { campaign: campaign._id } },
        { $group: {
            _id:         null,
            total:       { $sum: 1 },
            completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            avgScore:    { $avg: "$score" },
        }},
      ]),
    ]);

    const agg  = attemptAgg[0] || {};
    const comp = agg.completions || 0;
    const tot  = agg.total       || 0;

    res.status(200).json({
      success: true,
      data: {
        ...campaign,
        stats: {
          doctorCount,
          totalScans:     scanCount,
          quizAttempts:   tot,
          completions:    comp,
          completionRate: tot > 0 ? +((comp / tot) * 100).toFixed(1) : 0,
          avgScore:       agg.avgScore ? +agg.avgScore.toFixed(1) : 0,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// POST /api/campaigns
// ════════════════════════════════════════════════
const createCampaign = async (req, res) => {
  try {
    const {
      name, therapyArea, brand, description,
      startDate, endDate, targetDoctors, client, quiz,
    } = req.body;

    if (!name)   return res.status(400).json({ success: false, error: "name is required" });
    if (!client) return res.status(400).json({ success: false, error: "client is required" });

    const clientDoc = await Client.findById(client);
    if (!clientDoc) return res.status(404).json({ success: false, error: "Client not found" });

    const campaign = new Campaign({
      campaignId: generateCampaignId(),
      name,
      therapyArea,
      brand,
      description,
      startDate,
      endDate,
      targetDoctors: targetDoctors || 0,
      client,
      quiz:      quiz || null,
      thumbnail: req.file?.path || null,
      createdBy: req.admin?._id || null,
    });

    await campaign.save();

    // Link back to client
    await Client.findByIdAndUpdate(client, {
      $addToSet: { campaigns: campaign._id },
    });

    res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// PUT /api/campaigns/:id
// ════════════════════════════════════════════════
const updateCampaign = async (req, res) => {
  try {
    const allowed = [
      "name", "therapyArea", "brand", "description",
      "startDate", "endDate", "targetDoctors", "status", "quiz",
    ];

    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    if (req.file?.path) updates.thumbnail = req.file.path;

    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("client", "companyName brandName");

    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });

    res.status(200).json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// DELETE /api/campaigns/:id
// ════════════════════════════════════════════════
const deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });

    if (campaign.status === "active") {
      return res.status(400).json({
        success: false,
        error: "Cannot delete an active campaign. Pause or archive it first.",
      });
    }

    // Remove from client's campaigns array
    await Client.findByIdAndUpdate(campaign.client, {
      $pull: { campaigns: campaign._id },
    });

    await Campaign.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Campaign deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/campaigns/:id/stats
// Detailed stats for Campaign Overview side panel
// ════════════════════════════════════════════════
const getCampaignStats = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });

    const [doctorCount, scanCount, attemptAgg, locationBreakdown] = await Promise.all([

      Doctor.countDocuments({ campaign: campaign._id }),

      QRScan.countDocuments({ campaign: campaign._id }),

      QuizAttempt.aggregate([
        { $match: { campaign: campaign._id } },
        { $group: {
            _id:         null,
            total:       { $sum: 1 },
            completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            avgScore:    { $avg: "$score" },
        }},
      ]),

      // Scans grouped by state
      QRScan.aggregate([
        { $match: { campaign: campaign._id } },
        { $group: { _id: "$state", scans: { $sum: 1 } } },
        { $sort: { scans: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const agg  = attemptAgg[0] || {};
    const comp = agg.completions || 0;
    const tot  = agg.total       || 0;

    res.status(200).json({
      success: true,
      data: {
        doctorsOnboarded:  doctorCount,
        targetDoctors:     campaign.targetDoctors,
        doctorProgress:    campaign.targetDoctors > 0
          ? +((doctorCount / campaign.targetDoctors) * 100).toFixed(1)
          : 0,
        totalScans:        scanCount,
        quizAttempts:      tot,
        completions:       comp,
        completionRate:    tot > 0 ? +((comp / tot) * 100).toFixed(1) : 0,
        avgScore:          agg.avgScore ? +agg.avgScore.toFixed(1) : 0,
        locationBreakdown,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignStats,
};