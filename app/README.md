# Skorbord Frontend

A React-based frontend for the Skorbord card scoring application, built with Vite, TailwindCSS, and DaisyUI.

## Features

- **Mobile-First Design**: Optimized for touch interactions and mobile browsers
- **Real-Time Updates**: Uses Socket.IO for live score updates across multiple clients
- **Dark Theme**: Modern dark theme with accessibility considerations
- **Touch-Friendly UI**: Large buttons and relative font sizes (vwh) for mobile optimization
- **Offline-Ready**: Graceful handling of connection issues with status indicators

## Tech Stack

- **React 18**: Modern React with functional components and hooks
- **Vite**: Fast build tool and development server
- **TailwindCSS**: Utility-first CSS framework
- **DaisyUI**: Component library built on TailwindCSS
- **Socket.IO Client**: Real-time communication with backend
- **React Router**: Client-side routing

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Update the API URL in `.env` if needed:

   ```env
   VITE_API_URL=http://localhost:2424
   ```

### Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Building for Production

Build the application:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Project Structure

```text
src/
├── components/          # React components
│   ├── AdminPanel.jsx   # Game type and player management
│   ├── CardApp.jsx      # Main application container
│   ├── ConnectionStatus.jsx # Connection indicator
│   ├── GamePlay.jsx     # Active game interface
│   ├── GameSetup.jsx    # Game initialization
│   ├── PlayerCard.jsx   # Individual player score card
│   └── RivalryStats.jsx # Rivalry statistics display
├── contexts/            # React contexts
│   └── ConnectionContext.jsx # Socket.IO connection management
├── App.jsx             # Root application component
├── main.jsx           # Application entry point
└── index.css          # Global styles and Tailwind imports
```

## Key Features

### Mobile Optimization

- **Responsive Design**: Mobile-first approach with stacked player cards on phones
- **Touch Targets**: Minimum 44px touch targets for accessibility
- **Viewport Handling**: Optimized for mobile browsers and PWA installation
- **Relative Sizing**: Uses vw/vh units for consistent scaling across devices

### Real-Time Updates

- **Socket.IO Integration**: Live score updates across all connected clients
- **Connection Management**: Automatic reconnection with visual status indicators
- **Score Tallies**: Visual feedback for rapid score changes with 3-second fade animations

### Game Flow

1. **Setup**: Select game type, configure players or use existing rivalries
2. **Play**: Touch-friendly score adjustment with +/-1 and +/-10 buttons
3. **Completion**: Automatic winner detection based on game type conditions
4. **Statistics**: View detailed rivalry statistics and historical data

### Admin Features

- **Game Type Management**: Add custom game types with win/lose conditions
- **Player Management**: Create and manage player profiles
- **Favorites**: Mark frequently played game types for quick random selection

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:2424` |

## Browser Support

- **Modern Mobile Browsers**: iOS Safari, Android Chrome
- **Desktop Browsers**: Chrome, Firefox, Safari, Edge
- **PWA Support**: Can be installed as a Progressive Web App

## Development Notes

- Uses ES6+ features without TypeScript for simplicity
- Follows React best practices with functional components and hooks
- TailwindCSS classes are processed at build time
- Socket.IO connection is managed through React Context
- Error boundaries and loading states provide robust UX

## Deployment

The built application (`/dist` folder) can be deployed to any static hosting service:

- **Vercel**: Automatic deployment from Git repositories
- **Netlify**: Static site hosting with form handling
- **GitHub Pages**: Free hosting for public repositories
- **Firebase Hosting**: Google's static hosting solution

## API Integration

The frontend communicates with the backend API through:

- **REST endpoints**: CRUD operations for games, players, and statistics
- **Socket.IO events**: Real-time updates and notifications
- **Error handling**: Graceful degradation when API is unavailable

## Contributing

1. Follow the existing code style and patterns
2. Ensure mobile responsiveness for any new components
3. Test on both mobile and desktop browsers
4. Update documentation for new features

## License

This project is part of the Skorbord application suite.
