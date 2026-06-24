# HealthHub - Healthcare Management Platform

A comprehensive web-based healthcare management platform that enables users to manage hospital information, book consultations, get AI-assisted diagnosis, and order medical tests.

## 🎯 Features

### Core Features
- **User Authentication & Authorization**
  - Secure registration and login
  - Role-based access control (Admin, Doctor, Patient)
  - JWT-based authentication
  - Password hashing with bcrypt

- **Hospital Directory**
  - Browse registered hospitals
  - View hospital services
  - Access emergency contact information
  - Search and filter hospitals

- **AI Symptom Diagnosis**
  - Input symptoms for preliminary diagnosis
  - Risk level assessment (Low/Medium/High)
  - Personalized recommendations
  - Diagnosis history tracking

- **Online Consultations**
  - Book appointments with doctors
  - View doctor specialties and availability
  - Consultation status tracking
  - Doctor can accept/reject/complete consultations

- **Medical Test Ordering**
  - Order tests through registered doctors
  - Track test status
  - View test results
  - Doctor approval workflow

- **Admin Dashboard**
  - Manage hospitals and services
  - User management
  - Role assignment
  - System statistics
  - Audit logs

### Bonus Features
- Audit logging for admin actions
- Role-based dashboards
- Responsive design for mobile and desktop
- Real-time status updates

## 🛠️ Technology Stack

### Backend
- **Python 3.x**
- **Flask** - Web framework
- **MySQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing

### Frontend
- **HTML5**
- **CSS3** - Custom dark blue medical theme
- **JavaScript (ES6+)** - Vanilla JS
- **Fetch API** - HTTP requests

## 📋 Prerequisites

- Python 3.8 or higher
- MySQL 8.0 or higher
- Modern web browser (Chrome, Firefox, Edge, Safari)

## 🚀 Installation & Setup

### 1. Database Setup

1. Install MySQL and start the MySQL service

2. Run the database schema:
```bash
mysql -u root -p < backend/database.sql
```

Or manually:
```bash
mysql -u root -p
```
Then paste the contents of `backend/database.sql`

The default database password is: `R1O3o5t.@`

### 2. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables (optional):
   - Edit `.env` file if you need to change database credentials
   - Default configuration works out of the box

5. Start the backend server:
```bash
python app.py
```

The backend API will be available at `http://localhost:5000`

### 3. Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Open `index.html` in a web browser, or use a simple HTTP server:

**Using Python:**
```bash
python -m http.server 8000
```

**Using Node.js (if installed):**
```bash
npx http-server -p 8000
```

3. Access the application at `http://localhost:8000`

## 👤 Default Admin Credentials

```
Username: admin
Password: admin123
```

## 📁 Project Structure

```
healthhub/
├── backend/
│   ├── app.py              # Main Flask application
│   ├── config.py           # Configuration settings
│   ├── db.py               # Database connection and utilities
│   ├── auth.py             # Authentication middleware
│   ├── database.sql        # Database schema
│   ├── requirements.txt    # Python dependencies
│   └── .env                # Environment variables
│
└── frontend/
    ├── index.html          # Landing page
    ├── login.html          # Login page
    ├── register.html       # Registration page
    ├── user-dashboard.html # Patient dashboard
    ├── doctor-dashboard.html # Doctor dashboard
    ├── admin-dashboard.html  # Admin dashboard
    ├── css/
    │   └── style.css       # Main stylesheet
    └── js/
        ├── api.js          # API client
        ├── utils.js        # Utility functions
        ├── user-dashboard.js
        ├── doctor-dashboard.js
        └── admin-dashboard.js
```

## 🎨 UI Theme

- **Primary Color**: Dark Blue (#1e3a8a)
- **Design**: Modern medical interface
- **Responsive**: Mobile-first approach
- **Accessibility**: High contrast for readability

## 📖 User Guide

### For Patients

1. **Register** - Create an account as a patient
2. **Browse Hospitals** - View available hospitals and services
3. **Get Diagnosis** - Input symptoms for AI-assisted diagnosis
4. **Find Doctors** - Search doctors by specialty
5. **Book Consultation** - Schedule appointments with doctors
6. **Order Tests** - Request medical tests through doctors
7. **Track Status** - Monitor consultation and test status

### For Doctors

1. **Register** - Create account with specialty information
2. **View Consultations** - See all patient appointment requests
3. **Manage Appointments** - Accept, reject, or complete consultations
4. **Handle Test Orders** - Approve and update medical test results
5. **Patient Communication** - View patient symptoms and notes

### For Administrators

1. **Login** - Use admin credentials
2. **Manage Hospitals** - Add, update, or remove hospitals
3. **Manage Services** - Create medical service categories
4. **User Management** - Change user roles
5. **View Statistics** - Monitor platform usage
6. **Audit Logs** - Track administrative actions

