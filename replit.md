# Trading Control Automatizado

## Project Overview
This is a complete trading journal and control application cloned from an existing Replit project. The application helps traders track their operations, manage multiple accounts, set goals, and monitor weekly challenges.

## Features
- **Dashboard**: Account summary, drawdown tracking, consistency rules, goals progress
- **Checklist**: Personal checklist with customizable tasks
- **Registro**: Trade registration with detailed fields (asset, strategy, contracts, entry/exit types, mood, news rating)
- **Historial**: Trade history with filters by year, month, type, and result
- **Objetivos**: Goals and targets (weekly/monthly) with progress tracking
- **Retos Semanales**: Weekly challenges with statistics and monthly summaries
- **CSV Import**: Import trades from NinjaTrader CSV exports with automatic P/L calculation

## Technology Stack
- **Backend**: Python 3.11 + Flask 3.0
- **Frontend**: HTML/CSS/JavaScript with Chart.js for visualizations
- **Authentication**: Supabase for user authentication
- **Storage**: Browser localStorage (client-side) + Supabase for user data
- **Production Server**: Gunicorn

## Project Structure
```
├── app.py                    # Flask application server with CSV import API
├── templates/
│   └── index.html           # Main application (4300+ lines)
├── static/
│   ├── logo.jpg             # Application logo
│   ├── icon.png             # PWA icon
│   ├── manifest.json        # PWA manifest
│   └── sw.js                # Service worker for offline support
├── attached_assets/         # Sample files and assets
├── requirements.txt         # Python dependencies
└── .gitignore              # Git ignore rules
```

## API Endpoints
- `GET /` - Main application
- `POST /api/importar-csv` - Import NinjaTrader CSV file

## CSV Import Feature
The application can import trades from NinjaTrader Grid CSV exports:
- Automatically parses NinjaTrader format (semicolon-separated)
- Pairs entries with exits to calculate complete trades
- Calculates P/L based on instrument type (MNQ, NQ, MES, ES)
- Supports multiple accounts in the same file

## PWA Support
The application supports Progressive Web App features:
- Can be installed on mobile devices
- Works offline via service worker caching
- Responsive design for all screen sizes

## Development
The application runs on port 5000 using Flask.
Access through the Replit webview.

## Recent Changes
- **2025-12-09**: Added CSV import feature for NinjaTrader data
- **2025-12-09**: Re-cloned complete application with authentication
- **2024-12-08**: Cloned complete Trading Control application from existing Replit project
