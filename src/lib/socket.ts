import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export const initializeSocket = () => {
  if (socket?.connected) return socket;

  if (socket) {
    socket.close();
    socket = null;
  }

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

  socket = io(socketUrl, {
    path: '/api/socketio',
    addTrailingSlash: false,
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: true,
    forceNew: true,
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: true,
    secure: true,
    rejectUnauthorized: false,
    withCredentials: true,
    auth: {
      timestamp: Date.now(),
    },
    query: {
      t: Date.now(), // Cache buster
    },
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    reconnectAttempts++;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      socket?.close();
      return;
    }

    // Force a clean reconnection after error
    setTimeout(() => {
      if (socket) {
        socket.close();
        socket.connect();
      }
    }, Math.min(1000 * Math.pow(2, reconnectAttempts), 10000));
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnection attempt ${attempt}`);
    // Update auth timestamp and transport on reconnection attempts
    if (socket) {
      socket.auth = { timestamp: Date.now() };
      // Try websocket first, then fallback to polling
      socket.io.opts.transports = ['websocket', 'polling'];
    }
  });

  socket.on('connect', () => {
    console.log('Socket connected successfully');
    reconnectAttempts = 0; // Reset reconnection attempts on successful connection
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect' || reason === 'transport close') {
      // Server initiated disconnect or transport closed, try to reconnect
      setTimeout(() => {
        socket?.connect();
      }, 1000);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    // Attempt to recover from errors
    if (socket?.connected) {
      socket.disconnect().connect();
    }
  });

  // Ping to keep connection alive
  setInterval(() => {
    if (socket?.connected) {
      socket.emit('ping');
    }
  }, 25000);

  return socket;
};

export const getSocket = () => {
  if (!socket || !socket.connected) {
    return initializeSocket();
  }
  return socket;
};

export const closeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    reconnectAttempts = 0;
  }
};
