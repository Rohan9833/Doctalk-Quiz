const Doctor      = require("../Model/DoctorModel");
const Campaign    = require("../Model/CampaignModel");
const Client      = require("../Model/ClientModel");
const QRScan      = require("../Model/QRScanModel");
const QuizAttempt = require("../Model/QuizAttemptModel");

// ── Date range helper ─────────────────────────────────────
const getDateRange = (range) => {
  const now   = new Date();
  const start = new Date();
  switch (range) {
    case "7d":  start.setDate(now.getDate() - 7);  break;
    case "30d": start.setDate(now.getDate() - 30); break;
    case "90d": start.setDate(now.getDate() - 90); break;
    default:    start.setDate(now.getDate() - 7);
  }
  return { start, end: now };
};

// ════════════════════════════════════════════════
// GET /api/analytics/dashboard
// Top-level numbers for the Dashboard page
// Query: ?range=7d&campaign=<id>
// ════════════════════════════════════════════════
const getDashboardStats = async (req, res) => {
  try {
    const { range = "7d", campaign } = req.query;
    const { start, end } = getDateRange(range);

    // ── Build campaign filter for scoped views ────────────
    const campFilter = campaign ? { campaign } : {};

    const [
      totalDoctors,
      activeDoctorPages,
      totalScans,
      quizStarts,
      quizCompletions,
      avgScoreAgg,
      // Trend comparison (previous period)
      prevScans,
      prevStarts,
      prevCompletions,
    ] = await Promise.all([
      Doctor.countDocuments({ ...campFilter }),
      Doctor.countDocuments({ ...campFilter, pageStatus: "published" }),

      QRScan.countDocuments({ ...campFilter, scannedAt: { $gte: start, $lte: end } }),
      QuizAttempt.countDocuments({ ...campFilter, startedAt: { $gte: start, $lte: end } }),
      QuizAttempt.countDocuments({
        ...campFilter,
        status:      "completed",
        completedAt: { $gte: start, $lte: end },
      }),

      QuizAttempt.aggregate([
        {
          $match: {
            ...campFilter,
            status:      "completed",
            completedAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, avg: { $avg: "$score" }, total: { $first: "$totalQuestions" } } },
      ]),

      // Previous period for trend %
      QRScan.countDocuments({
        ...campFilter,
        scannedAt: {
          $gte: new Date(start.getTime() - (end - start)),
          $lte: start,
        },
      }),
      QuizAttempt.countDocuments({
        ...campFilter,
        startedAt: {
          $gte: new Date(start.getTime() - (end - start)),
          $lte: start,
        },
      }),
      QuizAttempt.countDocuments({
        ...campFilter,
        status:      "completed",
        completedAt: {
          $gte: new Date(start.getTime() - (end - start)),
          $lte: start,
        },
      }),
    ]);

    const avgAgg   = avgScoreAgg[0] || {};
    const maxScore = avgAgg.total || 5;
    const avgPct   = avgAgg.avg
      ? +((avgAgg.avg / maxScore) * 100).toFixed(1)
      : 0;

    const trend = (curr, prev) =>
      prev > 0 ? +(((curr - prev) / prev) * 100).toFixed(1) : null;

    res.status(200).json({
      success: true,
      data: {
        totalDoctors,
        activeDoctorPages,
        draftDoctorPages: totalDoctors - activeDoctorPages,
        totalScans,
        quizStarts,
        quizCompletions,
        avgScore: avgPct,
        trends: {
          scans:       trend(totalScans,       prevScans),
          quizStarts:  trend(quizStarts,       prevStarts),
          completions: trend(quizCompletions,  prevCompletions),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/analytics/activity
// Daily quiz starts + completions for the line chart
// Query: ?range=7d&campaign=<id>
// ════════════════════════════════════════════════
const getActivityOverTime = async (req, res) => {
  try {
    const { range = "7d", campaign } = req.query;
    const { start, end } = getDateRange(range);
    const campFilter = campaign ? { campaign } : {};

    const [startsData, completionsData] = await Promise.all([
      QuizAttempt.aggregate([
        { $match: { ...campFilter, startedAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: "%d %b", date: "$startedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      QuizAttempt.aggregate([
        {
          $match: {
            ...campFilter,
            status:      "completed",
            completedAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%d %b", date: "$completedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Merge into a unified array by date
    const dateMap = {};
    startsData.forEach((d) => {
      dateMap[d._id] = { date: d._id, starts: d.count, completions: 0 };
    });
    completionsData.forEach((d) => {
      if (dateMap[d._id]) dateMap[d._id].completions = d.count;
      else dateMap[d._id] = { date: d._id, starts: 0, completions: d.count };
    });

    const result = Object.values(dateMap).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/analytics/map
// QR scans grouped by state + top cities
// Query: ?range=7d&campaign=<id>
// ════════════════════════════════════════════════
const getMapData = async (req, res) => {
  try {
    const { range = "7d", campaign } = req.query;
    const { start, end } = getDateRange(range);
    const campFilter = campaign ? { campaign } : {};

    const [byState, byCity] = await Promise.all([
      QRScan.aggregate([
        { $match: { ...campFilter, scannedAt: { $gte: start, $lte: end }, state: { $ne: null } } },
        { $group: { _id: "$state", scans: { $sum: 1 } } },
        { $sort: { scans: -1 } },
      ]),
      QRScan.aggregate([
        { $match: { ...campFilter, scannedAt: { $gte: start, $lte: end }, city: { $ne: null } } },
        { $group: { _id: { city: "$city", state: "$state" }, scans: { $sum: 1 } } },
        { $sort: { scans: -1 } },
        { $limit: 10 },
        { $project: { city: "$_id.city", state: "$_id.state", scans: 1, _id: 0 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: { byState, topCities: byCity },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/analytics/devices
// Device type breakdown for the donut chart
// Query: ?range=7d&campaign=<id>
// ════════════════════════════════════════════════
const getDeviceBreakdown = async (req, res) => {
  try {
    const { range = "7d", campaign } = req.query;
    const { start, end } = getDateRange(range);
    const campFilter = campaign ? { campaign } : {};

    const data = await QRScan.aggregate([
      { $match: { ...campFilter, scannedAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$deviceType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = data.reduce((s, d) => s + d.count, 0);
    const result = data.map((d) => ({
      device:  d._id,
      count:   d.count,
      percent: total > 0 ? +((d.count / total) * 100).toFixed(1) : 0,
    }));

    res.status(200).json({ success: true, data: result, total });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/analytics/top-doctors
// Top performing doctors by avg score
// Query: ?range=7d&campaign=<id>&limit=6
// ════════════════════════════════════════════════
const getTopDoctors = async (req, res) => {
  try {
    const { range = "7d", campaign, limit = 6 } = req.query;
    const { start, end } = getDateRange(range);
    const campFilter = campaign ? { campaign } : {};

    const top = await QuizAttempt.aggregate([
      {
        $match: {
          ...campFilter,
          status:      "completed",
          completedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id:            "$doctor",
          avgScore:       { $avg: "$score" },
          totalQuestions: { $first: "$totalQuestions" },
          attempts:       { $sum: 1 },
        },
      },
      { $sort: { avgScore: -1 } },
      { $limit: Number(limit) },
      {
        $lookup: {
          from:         "doctors",
          localField:   "_id",
          foreignField: "_id",
          as:           "doctor",
        },
      },
      { $unwind: "$doctor" },
      {
        $project: {
          _id:      0,
          doctorId: "$_id",
          name:     "$doctor.name",
          photo:    "$doctor.photo",
          city:     "$doctor.city",
          state:    "$doctor.state",
          attempts: 1,
          avgScore: {
            $round: [
              { $multiply: [{ $divide: ["$avgScore", "$totalQuestions"] }, 100] },
              1,
            ],
          },
        },
      },
    ]);

    res.status(200).json({ success: true, data: top });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/analytics/campaign-performance
// Table on dashboard — per-campaign stats
// ════════════════════════════════════════════════
const getCampaignPerformance = async (req, res) => {
  try {
    const { range = "7d" } = req.query;
    const { start, end }   = getDateRange(range);

    const campaigns = await Campaign.find({ status: "active" })
      .select("name _id")
      .lean();

    const campIds = campaigns.map((c) => c._id);

    const [scans, attempts, doctors] = await Promise.all([
      QRScan.aggregate([
        { $match: { campaign: { $in: campIds }, scannedAt: { $gte: start, $lte: end } } },
        { $group: { _id: "$campaign", total: { $sum: 1 } } },
      ]),
      QuizAttempt.aggregate([
        { $match: { campaign: { $in: campIds }, startedAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:         "$campaign",
            starts:      { $sum: 1 },
            completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            avgScore:    { $avg: "$score" },
            totalQ:      { $first: "$totalQuestions" },
          },
        },
      ]),
      Doctor.aggregate([
        { $match: { campaign: { $in: campIds } } },
        { $group: { _id: "$campaign", total: { $sum: 1 } } },
      ]),
    ]);

    const scanMap    = Object.fromEntries(scans.map((x) => [x._id.toString(), x.total]));
    const attemptMap = Object.fromEntries(attempts.map((x) => [x._id.toString(), x]));
    const doctorMap  = Object.fromEntries(doctors.map((x) => [x._id.toString(), x.total]));

    const result = campaigns.map((c) => {
      const id  = c._id.toString();
      const att = attemptMap[id] || {};
      const avg = att.avgScore && att.totalQ
        ? +((att.avgScore / att.totalQ) * 100).toFixed(1)
        : 0;
      return {
        campaignId:   id,
        name:         c.name,
        doctors:      doctorMap[id]  || 0,
        qrScans:      scanMap[id]    || 0,
        quizStarts:   att.starts     || 0,
        completions:  att.completions || 0,
        avgScore:     avg,
      };
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getDashboardStats,
  getActivityOverTime,
  getMapData,
  getDeviceBreakdown,
  getTopDoctors,
  getCampaignPerformance,
};
