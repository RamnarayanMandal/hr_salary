import { Router, Response } from 'express';
import Joi from 'joi';
import prisma from '../prismaClient';
import { authenticate, authorize, canAccessSalary } from '../middleware/auth';
import { calculateEmployeeSalary } from '../utils/salaryCalculator';
import { 
  AuthenticatedRequest, 
  SalaryCalculationRequest,
  ApiResponse,
  AppError 
} from '../types';

const router = Router();

// Validation schemas
const calculateSalarySchema = Joi.object({
  employeeId: Joi.number().integer().positive().required(),
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2020).max(2030).required(),
  otherDeductions: Joi.number().min(0).default(0),
});

/**
 * @route   POST /api/salary/calculate
 * @desc    Calculate salary for employee
 * @access  HR/Admin only
 */
router.post('/calculate', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = calculateSalarySchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const salaryData: SalaryCalculationRequest = value;

    // Calculate salary
    const salaryCalculation = await calculateEmployeeSalary(
      salaryData.employeeId,
      salaryData.month,
      salaryData.year,
      salaryData.otherDeductions
    );

    const response: ApiResponse = {
      success: true,
      message: 'Salary calculated successfully',
      data: salaryCalculation,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Calculate salary error:', error);
    
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
});

/**
 * @route   GET /api/salary/:employeeId
 * @desc    Get salary details for employee
 * @access  HR/Admin or Self
 */
router.get('/:employeeId', authenticate, canAccessSalary, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const month = req.query.month as string;
    const year = req.query.year as string;

    if (isNaN(employeeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid employee ID',
      });
      return;
    }

    if (!month || !year) {
      res.status(400).json({
        success: false,
        message: 'Month and year parameters are required',
      });
      return;
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || isNaN(yearNum)) {
      res.status(400).json({
        success: false,
        message: 'Invalid month or year format',
      });
      return;
    }

    // Check if payroll record exists
    const payroll = await prisma.payroll.findUnique({
      where: {
        employeeId_month_year: {
          employeeId,
          month: monthNum,
          year: yearNum,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            basicSalary: true,
            hra: true,
            allowances: true,
            workingDays: true,
          },
        },
      },
    });

    if (!payroll) {
      res.status(404).json({
        success: false,
        message: 'Payroll record not found for the specified month and year',
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Salary details retrieved successfully',
      data: payroll,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get salary error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/salary/:employeeId/history
 * @desc    Get salary history for employee
 * @access  HR/Admin or Self
 */
router.get('/:employeeId/history', authenticate, canAccessSalary, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;

    if (isNaN(employeeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid employee ID',
      });
      return;
    }

    const skip = (page - 1) * limit;

    // Get payroll history
    const [payrolls, totalCount] = await Promise.all([
      prisma.payroll.findMany({
        where: { employeeId },
        skip,
        take: limit,
        orderBy: [
          { year: 'desc' },
          { month: 'desc' },
        ],
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.payroll.count({
        where: { employeeId },
      }),
    ]);

    // Calculate summary
    const summary = payrolls.reduce(
      (acc, payroll) => {
        acc.totalGrossSalary += payroll.grossSalary;
        acc.totalNetSalary += payroll.netSalary;
        acc.totalTaxDeductions += payroll.taxDeductions;
        acc.totalPfDeductions += payroll.pfDeductions;
        return acc;
      },
      {
        totalGrossSalary: 0,
        totalNetSalary: 0,
        totalTaxDeductions: 0,
        totalPfDeductions: 0,
      }
    );

    const response: ApiResponse = {
      success: true,
      message: 'Salary history retrieved successfully',
      data: {
        payrolls,
        summary,
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
    console.error('Get salary history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   POST /api/salary/:employeeId/generate
 * @desc    Generate salary for employee (calculate and save to payroll)
 * @access  HR/Admin only
 */
router.post('/:employeeId/generate', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const { month, year, otherDeductions = 0 } = req.body;

    if (isNaN(employeeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid employee ID',
      });
      return;
    }

    if (!month || !year) {
      res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
      return;
    }

    // Check if payroll already exists
    const existingPayroll = await prisma.payroll.findUnique({
      where: {
        employeeId_month_year: {
          employeeId,
          month: parseInt(month),
          year: parseInt(year),
        },
      },
    });

    if (existingPayroll) {
      res.status(400).json({
        success: false,
        message: 'Payroll already exists for this month and year',
      });
      return;
    }

    // Calculate salary
    const salaryCalculation = await calculateEmployeeSalary(
      employeeId,
      parseInt(month),
      parseInt(year),
      otherDeductions
    );

    // Create payroll record
    const payroll = await prisma.payroll.create({
      data: {
        employeeId,
        month: parseInt(month),
        year: parseInt(year),
        grossSalary: salaryCalculation.grossSalary,
        deductions: salaryCalculation.taxDeductions + salaryCalculation.pfDeductions + salaryCalculation.otherDeductions,
        taxDeductions: salaryCalculation.taxDeductions,
        pfDeductions: salaryCalculation.pfDeductions,
        otherDeductions: salaryCalculation.otherDeductions,
        netSalary: salaryCalculation.netSalary,
        paymentDate: new Date(),
        fulldays: salaryCalculation.fullDays,
        halfdays: salaryCalculation.halfDays,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const response: ApiResponse = {
      success: true,
      message: 'Salary generated and saved successfully',
      data: payroll,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Generate salary error:', error);
    
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
});

export default router;
