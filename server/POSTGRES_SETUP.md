# PostgreSQL Setup Guide

## 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo service postgresql start
```

**Windows:**
Download installer from https://www.postgresql.org/download/windows/

## 2. Create Database

```bash
# Switch to postgres user
sudo -u postgres psql

# In psql:
CREATE DATABASE missioncontrol;
CREATE USER mcuser WITH PASSWORD 'mcpass';
GRANT ALL PRIVILEGES ON DATABASE missioncontrol TO mcuser;
\q
```

## 3. Configure Environment

```bash
cd mission-control/server
cp .env.example .env
# Edit .env:
DATABASE_URL=postgresql://mcuser:mcpass@localhost:5432/missioncontrol
```

## 4. Install & Run

```bash
npm install
npm run db:seed    # Creates tables + sample data
npm run dev        # Starts server
```

## 5. Verify

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","database":"postgresql",...}
```

## Migration from SQLite (if you had data)

Your old SQLite data is in `data/mission-control.db`. To migrate:

```bash
# Export SQLite
sqlite3 data/mission-control.db .dump > backup.sql

# Then manually import relevant data to PostgreSQL
```

## Troubleshooting

**Connection refused:**
- Check PostgreSQL is running: `brew services list` or `sudo service postgresql status`
- Verify port 5432: `lsof -i :5432`

**Authentication failed:**
- Check username/password in DATABASE_URL
- Try: `psql -U mcuser -d missioncontrol -h localhost`

**Database doesn't exist:**
- Run: `createdb missioncontrol`
