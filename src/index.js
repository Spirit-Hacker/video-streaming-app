import dotenv from "dotenv";
import dbConnect from "./db/dbConnect.js";
import { app } from "./app.js";

dotenv.config({
    path: "./env",
});

const PORT = process.env.PORT || 8000;

dbConnect()
    .then(() => {
        app.on("error", (error) => {
            console.log("ERROR: ", error);
            throw error;
        });

        app.listen(PORT, () => {
            console.log(`Server is running on PORT: ${PORT}`);
        });
    })
    .catch((error) => {
        console.log("MONGO_DB connection failed", error);
    });
