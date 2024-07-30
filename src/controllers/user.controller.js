import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import { ApiError } from "../utils/apiError.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    }
    catch (error) {
        throw new ApiError(
            500,
            "Something went wrong, while generating access token and refresh token"
        );
    }
};

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
    // console.log("HASHED PASSWORD: ", hashedPassword);

    // step 4: fetch the local path of the images

    let coverImageLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    let avatarLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.avatar) &&
        req.files.avatar.length > 0
    ) {
        avatarLocalPath = req.files.avatar[0].path;
    }

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

const loginUser = asyncHandler(async (req, res) => {
    // Step 1: get data
    const { username, email, password } = req.body;

    // Step 2: validate using email or username
    if (!username && !email) {
        throw new ApiError(400, "username or email is required");
    }

    // Step 3: find the user
    const user = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (!user) {
        throw new ApiError(
            404,
            "User does not exist with given username or email"
        );
    }

    // Step 4: check password
    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Password is incorrect");
    }

    // Step 5: access and refresh token
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        user._id
    );
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    // Step 6: send cookie
    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("refreshToken", refreshToken, options)
        .cookie("accessToken", accessToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    refreshToken,
                    accessToken,
                },
                "User logged in successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1,
            },
        },
        {
            new: true,
        }
    );

    // console.log("USER: ", user);

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("refreshToken", options)
        .clearCookie("accessToken", options)
        .json(new ApiResponse(200, {}, "User logged Out Successfully"));
});

// if access token is expired, refresh it using refresh token stored in cookies
const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Access");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        if (!decodedToken) {
            throw new ApiError(401, "Invalid refresh token");
        }

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(
                404,
                "User not found, while refreshing access token"
            );
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token expired");
        }

        const tokens = await generateAccessAndRefreshToken(user._id);
        const accessToken = tokens.accessToken;
        const newRefreshToken = tokens.refreshToken;

        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("refreshToken", newRefreshToken, options)
            .cookie("accessToken", accessToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken: accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed successfully"
                )
            );
    } catch (error) {
        throw new ApiError(
            401,
            error?.message || "Invalid Refresh Token Error"
        );
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isOldPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if (!isOldPasswordCorrect) {
        throw new ApiError(401, "Old password is incorrect");
    }

    hashedPassword = bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(
            new ApiResponse(200, req.user, "Current user fetched successfully")
        );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body; 

    if (!fullName || !email) { 
        throw new ApiError(400, "Please provide full name and email");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName: fullName,
                email: email,
            }
        },
        { new: true }
    ).select("-password");

    if (!user) {
        throw new ApiError(404, "User not found, Account details not updated");
    }

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    const avatar = await uploadToCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(500, "Failed to upload avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            }
        },
        { new: true }
    ).select("-password");

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover Image file is missing");
    }

    const coverImage = await uploadToCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(500, "Failed to upload Cover Image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password");

    return res
    .status(200)
    .json(new ApiResponse(200, user, "COver Image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const { username } = req.params;

    if (!username?.trim()) {
        throw new ApiError(400, "Username is missing");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: { $size: "$subscribers" },
                subscribedToCount: { $size: "$subscribedTo" },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?.id, "$subscribedTo.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                username: 1,
                email: 1,
                fullName: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1,
                coverImage: 1,
                avatar: 1
            }
        }
    ]);

    if (!channel?.length) {
        throw new ApiError(404, "Channel not found");
    }

    console.log("Channel Data : ", channel);

    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "Channel profile fetched successfully")
    );
});

const getUserWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: { $arrayElemAt: ["$owner", 0] }
                        }
                    }
                ]
            }
        }
    ]);

    return res
    .status(200)
    .json(new ApiResponse(200, user[0].watchHistory, "Watch History fetched successfully"));
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getUserWatchHistory
};
