const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../Controller/Authmiddleware");
const {
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignStats,
} = require("../Controller/Campaigncontroller");

router.use(protect);

router.get("/", getAllCampaigns);
router.get("/:id", getCampaignById);
router.get("/:id/stats", getCampaignStats);
router.post("/", createCampaign);
router.put("/:id", updateCampaign);
router.delete("/:id", restrictTo("superadmin", "admin"), deleteCampaign);

module.exports = router;