import { TaxSlab, SalaryCalculationParams, SalaryBreakdown } from '../types';

// Tax slabs configuration
const TAX_SLABS: TaxSlab[] = [
  { upto: 250000, rate: 0 },      // No tax up to 2.5L
  { upto: 500000, rate: 0.05 },   // 5% tax from 2.5L to 5L
  { upto: 1000000, rate: 0.2 },   // 20% tax from 5L to 10L
  { upto: null, rate: 0.3 },      // 30% tax above 10L
];

/**
 * Calculate annual income tax based on tax slabs
 * @param annualIncome - Annual gross income
 * @returns Annual tax amount
 */
function calculateAnnualTax(annualIncome: number): number {
  let remainingIncome = annualIncome;
  let tax = 0;
  let lastUpper = 0;

  for (const slab of TAX_SLABS) {
    if (slab.upto !== null) {
      const taxableIncome = Math.max(0, Math.min(remainingIncome, slab.upto - lastUpper));
      tax += taxableIncome * slab.rate;
      remainingIncome -= taxableIncome;
      lastUpper = slab.upto;
      
      if (remainingIncome <= 0) break;
    } else {
      // For the highest slab (no upper limit)
      tax += remainingIncome * slab.rate;
      break;
    }
  }

  return tax;
}

/**
 * Calculate monthly salary based on attendance and deductions
 * @param params - Salary calculation parameters
 * @returns Detailed salary breakdown
 */
export function calculateMonthlySalary(params: SalaryCalculationParams): SalaryBreakdown {
  const { 
    basic, 
    hra, 
    allowances, 
    workingDaysInMonth, 
    attendances, 
    otherDeductions = 0 
  } = params;

  // 1. Gross Salary = Basic Salary + HRA + Allowances
  const grossMonthly = basic + hra + allowances;

  // 2. PF Deduction = 12% of Basic Salary
  const pf = basic * 0.12;

  // 3. Calculate attendance-based salary
  let fullDays = 0;
  let halfDays = 0;

  for (const attendance of attendances) {
    if (attendance.hoursWorked >= 8) {
      fullDays++;
    } else if (attendance.hoursWorked > 0) {
      halfDays++;
    }
    // Zero hours or missing day = absent (not counted)
  }

  // 4. Daily Wage = Gross Salary / Working Days
  const dailyWage = grossMonthly / workingDaysInMonth;

  // 5. Full Day Salary = Daily Wage
  const fullDaySalary = dailyWage;

  // 6. Half Day Salary = Daily Wage / 2
  const halfDaySalary = dailyWage / 2;

  // 7. Total Salary = (Full Days × Full Day Salary) + (Half Days × Half Day Salary)
  const totalSalary = (fullDays * fullDaySalary) + (halfDays * halfDaySalary);

  // 8. Tax Deduction = Based on tax slabs (calculated on annualized salary)
  const annualIncome = grossMonthly * 12;
  const annualTax = calculateAnnualTax(annualIncome);
  const monthlyTax = annualTax / 12;

  // 9. Net Salary = Total Salary - Tax - PF - Other Deductions
  const netSalary = totalSalary - monthlyTax - pf - otherDeductions;

  return {
    grossMonthly,
    fullDays,
    halfDays,
    dailyWage,
    totalSalary,
    tax: monthlyTax,
    pf,
    otherDeductions,
    netSalary,
  };
}

/**
 * Calculate salary for a specific employee and month
 * @param employeeId - Employee ID
 * @param month - Month (1-12)
 * @param year - Year
 * @param otherDeductions - Additional deductions
 * @returns Salary calculation result
 */
export async function calculateEmployeeSalary(
  employeeId: number,
  month: number,
  year: number,
  otherDeductions: number = 0
) {
  const prisma = (await import('../prismaClient')).default;

  // Get employee details
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (!employee.isActive) {
    throw new Error('Employee is not active');
  }

  // Get attendance records for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const attendances = await prisma.attendance.findMany({
    where: {
      employeeId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      date: true,
      hoursWorked: true,
    },
  });

  // Calculate salary
  const salaryParams: SalaryCalculationParams = {
    basic: employee.basicSalary,
    hra: employee.hra,
    allowances: employee.allowances,
    workingDaysInMonth: employee.workingDays,
    attendances: attendances.map(a => ({
      date: a.date.toISOString(),
      hoursWorked: a.hoursWorked,
    })),
    otherDeductions,
  };

  const breakdown = calculateMonthlySalary(salaryParams);

  return {
    employeeId,
    month,
    year,
    grossSalary: breakdown.grossMonthly,
    fullDays: breakdown.fullDays,
    halfDays: breakdown.halfDays,
    dailyWage: breakdown.dailyWage,
    totalSalary: breakdown.totalSalary,
    taxDeductions: breakdown.tax,
    pfDeductions: breakdown.pf,
    otherDeductions: breakdown.otherDeductions,
    netSalary: breakdown.netSalary,
    breakdown: {
      basicSalary: employee.basicSalary,
      hra: employee.hra,
      allowances: employee.allowances,
      grossMonthly: breakdown.grossMonthly,
      fullDaySalary: breakdown.dailyWage,
      halfDaySalary: breakdown.dailyWage / 2,
      monthlyTax: breakdown.tax,
    },
  };
}