-- Migration Script: Add Pharmacy Tables to Existing Database
-- This script adds pharmacy tables without dropping the existing database
-- Run this if you want to preserve existing data

USE healthhub;

-- Pharmacies table
CREATE TABLE IF NOT EXISTS pharmacies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    opening_hours VARCHAR(255),
    is_24_hours BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_location (latitude, longitude)
) ENGINE=InnoDB;

-- Drugs table
CREATE TABLE IF NOT EXISTS drugs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    category VARCHAR(100),
    description TEXT,
    dosage_form VARCHAR(100),
    strength VARCHAR(100),
    manufacturer VARCHAR(255),
    requires_prescription BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_generic_name (generic_name),
    INDEX idx_category (category)
) ENGINE=InnoDB;

-- Pharmacy Inventory (Many-to-Many relationship)
CREATE TABLE IF NOT EXISTS pharmacy_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pharmacy_id INT NOT NULL,
    drug_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    price DECIMAL(10, 2),
    in_stock BOOLEAN DEFAULT TRUE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE,
    FOREIGN KEY (drug_id) REFERENCES drugs(id) ON DELETE CASCADE,
    UNIQUE KEY unique_pharmacy_drug (pharmacy_id, drug_id),
    INDEX idx_pharmacy (pharmacy_id),
    INDEX idx_drug (drug_id),
    INDEX idx_in_stock (in_stock)
) ENGINE=InnoDB;

-- Insert sample pharmacies
INSERT INTO pharmacies (name, address, phone, email, latitude, longitude, opening_hours, is_24_hours, description) VALUES
('HealthPlus Pharmacy', 'Bastos, Yaoundé, Cameroon', '+237 222 123 456', 'contact@healthplus.cm', 3.8680, 11.5180, '8:00 AM - 10:00 PM', FALSE, 'Full-service pharmacy with wide range of medications'),
('MediCare Pharmacy', 'Bonanjo, Douala, Cameroon', '+237 233 234 567', 'info@medicare.cm', 4.0511, 9.7679, '24/7', TRUE, '24-hour pharmacy with emergency services'),
('City Pharmacy', 'Centre Ville, Yaoundé, Cameroon', '+237 222 345 678', 'city@pharmacy.cm', 3.8480, 11.5021, '7:00 AM - 9:00 PM', FALSE, 'Convenient downtown location'),
('Green Cross Pharmacy', 'Akwa, Douala, Cameroon', '+237 233 456 789', 'greencross@pharmacy.cm', 4.0483, 9.7043, '8:00 AM - 8:00 PM', FALSE, 'Specialized in herbal and traditional medicines'),
('Express Pharmacy', 'Ngousso, Yaoundé, Cameroon', '+237 222 567 890', 'express@pharmacy.cm', 3.8880, 11.5321, '24/7', TRUE, 'Fast service and home delivery available');

