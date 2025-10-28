# HR Salary Management API

A comprehensive REST API for managing employee salaries, attendance, and payroll using Node.js, TypeScript, Express, and Prisma.

## Features

### Authentication APIs
- **POST** `/api/auth/login` - Login for all users
- **POST** `/api/auth/logout` - Logout for all users
- **GET** `/api/auth/me` - Get current user profile

### Employee Management APIs
- **POST** `/api/employees` - Create new employee (HR/Admin only)
- **GET** `/api/employees` - Get all employees with pagination (HR/Admin only)
- **GET** `/api/employees/:id` - Get employee by ID (HR/Admin or Self)
- **PUT** `/api/employees/:id` - Update employee (HR/Admin only)
- **DELETE** `/api/employees/:id` - Deactivate employee (HR/Admin only)

### Attendance APIs
- **POST** `/api/attendance/mark` - Mark attendance (Employee or HR/Admin)
- **GET** `/api/attendance/:employeeId` - Get attendance records (Employee or HR/Admin)
- **PUT** `/api/attendance/:id` - Update attendance record (HR/Admin only)
- **DELETE** `/api/attendance/:id` - Delete attendance record (HR/Admin only)

### Salary Calculation APIs
- **POST** `/api/salary/calculate` - Calculate salary (HR/Admin only)
- **GET** `/api/salary/:employeeId?month=YYYY-MM` - Get salary details (HR/Admin or Self)
- **GET** `/api/salary/:employeeId/history` - Get salary history (HR/Admin or Self)
- **POST** `/api/salary/:employeeId/generate` - Generate and save salary (HR/Admin only)

### Payroll Distribution APIs
- **POST** `/api/payroll/distribute` - Distribute payroll (HR/Admin only)
- **GET** `/api/payroll/history?month=YYYY-MM` - Get payroll history (HR/Admin only)
- **GET** `/api/payroll/summary?month=YYYY-MM` - Get payroll summary (HR/Admin only)
- **PUT** `/api/payroll/:id` - Update payroll record (HR/Admin only)

## Salary Calculation Logic

1. **Gross Salary** = Basic Salary + HRA + Allowances
2. **Tax Deduction** = Based on progressive tax slabs:
   - 0% up to ₹2,50,000
   - 5% from ₹2,50,001 to ₹5,00,000
   - 20% from ₹5,00,001 to ₹10,00,000
   - 30% above ₹10,00,000
3. **PF Deduction** = 12% of Basic Salary
4. **Daily Wage** = Gross Salary / Working Days
5. **Full Day Salary** = Daily Wage
6. **Half Day Salary** = Daily Wage / 2 (if working hours < 8)
7. **Total Salary** = (Full Days × Full Day Salary) + (Half Days × Half Day Salary)
8. **Net Salary** = Total Salary - Tax - PF - Other Deductions

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hr-salary-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Database Configuration
   DATABASE_URL="postgresql://username:password@localhost:5432/hr_salary_db"
   
   # JWT Configuration
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   JWT_EXPIRES_IN="7d"
   
   # Server Configuration
   PORT=3000
   NODE_ENV="development"
   
   # Client Configuration (for CORS)
   CLIENT_URL="http://localhost:3000"
   ```

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run prisma:generate
   
   # Run database migrations
   npm run prisma:migrate
   
   # (Optional) Open Prisma Studio
   npm run prisma:studio
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## API Usage Examples

### Authentication
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@company.com", "password": "password123"}'

# Get profile
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Employee Management
```bash
# Create employee
curl -X POST http://localhost:3000/api/employees \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@company.com",
    "phone": "+1234567890",
    "joinDate": "2024-01-01",
    "basicSalary": 50000,
    "hra": 10000,
    "allowances": 5000,
    "workingDays": 22
  }'
```

### Attendance Management
```bash
# Mark attendance
curl -X POST http://localhost:3000/api/attendance/mark \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "date": "2024-01-15",
    "hoursWorked": 8,
    "status": "PRESENT"
  }'
```

### Salary Calculation
```bash
# Calculate salary
curl -X POST http://localhost:3000/api/salary/calculate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "month": 1,
    "year": 2024,
    "otherDeductions": 1000
  }'
```

## Database Schema

The application uses the following main entities:
- **User** - Authentication and user management
- **Employee** - Employee information and salary details
- **Attendance** - Daily attendance records
- **Payroll** - Monthly payroll records

## Security Features

- JWT-based authentication
- Role-based access control (ADMIN, MANAGER, EMPLOYEE)
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Security headers with Helmet
- Input validation with Joi

## Error Handling

The API provides consistent error responses:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (development only)"
}
```

## Development

### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

### Project Structure
```
src/
├── app.ts                 # Express app configuration
├── server.ts             # Server startup
├── prismaClient.ts       # Prisma client setup
├── types.ts              # TypeScript type definitions
├── middleware/
│   ├── auth.ts           # Authentication middleware
│   └── errorHandler.ts   # Global error handler
├── routes/
│   ├── auth.ts           # Authentication routes
│   ├── employees.ts       # Employee management routes
│   ├── attendance.ts     # Attendance routes
│   ├── salary.ts         # Salary calculation routes
│   └── payroll.ts        # Payroll distribution routes
└── utils/
    └── salaryCalculator.ts # Salary calculation logic
```

## License

MIT License - see LICENSE file for details.
