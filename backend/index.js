const express = require("express");
const connectDB = require("./db/dbConnect");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

const authRoutes = require("./Route/Authroutes");
const adminRoutes = require("./Route/AdminRoute");
const clientRoutes = require("./Route/Clientroutes");
const campaignRoutes = require("./Route/Campaignroutes");
const doctorRoutes = require("./Route/Doctorroutes");
const quizRoutes = require("./Route/Quizroutes");
const quizAttemptRoutes = require("./Route/Quizattemptroutes");
const analyticsRoutes = require("./Route/Analyticsroutes");
const mrRoutes = require("./Route/MrRoute");

connectDB();

//app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use('/backend-assets', express.static(path.join(__dirname, 'assets')));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/attempts", quizAttemptRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/mr", mrRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to the Doctalk Admin API");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
