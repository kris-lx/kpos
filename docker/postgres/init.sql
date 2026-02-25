-- PostgreSQL initialization script for KPOS
-- This script runs when the container starts for the first time

-- Create extensions if needed
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas if needed
-- CREATE SCHEMA IF NOT EXISTS kpos;

-- Set default privileges
-- ALTER DEFAULT PRIVILEGES IN SCHEMA kpos GRANT ALL ON TABLES TO kpos;

-- Log initialization
\echo 'PostgreSQL initialized for KPOS'
