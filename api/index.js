import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

// Import routes
import sqidRoutes from './routes/sqids.js';
import gameTypeRoutes from './routes/gameTypes.js';
import playerRoutes from './routes/players.js';
import gameRoutes from './routes/games.js';
import statsRoutes from './routes/stats.js';
import rivalryRoutes from './routes/rivalries.js';
import favoritesRoutes from './routes/favorites.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { validateSquid, validateCreateSquid } from './middleware/validation.js';
// import { socketAuthMiddleware } from './middleware/socketAuth.js';

// Import utilities  
import { createResponse, isValidId } from './utils/helpers.js';
import { ValidationError, ConflictError } from './middleware/errorHandler.js';
import db from './db/database.js';

// Import socket handlers
import { handleConnection } from './sockets/handlers.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://cards.skorbord.app']
      : ['http://localhost:2424'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 5000,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://cards.skorbord.app']
    : ['http://localhost:2424'],
  credentials: true
}));

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Load OpenAPI specification
const swaggerDocument = YAML.load(join(__dirname, 'swagger', 'api-docs.yaml'));

// API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Skorbord API Documentation'
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/game_types', gameTypeRoutes);

// Middleware to attach Socket.IO instance to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Sqid creation route (without validation middleware)
app.post('/api/sqids/:sqid', validateCreateSquid, async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { name } = req.body;
    
    if (!isValidId(sqid)) {
      throw new ValidationError('Invalid Sqid format');
    }
    
    // Check if Sqid already exists
    const existingSquid = await db.get(
      'SELECT id FROM sqids WHERE id = ?',
      [sqid]
    );
    
    if (existingSquid) {
      throw new ConflictError('Sqid already exists');
    }
    
    // Create new Sqid
    const sqidName = name || `Game ${sqid}`;
    const sqidData = {
      id: sqid,
      name: sqidName,
      created_at: new Date().toISOString()
    };
    
    await db.run(
      'INSERT INTO sqids (id, name, created_at) VALUES (?, ?, ?)',
      [sqidData.id, sqidData.name, sqidData.created_at]
    );
    
    res.status(201).json(createResponse(true, sqidData));
  } catch (error) {
    next(error);
  }
});

app.use('/api/:sqid', validateSquid, sqidRoutes);
app.use('/api/:sqid/players', validateSquid, playerRoutes);
app.use('/api/:sqid/games', validateSquid, gameRoutes);
app.use('/api/:sqid/games/:gameId/stats', validateSquid, statsRoutes);
app.use('/api/:sqid/rivalries', validateSquid, rivalryRoutes);
app.use('/api/:sqid/game_types/:gameTypeId/favorite', validateSquid, favoritesRoutes);

// Serve static files from frontend build
app.use(express.static(join(__dirname, 'app', 'dist')));

// SPA fallback for React Router
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'app', 'dist', 'index.html'));
});

// Socket.IO middleware and handlers
// io.use(socketAuthMiddleware);
io.on('connection', (socket) => handleConnection(io, socket));

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.PORT || 2525;

httpServer.listen(PORT, () => {
  console.log(`🚀 Skorbord API server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️ Database: ${process.env.DATABASE_URL}`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`🌐 Server accessible at: http://localhost:2525`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

export { app, io };
