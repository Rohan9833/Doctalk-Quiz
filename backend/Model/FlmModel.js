const mongoose = require("mongoose");


const flmSchema = new mongoose.Schema({

    flmId: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    flmName: {
        type: String,
        required: true
    },
    BUSINESSUNIT: {
        type: String,
        required: true
    },
    region: {
        type: String,
        required: true
    },
    zone: {
        type: String,
        required: true
    },
    Mr: [{ type: mongoose.Schema.Types.ObjectId, ref: "Mr" }],
})
const Flm = mongoose.model("Flm", flmSchema);
module.exports = Flm;