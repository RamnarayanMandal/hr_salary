import { Router, Response } from 'express';
import Joi from 'joi';
import prisma from '../prismaClient';
import { authenticate, authorize } from '../middleware/auth';
import { 
  AuthenticatedRequest, 
  MarkAttendanceRequest,
  ApiResponse,
  AppError 
} from '../types';

const router = Router();

// Validation schemas
const markAttendanceSchema = Joi.object({
  employeeId: Joi.number().integer().positive().required(),
  date: Joi.date().iso().required(),
  hoursWorked: Joi.number().min(0).max(24).required(),
  status: Joi.string().valid('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE').required(),
});

/**
 * @route   POST /api/attendance/mark
 * @desc    Mark attendance for employee
 * @access  Employee (self) or HR/Admin
 */
router.post('/mark', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = markAttendanceSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const attendanceData: MarkAttendanceRequest = value;

    // Check if user can mark attendance for this employee
    const userRole = req.user!.roles;
    const userEmployeeId = req.user!.employeeId;

    if (userRole === 'EMPLOYEE' && userEmployeeId !== attendanceData.employeeId) {
      res.status(403).json({
        success: false,
        message: 'You can only mark your own attendance',
      });
      return;
    }

    // Check if employee exists and is active
    const employee = await prisma.employee.findUnique({
      where: { id: attendanceData.employeeId },
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
      return;
    }

    if (!employee.isActive) {
      res.status(400).json({
        success: false,
        message: 'Cannot mark attendance for inactive employee',
      });
      return;
    }

    // Check if attendance already exists for this date
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId: attendanceData.employeeId,
        date: new Date(attendanceData.date),
      },
    });

    if (existingAttendance) {
      res.status(400).json({
        success: false,
        message: 'Attendance already marked for this date',
      });
      return;
    }

    // Create attendance record
    const attendance = await prisma.attendance.create({
      data: {
        employeeId: attendanceData.employeeId,
        date: new Date(attendanceData.date),
        hoursWorked: attendanceData.hoursWorked,
        status: attendanceData.status,
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
      message: 'Attendance marked successfully',
      data: attendance,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/attendance/:employeeId
 * @desc    Get attendance records for employee
 * @access  Employee (self) or HR/Admin
 */
router.get('/:employeeId', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    // Check if user can access this employee's attendance
    const userRole = req.user!.roles;
    const userEmployeeId = req.user!.employeeId;

    if (userRole === 'EMPLOYEE' && userEmployeeId !== employeeId) {
      res.status(403).json({
        success: false,
        message: 'You can only view your own attendance',
      });
      return;
    }

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
      return;
    }

    // Build date filter
    let dateFilter: any = {};
    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      dateFilter = {
        gte: startDate,
        lte: endDate,
      };
    }

    // Get attendance records
    const attendances = await prisma.attendance.findMany({
      where: {
        employeeId,
        date: dateFilter,
      },
      orderBy: { date: 'desc' },
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

    // Calculate summary
    const summary = attendances.reduce(
      (acc, attendance) => {
        if (attendance.hoursWorked >= 8) {
          acc.fullDays++;
        } else if (attendance.hoursWorked > 0) {
          acc.halfDays++;
        } else {
          acc.absentDays++;
        }
        acc.totalHours += attendance.hoursWorked;
        return acc;
      },
      { fullDays: 0, halfDays: 0, absentDays: 0, totalHours: 0 }
    );

    const response: ApiResponse = {
      success: true,
      message: 'Attendance records retrieved successfully',
      data: {
        attendances,
        summary,
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
        },
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   PUT /api/attendance/:id
 * @desc    Update attendance record
 * @access  HR/Admin only
 */
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const attendanceId = parseInt(req.params.id);

    if (isNaN(attendanceId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid attendance ID',
      });
      return;
    }

    // Validate request body
    const { error, value } = markAttendanceSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const updateData: MarkAttendanceRequest = value;

    // Check if attendance record exists
    const existingAttendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!existingAttendance) {
      res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
      return;
    }

    // Update attendance record
    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        employeeId: updateData.employeeId,
        date: new Date(updateData.date),
        hoursWorked: updateData.hoursWorked,
        status: updateData.status,
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
      message: 'Attendance updated successfully',
      data: updatedAttendance,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @route   DELETE /api/attendance/:id
 * @desc    Delete attendance record
 * @access  HR/Admin only
 */
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const attendanceId = parseInt(req.params.id);

    if (isNaN(attendanceId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid attendance ID',
      });
      return;
    }

    // Check if attendance record exists
    const existingAttendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!existingAttendance) {
      res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
      return;
    }

    // Delete attendance record
    await prisma.attendance.delete({
      where: { id: attendanceId },
    });

    const response: ApiResponse = {
      success: true,
      message: 'Attendance record deleted successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
