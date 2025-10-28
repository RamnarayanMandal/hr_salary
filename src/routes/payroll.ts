import { Router, Response } from 'express';
import Joi from 'joi';
import prisma from '../prismaClient';
import { authenticate, authorize } from '../middleware/auth';
import { 
  AuthenticatedRequest, 
  PayrollDistributionRequest,
  ApiResponse,
  AppError 
} from '../types';

const router = Router();

// Validation schemas
const distributePayrollSchema = Joi.object({
  employeeId: Joi.number().integer().positive().required(),
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2020).max(2030).required(),
  paymentDate: Joi.date().iso().required(),
});

/**
 * @route   POST /api/payroll/distribute
 * @desc    Distribute payroll to employee
 * @access  HR/Admin only
 */
router.post('/distribute', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = distributePayrollSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const payrollData: PayrollDistributionRequest = value;

    // Check if payroll record exists
    const payroll = await prisma.payroll.findUnique({
      where: {
        employeeId_month_year: {
          employeeId: payrollData.employeeId,
          month: payrollData.month,
          year: payrollData.year,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isActive: true,
          },
        },
      },
    });

    if (!payroll) {
      res.status(404).json({
        success: false,
        message: 'Payroll record not found. Please generate salary first.',
      });
      return;
    }

    if (!payroll.employee.isActive) {
      res.status(400).json({
        success: false,
        message: 'Cannot distribute payroll to inactive employee',
      });
      return;
    }

    // Update payment date
    const updatedPayroll = await prisma.payroll.update({
      where: {
        employeeId_month_year: {
          employeeId: payrollData.employeeId,
          month: payrollData.month,
          year: payrollData.year,
        },
      },
      data: {
        paymentDate: new Date(payrollData.paymentDate),
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
      message: 'Payroll distributed successfully',
      data: updatedPayroll,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Distribute payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/payroll/history
 * @desc    Get payroll history with filters
 * @access  HR/Admin only
 */
router.get('/history', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const month = req.query.month as string;
    const year = req.query.year as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Build filter
    let whereClause: any = {};
    if (month && year) {
      whereClause = {
        month: parseInt(month),
        year: parseInt(year),
      };
    }

    // Get payroll records
    const [payrolls, totalCount] = await Promise.all([
      prisma.payroll.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [
          { year: 'desc' },
          { month: 'desc' },
          { createdAt: 'desc' },
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
        where: whereClause,
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
      message: 'Payroll history retrieved successfully',
      data: {
        payrolls,
        summary,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        filters: {
          month: month ? parseInt(month) : null,
          year: year ? parseInt(year) : null,
        },
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get payroll history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/payroll/summary
 * @desc    Get payroll summary for a specific month/year
 * @access  HR/Admin only
 */
router.get('/summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const month = req.query.month as string;
    const year = req.query.year as string;

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

    // Get payroll records for the month
    const payrolls = await prisma.payroll.findMany({
      where: {
        month: monthNum,
        year: yearNum,
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

    // Calculate detailed summary
    const summary = payrolls.reduce(
      (acc, payroll) => {
        acc.totalEmployees++;
        acc.totalGrossSalary += payroll.grossSalary;
        acc.totalNetSalary += payroll.netSalary;
        acc.totalTaxDeductions += payroll.taxDeductions;
        acc.totalPfDeductions += payroll.pfDeductions;
        acc.totalOtherDeductions += payroll.otherDeductions;
        acc.totalFullDays += payroll.fulldays;
        acc.totalHalfDays += payroll.halfdays;
        return acc;
      },
      {
        totalEmployees: 0,
        totalGrossSalary: 0,
        totalNetSalary: 0,
        totalTaxDeductions: 0,
        totalPfDeductions: 0,
        totalOtherDeductions: 0,
        totalFullDays: 0,
        totalHalfDays: 0,
      }
    );

    // Calculate averages
    const averages = {
      averageGrossSalary: summary.totalEmployees > 0 ? summary.totalGrossSalary / summary.totalEmployees : 0,
      averageNetSalary: summary.totalEmployees > 0 ? summary.totalNetSalary / summary.totalEmployees : 0,
      averageTaxDeductions: summary.totalEmployees > 0 ? summary.totalTaxDeductions / summary.totalEmployees : 0,
      averagePfDeductions: summary.totalEmployees > 0 ? summary.totalPfDeductions / summary.totalEmployees : 0,
    };

    const response: ApiResponse = {
      success: true,
      message: 'Payroll summary retrieved successfully',
      data: {
        month: monthNum,
        year: yearNum,
        summary,
        averages,
        payrolls,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get payroll summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   PUT /api/payroll/:id
 * @desc    Update payroll record
 * @access  HR/Admin only
 */
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const payrollId = parseInt(req.params.id);

    if (isNaN(payrollId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid payroll ID',
      });
      return;
    }

    const { paymentDate, otherDeductions } = req.body;

    // Check if payroll record exists
    const existingPayroll = await prisma.payroll.findUnique({
      where: { id: payrollId },
    });

    if (!existingPayroll) {
      res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
      return;
    }

    // Update payroll record
    const updateData: any = {};
    if (paymentDate) {
      updateData.paymentDate = new Date(paymentDate);
    }
    if (otherDeductions !== undefined) {
      updateData.otherDeductions = otherDeductions;
      // Recalculate net salary
      updateData.netSalary = existingPayroll.grossSalary - existingPayroll.taxDeductions - existingPayroll.pfDeductions - otherDeductions;
    }

    const updatedPayroll = await prisma.payroll.update({
      where: { id: payrollId },
      data: updateData,
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
      message: 'Payroll record updated successfully',
      data: updatedPayroll,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Update payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
