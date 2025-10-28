import { Router, Response } from 'express';
import Joi from 'joi';
import prisma from '../prismaClient';
import { 
  generateToken, 
  hashPassword, 
  comparePassword 
} from '../middleware/auth';
import { 
  AuthenticatedRequest, 
  LoginRequest, 
  ApiResponse, 
  LoginResponse,
  AppError 
} from '../types';
import { Role } from '@prisma/client';

const router = Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid(...Object.values(Role)).required(),
  fullName: Joi.string().min(2).max(100).required(),
});

/**
 * @route   POST /api/auth/signup
 * @desc    Public signup - creates a User with EMPLOYEE role
 * @access  Public
 */
router.post('/signup', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const { email, password, fullName, role } = value as { email: string; password: string; fullName: string; role: Role };

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ success: false, message: 'User with this email already exists' });
      return;
    }

    // Create user with EMPLOYEE role by default
    const hashed = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashed,
        fullName,
        roles: role ,
      },
    });

    // Issue token
    const token = generateToken(newUser.id, newUser.roles);

    const response: ApiResponse<LoginResponse> = {
      success: true,
      message: 'Signup successful',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          roles: newUser.roles,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        } as any,
        token,
      },
    };

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json(response);
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const { email, password }: LoginRequest = value;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        employee: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // Check password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // Generate token
    const token = generateToken(user.id, user.roles);

    // Prepare response
    const response: ApiResponse<LoginResponse> = {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: user.roles,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
        employee: user.employee || undefined,
      },
    };

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Clear token cookie
    res.clearCookie('token');

    const response: ApiResponse = {
      success: true,
      message: 'Logout successful',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          fullName: req.user.fullName,
          roles: req.user.roles,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt,
        },
        employee: req.user.employee || undefined,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
