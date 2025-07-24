# Development Guide

This guide covers advanced development topics, architecture decisions, and best practices for the Skorbord application.

## Architecture Overview

### Backend Architecture

The backend follows a layered architecture pattern:

```text
┌─────────────────────┐
│   HTTP/Socket.IO    │  ← Client communication layer
├─────────────────────┤
│   Express Routes    │  ← API endpoints and routing
├─────────────────────┤
│   Business Logic    │  ← Core game logic and validation
├─────────────────────┤
│   Data Access       │  ← Database operations
└─────────────────────┘
```

#### Key Components

- **Routes**: RESTful API endpoints for CRUD operations
- **Middleware**: Authentication, validation, error handling, rate limiting
- **Socket Handlers**: Real-time event processing
-- **Database Layer**: SQLite operations with connection pooling
- **Utilities**: Helper functions and business logic

### Frontend Architecture

The frontend uses a component-based architecture with React:

```text
┌─────────────────────┐
│   React Components  │  ← UI presentation layer
├─────────────────────┤
│   Context/State     │  ← Application state management
├─────────────────────┤
│   API Services      │  ← HTTP and WebSocket communication
├─────────────────────┤
│   Utility Functions │  ← Helper functions and formatting
└─────────────────────┘
```

#### Frontend Key Components

- **Components**: Reusable UI components with props interface
- **Contexts**: Global state management (connection, game state)
- **Hooks**: Custom React hooks for API calls and state
- **Services**: API communication and data transformation

## Development Workflow

### Setting Up Development Environment

1. **Prerequisites**

   ```bash
   # Required tools
   node --version    # v18+ required
   npm --version     # v8+ required
   git --version     # v2+ required
   ```

2. **IDE Configuration**

   The project includes VS Code configuration for optimal development:

   - **Extensions**: Recommended extensions in `.vscode/extensions.json`
   - **Settings**: Workspace settings for formatting and linting
   - **Tasks**: Pre-configured tasks for common operations
   - **Debug**: Launch configurations for debugging

3. **Environment Setup**

   ```bash
   # Clone repository
   git clone <repository-url>
   cd skorbord-react-tailwindcss-daisyui

   # Install dependencies
   npm run setup

   # Set up environment files
   cp api/.env.example api/.env
   cp app/.env.example app/.env
   ```

### Development Commands

#### Backend Development

```bash
cd api

# Development server with hot reload
npm run dev

# Database operations
npm run migrate          # Apply migrations
npm run migrate:down     # Rollback migrations
npm run migrate:create   # Create new migration

# Production build
npm start
```

#### Frontend Development

```bash
cd app

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Code Quality Standards

#### Linting and Formatting

The project uses ESLint and Prettier for code quality:

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

#### Commit Standards

Follow conventional commits:

```bash
feat: add new game type support
fix: resolve scoring calculation bug
docs: update API documentation
refactor: optimize database queries
style: update UI components styling
```

  
## API Design Principles
  
### Player Color Assignment

- When a player is created via the API, a DaisyUI color is randomly assigned and stored in the database (`players.color`).
- The color is unique per sqid (game/session) until all colors are used, then duplicates are allowed.
- The color is included in all player-related API responses and used for UI styling.
- The color cannot be edited after assignment.
- Migration: See `002_add_player_color.sql` for schema change.

### RESTful Design

- **Resource-based URLs**: `/api/players`, `/api/games`
- **HTTP methods**: GET, POST, PUT, DELETE for CRUD operations
- **Status codes**: Meaningful HTTP status codes
- **Consistent responses**: Standardized response format

### Error Handling

Consistent error response format:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "name",
      "message": "Name is required",
      "value": ""
    }
  ]
}
```

### Validation Strategy

- **Input validation**: Express Validator for all inputs
- **Business logic validation**: Custom validation functions
- **Database constraints**: Foreign keys and unique constraints
- **Client-side validation**: Immediate user feedback

### Rate Limiting

- **Global limits**: 100 requests per 15 minutes per IP
- **Endpoint-specific limits**: Stricter limits for resource-intensive operations
- **WebSocket limits**: Connection-based rate limiting

## Real-time Architecture

### Socket.IO Implementation

The real-time features use Socket.IO with the following patterns:

#### Connection Management

```javascript
// Client connection with auto-reconnection
const socket = io(API_URL, {
  transports: ['websocket', 'polling'],
  timeout: 5000,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});
```

#### Event Patterns

```javascript
// Server-side event handling
socket.on('join-game', async (gameId) => {
  try {
    const game = await validateGameExists(gameId);
    socket.join(`game-${gameId}`);
    socket.emit('game-joined', { gameId, success: true });
  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});

// Broadcasting updates
io.to(`game-${gameId}`).emit('score-updated', {
  gameId,
  round: roundNumber,
  scores: updatedScores
});
```

