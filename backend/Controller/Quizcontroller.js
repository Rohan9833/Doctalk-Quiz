const Quiz     = require("../Model/QuizModel");
const Campaign = require("../Model/CampaignModel");

const generateQuizId = () => "QZ-" + Date.now().toString(36).toUpperCase();

// ════════════════════════════════════════════════
// GET /api/quizzes
// Query: ?status=active&campaign=<id>&page=1&limit=10
// ════════════════════════════════════════════════
const getAllQuizzes = async (req, res) => {
  try {
    const { status, campaign, search, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status   && status !== "all")   filter.status   = status;
    if (campaign)                        filter.campaign = campaign;
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: "i" } },
        { topic: { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Quiz.countDocuments(filter);

    const quizzes = await Quiz.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("campaign",  "name therapyArea")
      .populate("createdBy", "name")
      .lean();

    res.status(200).json({
      success: true,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      data:  quizzes,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// GET /api/quizzes/:id
// ════════════════════════════════════════════════
const getQuizById = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
      .populate("campaign",  "name therapyArea brand")
      .populate("createdBy", "name email")
      .lean();

    if (!quiz) return res.status(404).json({ success: false, error: "Quiz not found" });

    res.status(200).json({ success: true, data: quiz });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// POST /api/quizzes
// Body: {
//   name, topic, version?, campaign?,
//   timePerQuestion?,
//   questions: [
//     {
//       questionNumber: 1,
//       questionText: "...",
//       options: ["A","B","C","D"],
//       correctAnswer: 0,
//       explanation: "..."
//     }, ...
//   ]
// }
// ════════════════════════════════════════════════
const createQuiz = async (req, res) => {
  try {
    const {
      name, topic, version, campaign,
      timePerQuestion, questions,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: "name is required" });
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: "At least one question is required" });
    }

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: questionText is required` });
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: must have exactly 4 options` });
      }
      if (q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer > 3) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: correctAnswer must be 0-3` });
      }
    }

    const quiz = new Quiz({
      quizId:          generateQuizId(),
      name,
      topic,
      version:         version || "v1.0",
      campaign:        campaign || null,
      timePerQuestion: timePerQuestion || 44,
      questions,
      createdBy:       req.admin?._id || null,
    });

    await quiz.save();

    // If campaign provided, link quiz to it
    if (campaign) {
      await Campaign.findByIdAndUpdate(campaign, { $set: { quiz: quiz._id } });
    }

    res.status(201).json({ success: true, data: quiz });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// PUT /api/quizzes/:id
// Can update top-level fields AND individual questions
// ════════════════════════════════════════════════
const updateQuiz = async (req, res) => {
  try {
    const allowed = ["name", "topic", "version", "timePerQuestion", "status", "questions"];

    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    // If updating questions, re-validate
    if (updates.questions) {
      for (let i = 0; i < updates.questions.length; i++) {
        const q = updates.questions[i];
        if (!q.questionText) {
          return res.status(400).json({ success: false, error: `Question ${i + 1}: questionText is required` });
        }
        if (!Array.isArray(q.options) || q.options.length !== 4) {
          return res.status(400).json({ success: false, error: `Question ${i + 1}: must have exactly 4 options` });
        }
        if (q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer > 3) {
          return res.status(400).json({ success: false, error: `Question ${i + 1}: correctAnswer must be 0-3` });
        }
      }
    }

    const quiz = await Quiz.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!quiz) return res.status(404).json({ success: false, error: "Quiz not found" });

    res.status(200).json({ success: true, data: quiz });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// DELETE /api/quizzes/:id
// ════════════════════════════════════════════════
const deleteQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, error: "Quiz not found" });

    if (quiz.status === "active") {
      return res.status(400).json({
        success: false,
        error: "Cannot delete an active quiz. Archive it first.",
      });
    }

    // Unlink from campaign if attached
    if (quiz.campaign) {
      await Campaign.findByIdAndUpdate(quiz.campaign, { $set: { quiz: null } });
    }

    await Quiz.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Quiz deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════
// PATCH /api/quizzes/:id/questions/:questionNumber
// Update a single question without sending all questions
// ════════════════════════════════════════════════
const updateSingleQuestion = async (req, res) => {
  try {
    const { questionNumber } = req.params;
    const { questionText, options, correctAnswer, explanation } = req.body;

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, error: "Quiz not found" });

    const qIndex = quiz.questions.findIndex(
      (q) => q.questionNumber === Number(questionNumber)
    );

    if (qIndex === -1) {
      return res.status(404).json({ success: false, error: `Question ${questionNumber} not found` });
    }

    if (questionText  !== undefined) quiz.questions[qIndex].questionText  = questionText;
    if (options       !== undefined) quiz.questions[qIndex].options       = options;
    if (correctAnswer !== undefined) quiz.questions[qIndex].correctAnswer = correctAnswer;
    if (explanation   !== undefined) quiz.questions[qIndex].explanation   = explanation;

    await quiz.save();
    res.status(200).json({ success: true, data: quiz.questions[qIndex] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getAllQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  updateSingleQuestion,
};