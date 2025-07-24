# Skorbord Card Scoring App

A modern, mobile-first card scoring application built with React, Express, and SQLite. Real-time scoring with Socket.IO and beautiful UI with TailwindCSS and DaisyUI.

## Features

- **Real-time Scoring**: Live updates via WebSocket (Socket.IO) connections
- **Mobile-First Design**: Optimized for touch devices with responsive design
- **Multiple Game Types**: Support for Hearts, Spades, Cribbage, Gin Rummy, and more
- **Player Management**: Create and manage players with avatar colors
- **Game Statistics**: Track wins, losses, and rivalries between players
- **Beautiful UI**: Dark theme with TailwindCSS and DaisyUI components
- **Fast & Reliable**: SQLite backend for optimal performance on Raspberry Pi

## Tech Stack

### Backend

- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **SQLite** - Embedded database (perfect for Raspberry Pi)
- **Express Validator** - Input validation
- **Helmet & CORS** - Security middleware
- **Rate Limiting** - API protection

### Frontend

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TailwindCSS** - Utility-first CSS
- **DaisyUI** - Component library
- **Socket.IO Client** - Real-time updates

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Development Setup

1. **Clone and Setup**

   ```bash
   git clone <repository-url>
   cd skorbord-react-tailwindcss-daisyui
   ```

2. **Install Dependencies**

   ```bash
   # Install all dependencies
   npm run setup  # Or use VS Code task: "Setup Project"
   ```

3. **Start Development Servers**

   ```bash
   # Start both frontend and backend
   npm run dev  # Or use VS Code task: "Start Both Frontend and Backend"
   ```

4. **Access the Application**

   - Frontend: <http://localhost:2424>
   - Backend API: <http://localhost:2525>
   - API Documentation: <http://localhost:2525/api/docs>

### VS Code Integration

This project includes VS Code tasks for common operations:

- **Setup Project** - Install all dependencies
- **Start Both Frontend and Backend** - Launch development environment
- **Test API** / **Test Frontend** - Run test suites
- **Run All Tests** - Execute all tests with coverage
- **Database Migration** - Apply database migrations

Access tasks via `Ctrl+Shift+P` → "Tasks: Run Task"

## API Documentation

Interactive API documentation is available at:

- Development: <http://localhost:2424/api/docs>
- Production: <https://cards.skorbord.app/api/docs>

The API follows OpenAPI 3.0 specification and includes:

- Comprehensive endpoint documentation
- Request/response schemas
- Interactive testing interface
- Rate limiting information

## Testing

### Backend Tests

```bash
cd api
npm test                # Run tests
npm run test:coverage   # Run with coverage
npm run test:watch      # Watch mode
```

### Frontend Tests

```bash
cd app
npm test                # Run tests
npm run test:coverage   # Run with coverage
npm run test:ui         # Interactive UI
```

### All Tests

```bash
npm test  # Or use VS Code task: "Run All Tests"
```

## Project Structure

```text
├── api/                    # Backend Express.js application
│   ├── db/                # Database setup and migrations
│   ├── middleware/        # Express middleware
│   ├── routes/           # API route handlers
│   ├── sockets/          # Socket.IO event handlers
│   ├── utils/            # Utility functions
│   ├── tests/            # Backend test suites
│   ├── docs/             # API documentation
│   └── index.js          # Application entry point
├── app/                   # Frontend React application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # React contexts
│   │   └── test/         # Test utilities
│   ├── public/           # Static assets
│   └── dist/             # Build output
├── deployment/           # Deployment scripts and guides
├── specs/               # Project specifications
└── .vscode/            # VS Code configuration
```

## Game Types

The application supports multiple card games:

- **Hearts** - Classic trick-taking game for 4 players
- **Spades** - Partnership trick-taking game for 4 players
- **Cribbage** - Two-player counting game
- **Gin Rummy** - Two-player melding game
- **Euchre** - Four-player trump game
- **Pinochle** - Bidding and melding game

Each game type has specific rules for player counts, scoring, and gameplay mechanics.

## Deployment

See [deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md) for detailed deployment instructions.

### Production Build

```bash
# Build frontend for production
cd app && npm run build

# Start production API server
cd api && npm start
```

### Raspberry Pi Deployment

The application is optimized for Raspberry Pi deployment:

- Lightweight SQLite database
- Minimal resource usage
- ARM-compatible dependencies
- Efficient bundling and compression

## Development

### Environment Variables

**Backend (.env)**

```bash
PORT=2424
DB_FILE=./data/skorbord.db
NODE_ENV=development
SOCKET_CORS_ORIGIN=http://localhost:3000
```

**Frontend (.env)**

```bash
VITE_API_URL=http://localhost:2424
VITE_SOCKET_URL=http://localhost:2424
```

### Database Management

```bash
# Apply migrations
npm run migrate

# Create new migration
npm run migrate:create migration_name

# Rollback migration
npm run migrate:down
```

### Code Quality

The project includes:

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest/Vitest** - Testing frameworks
- **TypeScript** support (optional)

### Real-time Features

Socket.IO enables real-time features:

- Live score updates across all connected clients
- Game status changes (start, pause, complete)
- Player join/leave notifications
- Connection status indicators

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run the test suite
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Documentation: [API Docs](<http://localhost:2424/api/docs>)
- Issues: Create GitHub issues for bugs/features
- Development: Follow the development setup guide above
