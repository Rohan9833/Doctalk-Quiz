const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../Controller/Authmiddleware");
const {
  getAllQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  updateSingleQuestion,
} = require("../Controller/Quizcontroller");

router.use(protect);

router.get("/", getAllQuizzes);
router.get("/:id", getQuizById);
router.post("/", createQuiz);
router.put("/:id", updateQuiz);
router.patch("/:id/questions/:questionNumber", updateSingleQuestion);
router.delete("/:id", restrictTo("superadmin", "admin"), deleteQuiz);

module.exports = router;