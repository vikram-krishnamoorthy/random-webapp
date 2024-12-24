import { io, Socket } from 'socket.io-client';
import type { ManagerOptions, SocketOptions } from 'socket.io-client';

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export const initializeSocket = (): Socket => {
  if (socket?.connected) return socket;

  if (socket) {
    socket.close();
    socket = null;
  }

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

  const options: Partial<ManagerOptions & SocketOptions> = {
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
    transports: ['polling', 'websocket'],
    upgrade: true,
    rememberUpgrade: true,
    secure: true,
    rejectUnauthorized: false,
    withCredentials: true,
    extraHeaders: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    auth: {
      timestamp: Date.now(),
    },
    query: {
      t: Date.now().toString(),
      EIO: '4',
      transport: 'polling',
    },
  };

  socket = io(socketUrl, options);

  socket.io.engine.on("error", (err: string | Error) => {
    console.error('Transport error:', err);
    if (socket) {
      socket.io.opts.transports = ['polling'];
      socket.connect();
    }
  });

  socket.io.engine.on("upgradeError", (err: string | Error) => {
    console.error('WebSocket upgrade failed:', err);
    if (socket) {
      socket.io.opts.transports = ['polling'];
    }
  });

  socket.io.engine.on("upgrade", () => {
    console.log('Transport upgraded to WebSocket');
  });

  socket.on('connect_error', (err: Error) => {
    console.error('Socket connection error:', err);
    reconnectAttempts++;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      socket?.close();
      return;
    }

    setTimeout(() => {
      if (socket) {
        socket.io.opts.transports = ['polling'];
        socket.connect();
      }
    }, Math.min(1000 * Math.pow(2, reconnectAttempts), 10000));
  });

  socket.on('reconnect_attempt', (attempt: number) => {
    console.log(`Reconnection attempt ${attempt}`);
    if (socket) {
      socket.auth = { timestamp: Date.now() };
      socket.io.opts.transports = ['polling'];
    }
  });

  socket.on('connect', () => {
    console.log('Socket connected successfully');
    reconnectAttempts = 0;
    
    // Try upgrading to WebSocket after successful polling connection
    if (socket) {
      setTimeout(() => {
        if (socket?.io.opts.transports) {
          socket.io.opts.transports = ['polling', 'websocket'];
        }
      }, 1000);
    }
  });

  socket.on('disconnect', (reason: string) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'transport error') {
      setTimeout(() => {
        if (socket) {
          socket.io.opts.transports = ['polling'];
          socket.connect();
        }
      }, 1000);
    }
  });

  socket.on('error', (err: Error) => {
    console.error('Socket error:', err);
    if (socket?.connected) {
      socket.io.opts.transports = ['polling'];
      socket.disconnect().connect();
    }
  });

  const pingInterval = setInterval(() => {
    if (socket?.connected) {
      socket.emit('ping');
    } else if (!socket) {
      clearInterval(pingInterval);
    }
  }, 25000);

  return socket;
};

export const getSocket = (): Socket => {
  if (!socket || !socket.connected) {
    return initializeSocket();
  }
  return socket;
};

export const closeSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
    reconnectAttempts = 0;
  }
};
