import { Request } from 'express';
// Prisma types will be available after running prisma generate

// Define types that match Prisma schema
export interface User {
  id: number;
  email: string;
  password: string;
  fullName: string;
  roles: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joinDate: Date;
  basicSalary: number;
  hra: number;
  allowances: number;
  workingDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attendance {
  id: number;
  employeeId: number;
  date: Date;
  hoursWorked: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payroll {
  id: number;
  employeeId: number;
  month: number;
  year: number;
  grossSalary: number;
  deductions: number;
  taxDeductions: number;
  pfDeductions: number;
  otherDeductions: number;
  netSalary: number;
  paymentDate: Date;
  fulldays: number;
  halfdays: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}

// Extended Request interface with user data
export interface AuthenticatedRequest extends Request {
  user?: User & { employee?: Employee };
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Authentication types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'password'>;
  token: string;
  employee?: Employee;
}

// Employee types
export interface CreateEmployeeRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joinDate: string;
  basicSalary: number;
  hra: number;
  allowances: number;
  workingDays?: number;
}

export interface UpdateEmployeeRequest extends Partial<CreateEmployeeRequest> {
  isActive?: boolean;
}

// Attendance types
export interface MarkAttendanceRequest {
  employeeId: number;
  date: string;
  hoursWorked: number;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
}

// Salary calculation types
export interface SalaryCalculationRequest {
  employeeId: number;
  month: number;
  year: number;
  otherDeductions?: number;
}

export interface SalaryCalculationResponse {
  employeeId: number;
  month: number;
  year: number;
  grossSalary: number;
  fullDays: number;
  halfDays: number;
  dailyWage: number;
  totalSalary: number;
  taxDeductions: number;
  pfDeductions: number;
  otherDeductions: number;
  netSalary: number;
  breakdown: {
    basicSalary: number;
    hra: number;
    allowances: number;
    grossMonthly: number;
    fullDaySalary: number;
    halfDaySalary: number;
    monthlyTax: number;
  };
}

// Payroll types
export interface PayrollDistributionRequest {
  employeeId: number;
  month: number;
  year: number;
  paymentDate: string;
}

export interface PayrollHistoryResponse {
  payrolls: Payroll[];
  totalRecords: number;
  summary: {
    totalGrossSalary: number;
    totalNetSalary: number;
    totalTaxDeductions: number;
    totalPfDeductions: number;
  };
}

// Tax slab type
export interface TaxSlab {
  upto: number | null;
  rate: number;
}

// Salary calculation parameters
export interface SalaryCalculationParams {
  basic: number;
  hra: number;
  allowances: number;
  workingDaysInMonth: number;
  attendances: {
    date: string;
    hoursWorked: number;
  }[];
  otherDeductions?: number;
}

export interface SalaryBreakdown {
  grossMonthly: number;
  fullDays: number;
  halfDays: number;
  dailyWage: number;
  totalSalary: number;
  tax: number;
  pf: number;
  otherDeductions: number;
  netSalary: number;
}

// Error types
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation schemas
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
