-- ============================================================================
-- VIDEO CONFERENCING MIGRATION
-- ============================================================================
-- This script adds video conferencing support to the HealthHub database
-- Run this script if you already have the consultations table created
-- ============================================================================

USE healthhub;

-- Add video conferencing columns to consultations table
ALTER TABLE consultations 
  MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected', 'completed', 'cancelled', 'in_progress') DEFAULT 'pending',
  ADD COLUMN video_room_id VARCHAR(100) UNIQUE AFTER notes,
  ADD COLUMN video_started_at TIMESTAMP NULL AFTER video_room_id,
  ADD COLUMN video_ended_at TIMESTAMP NULL AFTER video_started_at,
  ADD INDEX idx_video_room (video_room_id);

-- Verify the changes
DESCRIBE consultations;

-- Show sample data
SELECT id, patient_id, doctor_id, status, video_room_id, video_started_at, video_ended_at 
FROM consultations 
LIMIT 5;

-- Migration completed successfully
SELECT 'Video conferencing migration completed successfully!' AS message;

