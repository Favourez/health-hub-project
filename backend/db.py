import mysql.connector
from mysql.connector import Error
from config import Config
import bcrypt

class Database:
    """Database connection and operations handler"""
    
    def __init__(self):
        self.connection = None
        self.connect()
    
    def connect(self):
        """Establish database connection"""
        try:
            self.connection = mysql.connector.connect(
                host=Config.DB_HOST,
                user=Config.DB_USER,
                password=Config.DB_PASSWORD,
                database=Config.DB_NAME,
                autocommit=False
            )
            if self.connection.is_connected():
                print("✓ Successfully connected to MySQL database")
        except Error as e:
            print(f"✗ Error connecting to MySQL: {e}")
            raise
    
    def execute_query(self, query, params=None, fetch=False, fetch_one=False):
        """Execute a database query"""
        cursor = None
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute(query, params or ())
            
            if fetch_one:
                result = cursor.fetchone()
            elif fetch:
                result = cursor.fetchall()
            else:
                self.connection.commit()
                result = cursor.lastrowid if cursor.lastrowid else True
            
            return result
        except Error as e:
            self.connection.rollback()
            print(f"Database error: {e}")
            raise
        finally:
            if cursor:
                cursor.close()
    
    def close(self):
        """Close database connection"""
        if self.connection and self.connection.is_connected():
            self.connection.close()
            print("✓ Database connection closed")

def hash_password(password):
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, password_hash):
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

def init_database():
    """Initialize database with schema"""
    try:
        # Connect without database to create it
        connection = mysql.connector.connect(
            host=Config.DB_HOST,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD
        )
        cursor = connection.cursor()
        
        # Read and execute schema file
        with open('database.sql', 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        # Execute each statement
        for statement in sql_script.split(';'):
            if statement.strip():
                cursor.execute(statement)
        
        connection.commit()
        cursor.close()
        connection.close()
        print("✓ Database initialized successfully")
        return True
    except Error as e:
        print(f"✗ Error initializing database: {e}")
        return False