#### Event Types

- **join-game**: Join a game room for real-time updates
- **leave-game**: Leave a game room
- **update-score**: Submit round scores (triggers broadcast)
- **update-game-status**: Change game status (triggers broadcast)
- **player-update**: Player information changes

## Frontend Development Patterns

### Component Architecture

#### Component Hierarchy

```text
App
├── ConnectionStatus
├── Router
    ├── CardApp
        ├── GameSetup
        │   ├── GameTypeSelector
        │   ├── PlayerSelector
        │   └── GameSettings
        ├── GamePlay
        │   ├── GameHeader
        │   ├── ScoreBoard
        │   ├── ScoreInput
        │   └── GameControls
        ├── RivalryStats
        └── AdminPanel
```

#### Props Interface Design

```javascript
// Example component props
const GamePlay = ({
  gameId,              // string: unique game identifier
  onGameEnd,           // function: callback when game ends
  onError              // function: error handling callback
}) => {
  // Component implementation
};
```

### State Management

#### Context Usage

- **ConnectionContext**: Socket.IO connection state
- **GameContext**: Current game state (planned)
- **UserContext**: User preferences (planned)

#### Local State Patterns

```javascript
// API data with loading and error states
const [players, setPlayers] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

// Form state management
const [formData, setFormData] = useState({
  selectedGameType: '',
  selectedPlayers: [],
  gameSettings: {}
});
```

### Styling Guidelines

#### TailwindCSS Practices

- **Utility-first**: Prefer utility classes over custom CSS
- **Responsive design**: Mobile-first with responsive breakpoints
- **Dark theme**: Consistent dark theme throughout
- **Component variants**: Use DaisyUI component modifiers

#### DaisyUI Components

```javascript
// Consistent button styling
<button className="btn btn-primary btn-lg">
  Primary Action
</button>

// Form inputs with validation
<input 
  className={`input input-bordered ${error ? 'input-error' : ''}`}
  type="text"
  placeholder="Player name"
/>

// Cards for content sections
<div className="card bg-base-100 shadow-xl">
  <div className="card-body">
    <h2 className="card-title">Game Setup</h2>
    {/* Content */}
  </div>
</div>
```

## Performance Optimization

### Backend Optimization

- **Database**: Connection pooling and query optimization
- **Caching**: In-memory caching for frequently accessed data
- **Compression**: Gzip compression for API responses
- **Rate limiting**: Prevent resource exhaustion

### Frontend Optimization

- **Code splitting**: Dynamic imports for route-based splitting
- **Bundle optimization**: Vite's automatic optimizations
- **Image optimization**: Optimized asset loading
- **State optimization**: Minimal re-renders with proper dependencies

### Mobile Optimization

- **Touch targets**: Minimum 44px touch targets
- **Font scaling**: Relative units (vw, vh) for mobile scaling
- **Network awareness**: Graceful handling of poor connections
- **Offline support**: Service worker for offline functionality (planned)

## Security Considerations

### Backend Security

- **Helmet**: Security headers for all responses
- **CORS**: Restricted origins in production
- **Input validation**: Comprehensive validation and sanitization
- **Rate limiting**: Protection against abuse
- **Error handling**: No sensitive information in error messages

### Frontend Security

- **XSS prevention**: React's built-in XSS protection
- **Input sanitization**: Validation before sending to API
- **Environment variables**: No sensitive data in client code
- **HTTPS enforcement**: Secure connections in production

## Deployment Strategy

### Development Deployment

- **Local development**: Docker Compose for full stack
- **Testing**: Automated testing in CI/CD pipeline
- **Staging**: Production-like environment for testing

### Production Deployment

- **Raspberry Pi optimization**: ARM-compatible builds
- **Process management**: PM2 for process monitoring
- **Reverse proxy**: Nginx for static files and SSL
- **Database backup**: Automated backups with retention

### Monitoring and Logging

- **Application logs**: Structured logging with levels
- **Error tracking**: Error aggregation and alerting
- **Performance monitoring**: Response times and throughput
- **Health checks**: Automated health monitoring

## Contributing Guidelines

### Development Process

1. **Issue creation**: Clear description of bug/feature
2. **Branch creation**: Feature branches from main
3. **Development**: Follow coding standards
4. **Testing**: Add/update tests for changes
5. **Documentation**: Update relevant documentation
6. **Pull request**: Clear description and testing notes
7. **Code review**: Peer review process
8. **Deployment**: Staging verification before production

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests added/updated for changes
- [ ] Documentation updated
- [ ] No breaking changes (or properly documented)
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Accessibility requirements met

This guide provides a comprehensive overview of the development practices and architectural decisions for the Skorbord application. Refer to specific documentation files for detailed implementation guidelines.
