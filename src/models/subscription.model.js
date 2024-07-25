import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
    {
        subscriber: {
            type: Schema.Types.ObjectId, // one who is subscribing
            ref: "User"
        },
        channel: {
            type: Schema.Types.ObjectId, // one who is subscribed by subscriber
            ref: "User"
        }
    },
    { timestamps: true }
);

const subscription = mongoose.model("Subscription", subscriptionSchema);
export { subscription };
