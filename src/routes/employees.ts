import { Router, Response } from 'express';
import Joi from 'joi';
import prisma from '../prismaClient';
import { authenticate, authorize, canAccessEmployee } from '../middleware/auth';
import { 
  AuthenticatedRequest, 
  CreateEmployeeRequest, 
  UpdateEmployeeRequest,
  ApiResponse,
  AppError 
} from '../types';

const router = Router();

// Validation schemas
const createEmployeeSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9+\-\s()]+$/).optional(),
  joinDate: Joi.date().iso().required(),
  basicSalary: Joi.number().positive().required(),
  hra: Joi.number().min(0).required(),
  allowances: Joi.number().min(0).required(),
  workingDays: Joi.number().integer().min(1).max(31).default(22),
});

const updateEmployeeSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^[0-9+\-\s()]+$/).optional(),
  joinDate: Joi.date().iso().optional(),
  basicSalary: Joi.number().positive().optional(),
  hra: Joi.number().min(0).optional(),
  allowances: Joi.number().min(0).optional(),
  workingDays: Joi.number().integer().min(1).max(31).optional(),
  isActive: Joi.boolean().optional(),
});

/**
 * @route   POST /api/employees
 * @desc    Create new employee
 * @access  HR/Admin only
 */
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = createEmployeeSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const employeeData: CreateEmployeeRequest = value;

    // Check if email already exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { email: employeeData.email },
    });

    if (existingEmployee) {
      res.status(400).json({
        success: false,
        message: 'Employee with this email already exists',
      });
      return;
    }

    // Create employee
    const employee = await prisma.employee.create({
      data: {
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        phone: employeeData.phone,
        joinDate: new Date(employeeData.joinDate),
        basicSalary: employeeData.basicSalary,
        hra: employeeData.hra,
        allowances: employeeData.allowances,
        workingDays: employeeData.workingDays || 22,
      },
    });

    const response: ApiResponse = {
      success: true,
      message: 'Employee created successfully',
      data: employee,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/employees/:id
 * @desc    Get employee by ID
 * @access  HR/Admin or Self
 */
router.get('/:id', authenticate, canAccessEmployee, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid employee ID',
      });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            roles: true,
          },
        },
        attendances: {
          take: 10,
          orderBy: { date: 'desc' },
        },
        payrolls: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Employee retrieved successfully',
      data: employee,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/employees
 * @desc    Get all employees (with pagination)
 * @access  HR/Admin only
 */
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [employees, totalCount] = await Promise.all([
      prisma.employee.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              roles: true,
            },
          },
        },
      }),
      prisma.employee.count(),
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Employees retrieved successfully',
      data: {
        employees,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   PUT /api/employees/:id
 * @desc    Update employee
 * @access  HR/Admin only
 */
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid employee ID',
      });
      return;
    }

    // Validate request body
    const { error, value } = updateEmployeeSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const updateData: UpdateEmployeeRequest = value;

    // Check if employee exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!existingEmployee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
      return;
    }

    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== existingEmployee.email) {
      const emailExists = await prisma.employee.findUnique({
        where: { email: updateData.email },
      });

      if (emailExists) {
        res.status(400).json({
          success: false,
          message: 'Employee with this email already exists',
        });
        return;
      }
    }

    // Update employee
    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...updateData,
        joinDate: updateData.joinDate ? new Date(updateData.joinDate) : undefined,
      },
    });

    const response: ApiResponse = {
      success: true,
      message: 'Employee updated successfully',
      data: updatedEmployee,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete employee (soft delete)
 * @access  HR/Admin only
 */
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = parseInt(req.params.id);

    if (isNaN(employeeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid employee ID',
      });
      return;
    }

    // Check if employee exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!existingEmployee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
      return;
    }

    // Soft delete by setting isActive to false
    await prisma.employee.update({
      where: { id: employeeId },
      data: { isActive: false },
    });

    const response: ApiResponse = {
      success: true,
      message: 'Employee deactivated successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
