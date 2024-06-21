import dotenv from "dotenv";
import dbConnect from "./db/dbConnect.js";

dotenv.config({
    path: "./env"
});

dbConnect();