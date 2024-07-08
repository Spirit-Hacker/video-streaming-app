import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import { ApiError } from "../utils/apiError.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    // step 1: fetch data from req body
    const { username, email, password, fullName } = req.body;

    // step 2: validate the data
    if (
        [username, email, password, fullName].some(
            (field) => field?.trim() === ""
        )
    ) {
       throw new ApiError(400, "All fields are required");
    }

    const emailNotValid = email.includes("@gmail.com") === false;
    if (emailNotValid) {
       throw new ApiError(
            400,
            "Email is not valid, please enter a valid email id"
        );
    }

    const userAlreadyExists = await User.find({
        $or: [{ username }, { email }],
    });

    if (userAlreadyExists.length) {
       throw new ApiError(
            409,
            "user already registered with this email/username"
        );
    }

    // step 3: hash user password
    const hashedPassword = await bcrypt.hash(password, 10);

    // step 4: fetch the local path of the images

    const avatarLocalPath = req.files?.avatar[0].path;
    const coverImageLocalPath = req.files?.coverImage[0].path;

    console.log("REQUEST FILES : ", req.files);

    if (!avatarLocalPath) {
       throw new ApiError(
            404,
            "Avatar file is required, avatar local path not found"
        );
    }

    // step 5: Upload image to cloudinary
    const avatar = await uploadToCloudinary(avatarLocalPath);
    const coverImage = await uploadToCloudinary(coverImageLocalPath);

    if (!avatar) {
       throw new ApiError(
            400,
            "Avatar file is required, upload to cloudinary failed"
        );
    }

    // step 6: create entry for the user data in the db
    const user = await User({
        username: username,
        email: email,
        password: hashedPassword,
        fullName: fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
    });

    await user.save();

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
       throw new ApiError(500, "Something went wrong, while registering user");
    }

    // step 7: return response
    return res
        .status(200)
        .json(
            new ApiResponse(200, createdUser, "user registered successfully")
        );
});

export { registerUser };
