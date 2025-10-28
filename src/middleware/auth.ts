import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../prismaClient';
import { AuthenticatedRequest, AppError } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for user
 */
export const generateToken = (userId: number, role: string): string => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Authentication middleware
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.cookies?.token;

    if (!token) {
      throw new AppError('Access denied. No token provided.', 401);
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        employee: true,
      },
    });

    if (!user) {
      throw new AppError('Invalid token. User not found.', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token.', 401));
    } else {
      next(error);
    }
  }
};

/**
 * Authorization middleware - check if user has required role
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }

    if (!roles.includes(req.user.roles)) {
      return next(new AppError('Insufficient permissions.', 403));
    }

    next();
  };
};

/**
 * Check if user can access employee data (HR/Admin or self)
 */
export const canAccessEmployee = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  const employeeId = parseInt(req.params.id);
  const userRole = req.user.roles;
  const userEmployeeId = req.user.employee?.id;

  // HR/Admin can access any employee
  if (userRole === 'ADMIN' || userRole === 'MANAGER') {
    return next();
  }

  // Employee can only access their own data
  if (userRole === 'EMPLOYEE' && userEmployeeId === employeeId) {
    return next();
  }

  next(new AppError('Access denied. You can only access your own data.', 403));
};

/**
 * Check if user can access salary data (HR/Admin or self)
 */
export const canAccessSalary = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  const employeeId = parseInt(req.params.employeeId || req.query.employeeId as string);
  const userRole = req.user.roles;
  const userEmployeeId = req.user.employee?.id;

  // HR/Admin can access any employee's salary
  if (userRole === 'ADMIN' || userRole === 'MANAGER') {
    return next();
  }

  // Employee can only access their own salary
  if (userRole === 'EMPLOYEE' && userEmployeeId === employeeId) {
    return next();
  }

  next(new AppError('Access denied. You can only access your own salary data.', 403));
};
