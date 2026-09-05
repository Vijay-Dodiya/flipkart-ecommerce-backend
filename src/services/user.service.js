import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import AppError from "../utils/AppError.js";

export const createUser = async (userData) => {
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user = await prisma.users.create({
        data: {
            name: userData.name,
            email: userData.email,
            password: hashedPassword,
            role: "customer",
        },
    });

    return user;
};

export const loginUser = async (email, password) => {
    const user = await prisma.users.findUnique({
        where: {
            email: email,
        },
    });

    if (!user) {
        throw new AppError("Invalid email or password", 401);
    }

    const isPasswordCorrect = await bcrypt.compare(
        password,
        user.password
    );

    if (!isPasswordCorrect) {
        throw new AppError("Invalid email or password", 401);
    }

    return user;
};