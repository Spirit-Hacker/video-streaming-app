import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const dbConnect = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`);
        console.log(`DB connection successfull || DB HOST : ${connectionInstance.connection.host}`);
    }
    catch (error) {
        console.log("DB connection failed", error);
        process.exit(1);
    }
}

export default dbConnect;