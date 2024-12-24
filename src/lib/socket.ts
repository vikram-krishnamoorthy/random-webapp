import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

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
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['polling', 'websocket'],
    autoConnect: true,
    timeout: 10000,
    forceNew: true,
    auth: {
      timestamp: Date.now()
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    // Force a clean reconnection after error
    if (socket) {
      socket.close();
      socket.connect();
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnection attempt ${attempt}`);
    // Update auth timestamp on reconnection attempts
    if (socket) {
      socket.auth = { timestamp: Date.now() };
    }
  });

  socket.on('connect', () => {
    console.log('Socket connected successfully');
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, try to reconnect
      socket?.connect();
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  return socket;
};

export const getSocket = () => {
  return initializeSocket();
};

export const closeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}; 