-- Insert sample drugs
INSERT INTO drugs (name, generic_name, category, description, dosage_form, strength, manufacturer, requires_prescription) VALUES
('Paracetamol', 'Acetaminophen', 'Analgesic', 'Pain reliever and fever reducer', 'Tablet', '500mg', 'PharmaCo', FALSE),
('Amoxicillin', 'Amoxicillin', 'Antibiotic', 'Treats bacterial infections', 'Capsule', '250mg', 'MediLab', TRUE),
('Ibuprofen', 'Ibuprofen', 'NSAID', 'Anti-inflammatory and pain reliever', 'Tablet', '400mg', 'HealthCare Inc', FALSE),
('Metformin', 'Metformin HCl', 'Antidiabetic', 'Controls blood sugar in type 2 diabetes', 'Tablet', '500mg', 'DiabetCare', TRUE),
('Omeprazole', 'Omeprazole', 'Proton Pump Inhibitor', 'Reduces stomach acid production', 'Capsule', '20mg', 'GastroPharma', TRUE),
('Cetirizine', 'Cetirizine HCl', 'Antihistamine', 'Relieves allergy symptoms', 'Tablet', '10mg', 'AllergyFree', FALSE),
('Amlodipine', 'Amlodipine Besylate', 'Antihypertensive', 'Treats high blood pressure', 'Tablet', '5mg', 'CardioCare', TRUE),
('Azithromycin', 'Azithromycin', 'Antibiotic', 'Treats respiratory infections', 'Tablet', '500mg', 'RespiraPharma', TRUE),
('Vitamin C', 'Ascorbic Acid', 'Vitamin', 'Immune system support', 'Tablet', '1000mg', 'VitaHealth', FALSE),
('Aspirin', 'Acetylsalicylic Acid', 'Analgesic', 'Pain relief and blood thinner', 'Tablet', '100mg', 'CardioMed', FALSE),
('Ciprofloxacin', 'Ciprofloxacin HCl', 'Antibiotic', 'Treats various bacterial infections', 'Tablet', '500mg', 'BacteriaFree', TRUE),
('Loratadine', 'Loratadine', 'Antihistamine', 'Non-drowsy allergy relief', 'Tablet', '10mg', 'AllergyRelief', FALSE),
('Atorvastatin', 'Atorvastatin Calcium', 'Statin', 'Lowers cholesterol levels', 'Tablet', '20mg', 'CholesterolCare', TRUE),
('Salbutamol', 'Salbutamol Sulfate', 'Bronchodilator', 'Relieves asthma symptoms', 'Inhaler', '100mcg', 'RespiraCare', TRUE),
('Multivitamin', 'Mixed Vitamins', 'Supplement', 'Daily nutritional supplement', 'Tablet', 'Various', 'NutriHealth', FALSE);

-- Insert sample pharmacy inventory
INSERT INTO pharmacy_inventory (pharmacy_id, drug_id, quantity, price, in_stock) VALUES
-- HealthPlus Pharmacy (ID: 1)
(1, 1, 500, 500, TRUE),
(1, 2, 200, 2500, TRUE),
(1, 3, 300, 800, TRUE),
(1, 4, 150, 3000, TRUE),
(1, 5, 100, 2000, TRUE),
(1, 6, 250, 1200, TRUE),
(1, 9, 400, 1500, TRUE),
(1, 10, 350, 600, TRUE),
-- MediCare Pharmacy (ID: 2)
(2, 1, 600, 450, TRUE),
(2, 2, 250, 2400, TRUE),
(2, 3, 400, 750, TRUE),
(2, 7, 120, 4000, TRUE),
(2, 8, 80, 5000, TRUE),
(2, 11, 90, 6000, TRUE),
(2, 12, 200, 1000, TRUE),
(2, 15, 300, 2500, TRUE),
-- City Pharmacy (ID: 3)
(3, 1, 450, 550, TRUE),
(3, 3, 350, 850, TRUE),
(3, 6, 200, 1100, TRUE),
(3, 9, 500, 1400, TRUE),
(3, 10, 400, 550, TRUE),
(3, 12, 250, 950, TRUE),
(3, 15, 350, 2400, TRUE),
-- Green Cross Pharmacy (ID: 4)
(4, 1, 300, 600, TRUE),
(4, 2, 150, 2600, TRUE),
(4, 4, 100, 3200, TRUE),
(4, 5, 80, 2100, TRUE),
(4, 6, 180, 1250, TRUE),
(4, 9, 450, 1600, TRUE),
(4, 13, 70, 7000, TRUE),
-- Express Pharmacy (ID: 5)
(5, 1, 700, 480, TRUE),
(5, 2, 300, 2350, TRUE),
(5, 3, 500, 780, TRUE),
(5, 7, 150, 3800, TRUE),
(5, 8, 100, 4800, TRUE),
(5, 10, 450, 580, TRUE),
(5, 11, 110, 5800, TRUE),
(5, 14, 60, 8000, TRUE),
(5, 15, 400, 2300, TRUE);

SELECT 'Pharmacy tables created successfully!' AS Status;
SELECT COUNT(*) AS 'Pharmacies Added' FROM pharmacies;
SELECT COUNT(*) AS 'Drugs Added' FROM drugs;
SELECT COUNT(*) AS 'Inventory Records Added' FROM pharmacy_inventory;

