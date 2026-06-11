import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { comparePassword } from "../utils/password.js";
import { signAuthToken } from "../utils/jwt.js";
import { createUser, findUserByEmailAndPhone, findUserById } from "../services/auth.service.js";

const authRouter = Router();

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Valid email is required"),
  phoneNumber: z.string().trim().min(8, "Phone number is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm your password"),
  termsAccepted: z.boolean().refine((value) => value, "Terms acceptance is required"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  phoneNumber: z.string().trim().min(8, "Phone number is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const { fullName, email, phoneNumber, password, confirmPassword } = parsed.data;
    if (password !== confirmPassword) {
      res.status(400).json({ message: "Passwords do not match" });
      return;
    }

    const user = await createUser({ fullName, email, phoneNumber, password });
    const token = signAuthToken({ userId: user.id, email: user.email, role: user.role }, true);

    res.status(201).json({
      message: "Account created successfully",
      token,
      user,
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const { email, phoneNumber, password, rememberMe } = parsed.data;
    const user = await findUserByEmailAndPhone(email, phoneNumber);

    if (!user) {
      res.status(401).json({ message: "Invalid email, phone number, or password" });
      return;
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ message: "Invalid email, phone number, or password" });
      return;
    }

    const publicUser = await findUserById(user.id);
    const token = signAuthToken(
      { userId: user.id, email: user.email, role: user.role },
      rememberMe
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: publicUser,
    });
  })
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const userId = req.header("x-user-id");
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({ user });
  })
);

export default authRouter;
