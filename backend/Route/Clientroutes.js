const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../Controller/Authmiddleware");
const {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
} = require("../Controller/Clientcontroller");

router.use(protect);

router.get("/", getAllClients);
router.get("/:id", getClientById);
router.get("/:id/stats", getClientStats);
router.post("/", createClient);
router.put("/:id", updateClient);
router.delete("/:id", restrictTo("superadmin", "admin"), deleteClient);

module.exports = router;