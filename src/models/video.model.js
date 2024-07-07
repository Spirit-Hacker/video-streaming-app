import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videoFile: {
            type: String,
            required: [true, "Video File is required"],
        },
        thumbnail: {
            type: String,
            required: [true, "Thumbnail is required"],
        },
        title: {
            type: String,
            required: [true, "Title is required"],
        },
        description: {
            type: String,
            required: [true, "Description is required"],
        },
        duration: {
            type: Number,
            required: [true, "Duration is required"],
        },
        views: {
            type: Number,
            default: 0,
        },
        isPublished: {
            type: Boolean,
            default: true,
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

videoSchema.plugin(mongooseAggregatePaginate);

const Video = mongoose.model("Video", videoSchema);
export { Video };
