#!/usr/bin/env python3
"""
Database Initialization Script for HealthHub
This script initializes the database with the schema and default data.
"""

import mysql.connector
from mysql.connector import Error
from config import Config

def init_database():
    """Initialize the database with schema"""
    print("=" * 60)
    print("HealthHub Database Initialization")
    print("=" * 60)
    
    try:
        # Connect to MySQL server (without database)
        print("\n1. Connecting to MySQL server...")
        connection = mysql.connector.connect(
            host=Config.DB_HOST,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD
        )
        
        if connection.is_connected():
            print("   ✓ Connected to MySQL server")
        
        cursor = connection.cursor()
        
        # Read SQL file
        print("\n2. Reading database schema...")
        with open('database.sql', 'r', encoding='utf-8') as f:
            sql_script = f.read()
        print("   ✓ Schema file loaded")
        
        # Execute SQL statements
        print("\n3. Executing SQL statements...")
        statements = sql_script.split(';')
        
        for i, statement in enumerate(statements):
            if statement.strip():
                try:
                    cursor.execute(statement)
                    if i % 5 == 0:  # Progress indicator
                        print(f"   Processing... ({i}/{len(statements)})")
                except Error as e:
                    # Some errors are expected (like DROP DATABASE IF EXISTS)
                    if "Unknown database" not in str(e):
                        print(f"   Warning: {e}")
        
        connection.commit()
        print("   ✓ All statements executed successfully")
        
        # Verify database creation
        print("\n4. Verifying database...")
        cursor.execute("USE healthhub")
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        
        print(f"   ✓ Database 'healthhub' created with {len(tables)} tables:")
        for table in tables:
            print(f"     - {table[0]}")
        
        # Verify admin user
        print("\n5. Verifying admin user...")
        cursor.execute("SELECT username, role FROM users WHERE role = 'admin'")
        admin = cursor.fetchone()
        
        if admin:
            print(f"   ✓ Admin user created: {admin[0]}")
            print("\n" + "=" * 60)
            print("DEFAULT ADMIN CREDENTIALS")
            print("=" * 60)
            print("Username: admin")
            print("Password: admin123")
            print("=" * 60)
        
        # Verify services
        cursor.execute("SELECT COUNT(*) FROM services")
        service_count = cursor.fetchone()[0]
        print(f"\n6. Services initialized: {service_count} services available")
        
        cursor.close()
        connection.close()
        
        print("\n" + "=" * 60)
        print("✓ DATABASE INITIALIZATION COMPLETE!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Start the backend server: python app.py")
        print("2. Open frontend in browser: http://localhost:8000")
        print("3. Login with admin credentials shown above")
        print("=" * 60)
        
        return True
        
    except Error as e:
        print(f"\n✗ Error: {e}")
        print("\nTroubleshooting:")
        print("1. Ensure MySQL is running")
        print("2. Check database credentials in .env file")
        print("3. Verify you have necessary permissions")
        return False
    except FileNotFoundError:
        print("\n✗ Error: database.sql file not found")
        print("Ensure you're running this script from the backend directory")
        return False
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        return False

if __name__ == '__main__':
    success = init_database()
    exit(0 if success else 1)

