#!/usr/bin/env node

/**
 * Database Setup Script
 * This script helps set up the initial database with sample data
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Setting up database...');

  try {
    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@company.com' },
      update: {},
      create: {
        email: 'admin@company.com',
        password: hashedPassword,
        fullName: 'System Administrator',
        roles: 'ADMIN',
      },
    });

    console.log('✅ Admin user created:', adminUser.email);

    // Create sample employee
    const sampleEmployee = await prisma.employee.upsert({
      where: { email: 'john.doe@company.com' },
      update: {},
      create: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        phone: '+1234567890',
        joinDate: new Date('2024-01-01'),
        basicSalary: 50000,
        hra: 10000,
        allowances: 5000,
        workingDays: 22,
      },
    });

    console.log('✅ Sample employee created:', sampleEmployee.email);

    // Create employee user
    const employeeUser = await prisma.user.upsert({
      where: { email: 'john.doe@company.com' },
      update: {},
      create: {
        email: 'john.doe@company.com',
        password: await bcrypt.hash('employee123', 12),
        fullName: 'John Doe',
        roles: 'EMPLOYEE',
        employeeId: sampleEmployee.id,
      },
    });

    console.log('✅ Employee user created:', employeeUser.email);

    // Create sample attendance records
    const attendanceRecords = [];
    for (let day = 1; day <= 15; day++) {
      const date = new Date(2024, 0, day); // January 2024
      attendanceRecords.push({
        employeeId: sampleEmployee.id,
        date,
        hoursWorked: Math.random() > 0.1 ? 8 : 4, // 90% full day, 10% half day
        status: Math.random() > 0.1 ? 'PRESENT' : 'HALF_DAY',
      });
    }

    await prisma.attendance.createMany({
      data: attendanceRecords,
      skipDuplicates: true,
    });

    console.log('✅ Sample attendance records created');

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📋 Sample Login Credentials:');
    console.log('Admin: admin@company.com / admin123');
    console.log('Employee: john.doe@company.com / employee123');
    console.log('\n🔗 API Base URL: http://localhost:3000/api');
    console.log('📊 Health Check: http://localhost:3000/health');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
