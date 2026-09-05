import express from "express";
import {
    registerUser,
    login,
    getProfile
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { registerSchema } from "../schemas/user.schema.js";


const router = express.Router();

// Register
// router.post("/", registerUser);   normal but we want to check the data is correct or not then we are usng the below one

router.post("/", validate(registerSchema), registerUser);

// Login
router.post("/login", login);

// Protected profile route
// router.get("/profile", authenticate, (req, res) => {
//     res.json({
//         success: true,
//         message: "Profile accessed successfully",
//         user: req.user,
//     });
// });

router.get("/profile", authenticate, getProfile);

// Admin-only route
router.get("/admin", authenticate, authorize("admin"), (req, res) => {
    res.json({
        success: true,
        message: "Welcome Admin!",
        user: req.user,
    });
});

// router.get("/test-error", testError); Used to test the gloabl test 
export default router;