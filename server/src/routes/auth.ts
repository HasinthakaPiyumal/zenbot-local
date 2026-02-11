import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();

// Default hash is for "admin123". Used if env var is missing.
const DEFAULT_HASH = "$2b$10$9xpFXnjxw1tme6Yw9zjBQ.0LrTYBxSyJIz7A4uULvLw8FDTS/zzr6";

router.post("/login", async (req: Request, res: Response) => {
    const { password } = req.body;

    if (!password || typeof password !== "string") {
        res.status(400).json({ error: "Password required" });
        return;
    }

    // Use env var or default
    const adminHash = process.env.ADMIN_PASS_HASH || DEFAULT_HASH;
    const jwtSecret = process.env.JWT_SECRET || "default_jwt_secret_please_change_me_in_prod";

    try {
        const match = await bcrypt.compare(password, adminHash);
        if (match) {
            // Issue token valid for 24 hours
            const token = jwt.sign({ role: "admin" }, jwtSecret, { expiresIn: "24h" });
            res.json({ token });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
