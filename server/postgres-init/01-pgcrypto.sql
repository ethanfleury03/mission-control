-- Create pgcrypto extension for gen_random_uuid() (PG < 13; optional on PG 13+)
\c missioncontrol
CREATE EXTENSION IF NOT EXISTS pgcrypto;
