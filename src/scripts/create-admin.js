import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";

const createAdmin = async () => {
    try {
        const email = "admin@flipkart.com";
        const password = "Admin@123456";

        // Check if admin already exists
        const existingAdmin = await prisma.users.findUnique({
            where: {
                email,
            },
        });

        if (existingAdmin) {
            console.log("Admin user already exists.");
            console.log("Email:", email);
            console.log("Role:", existingAdmin.role);
            return;
        }

        // Hash password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create admin
        const admin = await prisma.users.create({
            data: {
                name: "Admin",
                email,
                password: hashedPassword,
                role: "admin",
            },
        });

        console.log("Admin created successfully!");
        console.log("--------------------------------");
        console.log("Email:", admin.email);
        console.log("Password:", password);
        console.log("Role:", admin.role);
        console.log("--------------------------------");
    } catch (error) {
        console.error("Failed to create admin:", error);
    } finally {
        await prisma.$disconnect();
    }
};

createAdmin();