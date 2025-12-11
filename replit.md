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

## Technology Stack
- **Backend**: Python 3.11 + Flask 3.0
- **Frontend**: HTML/CSS/JavaScript with Chart.js for visualizations
- **Storage**: Browser localStorage (client-side)
- **Production Server**: Gunicorn

## Project Structure
```
├── app.py                    # Flask application server
├── templates/
│   └── index.html           # Main application (3300+ lines)
├── static/
│   ├── style.css            # (Styles are inline in HTML)
│   ├── logo.jpg             # Application logo
│   ├── icon.png             # PWA icon
│   ├── manifest.json        # PWA manifest
│   └── sw.js                # Service worker for offline support
├── requirements.txt         # Python dependencies
└── .gitignore              # Git ignore rules
```

## PWA Support
The application supports Progressive Web App features:
- Can be installed on mobile devices
- Works offline via service worker caching
- Responsive design for all screen sizes

## Development
The application runs on port 5000 using Flask.
Access through the Replit webview.

## Recent Changes
- **2024-12-08**: Cloned complete Trading Control application from existing Replit project
