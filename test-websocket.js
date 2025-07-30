import { io } from 'socket.io-client';

console.log('Testing WebSocket connection...');

// Test direct connection to backend
const socket = io('http://localhost:2525', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  timeout: 10000,
  forceNew: true
});

socket.on('connect', () => {
  console.log('✅ Successfully connected to backend:', socket.id);
  
  // Test joining a sqid room
  socket.emit('join-sqid', 'demo');
  
  // Listen for connection confirmation
  socket.on('connected', (data) => {
    console.log('✅ Successfully joined sqid room:', data);
    process.exit(0);
  });
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('❌ Connection timeout');
  socket.close();
  process.exit(1);
}, 5000);
