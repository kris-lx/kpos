-- MySQL initialization script for KPOS
-- This script runs when the container starts for the first time

-- Create database if it doesn't exist (already created by MYSQL_DATABASE env var)
-- CREATE DATABASE IF NOT EXISTS kpos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE kpos_db;

-- Create tables or initial data here if needed
-- Example:
-- CREATE TABLE IF NOT EXISTS example_table (
--     id INT AUTO_INCREMENT PRIMARY KEY,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- Log initialization
SELECT 'MySQL initialized for KPOS' as message;
