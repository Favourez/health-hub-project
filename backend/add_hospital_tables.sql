-- Note: column additions are handled in _run_hospital_migration.py (MySQL 8.0 lacks IF NOT EXISTS for ADD COLUMN).

-- Sample services
INSERT IGNORE INTO services (name, description) VALUES
('Emergency Care', '24/7 emergency medical services'),
('General Medicine', 'General medical consultations'),
('Pediatrics', 'Medical care for children'),
('Maternity', 'Pregnancy and childbirth services'),
('Surgery', 'General and specialized surgical services'),
('Cardiology', 'Heart-related medical care'),
('Radiology', 'Medical imaging and diagnostics'),
('Laboratory', 'Medical testing and analysis'),
('Pharmacy', 'On-site pharmacy services'),
('Intensive Care', 'Critical care unit (ICU)');

-- Sample hospitals (Yaoundé, Douala, and other Cameroon cities)
INSERT INTO hospitals (name, address, phone, emergency_contact, email, description, latitude, longitude, opening_hours, is_24_hours) VALUES
('Yaoundé Central Hospital', 'Avenue Henri Dunant, Centre Ville, Yaoundé, Cameroon', '+237 222 234 010', '+237 222 234 011', 'contact@hcy.cm', 'Major public hospital offering comprehensive medical services with 24/7 emergency care.', 3.8651, 11.5180, '24/7', TRUE),
('Yaoundé General Hospital', 'Rue Henri Dunant, Ngousso, Yaoundé, Cameroon', '+237 222 211 020', '+237 222 211 021', 'info@hgy.cm', 'Leading referral hospital with specialized departments and modern facilities.', 3.8870, 11.5210, '24/7', TRUE),
('Centre Hospitalier d''Essos', 'Quartier Essos, Yaoundé, Cameroon', '+237 222 215 030', '+237 222 215 031', 'contact@che.cm', 'Modern hospital with cardiology and surgical specialties.', 3.8550, 11.5310, '7:00 AM - 9:00 PM', FALSE),
('Hôpital Général de Douala', 'Boulevard de la Liberté, Akwa, Douala, Cameroon', '+237 233 423 040', '+237 233 423 041', 'info@hgd.cm', 'Largest hospital in Douala providing tertiary care and emergency services.', 4.0511, 9.7679, '24/7', TRUE),
('Douala Laquintinie Hospital', 'Rue Joffre, Akwa, Douala, Cameroon', '+237 233 423 050', '+237 233 423 051', 'contact@laquintinie.cm', 'Public hospital with maternity ward and pediatric care.', 4.0480, 9.7020, '24/7', TRUE),
('Polyclinique Bonanjo', 'Bonanjo, Douala, Cameroon', '+237 233 423 060', '+237 233 423 061', 'info@polyclinique.cm', 'Private polyclinic offering specialized medical services.', 4.0420, 9.6970, '7:00 AM - 10:00 PM', FALSE),
('Hôpital Régional de Bafoussam', 'Quartier Famla, Bafoussam, Cameroon', '+237 233 442 070', '+237 233 442 071', 'contact@hrb.cm', 'Regional referral hospital serving the West region.', 5.4781, 10.4170, '24/7', TRUE),
('Hôpital Régional de Bamenda', 'Mankon, Bamenda, Cameroon', '+237 233 361 080', '+237 233 361 081', 'info@hrbamenda.cm', 'Regional hospital serving the Northwest region.', 5.9631, 10.1591, '24/7', TRUE),
('Hôpital Régional de Garoua', 'Centre Ville, Garoua, Cameroon', '+237 222 271 090', '+237 222 271 091', 'contact@hrg.cm', 'Regional referral hospital for the North region.', 9.3010, 13.3920, '24/7', TRUE),
('Centre Médical La Cathédrale', 'Centre Ville, Yaoundé, Cameroon', '+237 222 234 100', '+237 222 234 101', 'info@cathedrale.cm', 'Private medical center with general medicine and laboratory services.', 3.8675, 11.5165, '7:00 AM - 8:00 PM', FALSE),
('Clinique de l''Aéroport', 'Route de l''Aéroport, Yaoundé, Cameroon', '+237 222 220 110', '+237 222 220 111', 'contact@cliniqueaero.cm', 'Private clinic offering general consultations and minor surgeries.', 3.8350, 11.5230, '8:00 AM - 8:00 PM', FALSE),
('Hôpital Gynéco-Obstétrique', 'Ngousso, Yaoundé, Cameroon', '+237 222 215 120', '+237 222 215 121', 'info@hgop.cm', 'Specialized hospital for gynecology, obstetrics and pediatrics.', 3.8895, 11.5180, '24/7', TRUE);

-- Link hospitals with services (uses subqueries by name)
INSERT IGNORE INTO hospital_services (hospital_id, service_id)
SELECT h.id, s.id FROM hospitals h, services s
WHERE
    (h.name = 'Yaoundé Central Hospital' AND s.name IN ('Emergency Care','General Medicine','Surgery','Radiology','Laboratory','Pharmacy','Intensive Care'))
 OR (h.name = 'Yaoundé General Hospital' AND s.name IN ('Emergency Care','General Medicine','Cardiology','Surgery','Radiology','Laboratory','Intensive Care'))
 OR (h.name = 'Centre Hospitalier d''Essos' AND s.name IN ('General Medicine','Cardiology','Surgery','Laboratory'))
 OR (h.name = 'Hôpital Général de Douala' AND s.name IN ('Emergency Care','General Medicine','Surgery','Cardiology','Radiology','Laboratory','Pharmacy','Intensive Care'))
 OR (h.name = 'Douala Laquintinie Hospital' AND s.name IN ('Emergency Care','General Medicine','Pediatrics','Maternity','Laboratory'))
 OR (h.name = 'Polyclinique Bonanjo' AND s.name IN ('General Medicine','Pediatrics','Surgery','Laboratory'))
 OR (h.name = 'Hôpital Régional de Bafoussam' AND s.name IN ('Emergency Care','General Medicine','Surgery','Maternity','Laboratory'))
 OR (h.name = 'Hôpital Régional de Bamenda' AND s.name IN ('Emergency Care','General Medicine','Surgery','Maternity','Laboratory'))
 OR (h.name = 'Hôpital Régional de Garoua' AND s.name IN ('Emergency Care','General Medicine','Surgery','Pediatrics','Laboratory'))
 OR (h.name = 'Centre Médical La Cathédrale' AND s.name IN ('General Medicine','Laboratory','Pharmacy'))
 OR (h.name = 'Clinique de l''Aéroport' AND s.name IN ('General Medicine','Surgery','Laboratory'))
 OR (h.name = 'Hôpital Gynéco-Obstétrique' AND s.name IN ('Maternity','Pediatrics','Surgery','Laboratory'));
