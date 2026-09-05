import { createUser, loginUser } from "../services/user.service.js";
import { generateToken } from "../utils/jwt.js";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";


export const registerUser = asyncHandler(async (req, res) => {
    
    const user = await createUser(req.body);

    const { password, ...userWithoutPassword } = user;

    res.status(201).json({
        success: true,
        message: "User created successfully",
        user: userWithoutPassword,
    });
});


// The below code is same as the code we are using but in this one we used the try catch locally and in the code which we used we did the global error handling 
// export const login = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const user = await loginUser(email, password);

//         const token = generateToken(user);

//         const { password: _, ...userWithoutPassword } = user;

//         res.status(200).json({
//             success: true,
//             message: "Login successful",
//             token,
//             user: userWithoutPassword,
//         });
//     } catch (error) {
//         console.error(error);

//         res.status(401).json({
//             success: false,
//             message: error.message,
//         });
//     }
// };

export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await loginUser(email, password);

    const token = generateToken(user);

    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: userWithoutPassword,
    });
});


// export const getProfile = async (req, res) => {
//     try {
//         const user = await prisma.users.findUnique({
//             where: {
//                 id: req.user.id,
//             },
//         });

//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 message: "User not found",
//             });
//         }

//         const { password, ...userWithoutPassword } = user;

//         res.status(200).json({
//             success: true,
//             message: "Profile fetched successfully",
//             user: userWithoutPassword,
//         });

//     } catch (error) {
//         console.error(error);

//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch profile",
//         });
//     }
// };

export const getProfile = asyncHandler(async (req, res) => {
    const user = await prisma.users.findUnique({
        where: {
            id: req.user.id,
        },
    });

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
        success: true,
        message: "Profile fetched successfully",
        user: userWithoutPassword,
    });
});

// export const testError = asyncHandler(async (req, res) => {
//     throw new Error("Something unexpected happened!");
// });  USed to test the global error handling 