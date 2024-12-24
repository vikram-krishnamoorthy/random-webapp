import { Server as IOServer, Socket } from 'socket.io';
import type { NextRequest } from 'next/server';
import { Chess, Move } from 'chess.js';

export const config = {
  runtime: 'edge',
  regions: ['iad1'],  // US East (N. Virginia)
};

interface GameRoom {
  white?: string;
  black?: string;
  spectators: string[];
  game: Chess;
  moves: string[];
  lastMoveTime: number;
  lastPing?: number;
}

interface GameState {
  fen: string;
  white?: string;
  black?: string;
  moves: string[];
  isGameOver: boolean;
  turn: string;
  lastMove?: Move;
}

const rooms = new Map<string, GameRoom>();
const ROOM_CLEANUP_INTERVAL = 30000;
const ROOM_INACTIVE_TIMEOUT = 300000;

let io: IOServer | null = null;

const initSocketServer = (): IOServer => {
  if (io) return io;

  io = new IOServer({
    path: '/api/socketio',
    addTrailingSlash: false,
    transports: ['polling', 'websocket'],
    cors: {
      origin: '*',
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['*'],
    },
    connectTimeout: 20000,
    pingTimeout: 10000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    allowUpgrades: true,
    cookie: false,
    serveClient: false,
    allowEIO3: true,
    maxHttpBufferSize: 1e8,
    perMessageDeflate: false,
  });

  // Set up room cleanup interval
  setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, roomId) => {
      if (now - room.lastMoveTime > ROOM_INACTIVE_TIMEOUT && (!room.lastPing || now - room.lastPing > ROOM_INACTIVE_TIMEOUT)) {
        io?.to(roomId).emit('roomClosed', { reason: 'inactivity' });
        rooms.delete(roomId);
        console.log('Room deleted due to inactivity:', roomId);
      }
    });
  }, ROOM_CLEANUP_INTERVAL);

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('ping', () => {
      socket.emit('pong');
      rooms.forEach((room) => {
        if (room.white === socket.id || room.black === socket.id || room.spectators.includes(socket.id)) {
          room.lastPing = Date.now();
        }
      });
    });

    socket.on('requestGameState', (roomId: string) => {
      const room = rooms.get(roomId);
      if (room) {
        const gameState: GameState = {
          fen: room.game.fen(),
          white: room.white,
          black: room.black,
          moves: room.moves,
          isGameOver: room.game.isGameOver(),
          turn: room.game.turn(),
        };
        socket.emit('gameState', gameState);
      } else {
        socket.emit('error', 'Room not found');
      }
    });

    socket.on('createRoom', () => {
      try {
        const roomId = Math.random().toString(36).substring(7);
        const game = new Chess();
        
        rooms.set(roomId, {
          white: socket.id,
          black: undefined,
          spectators: [],
          game,
          moves: [],
          lastMoveTime: Date.now(),
          lastPing: Date.now(),
        });

        socket.join(roomId);
        socket.emit('roomCreated', { roomId, color: 'white' });
        
        const gameState: GameState = {
          fen: game.fen(),
          white: socket.id,
          black: undefined,
          moves: [],
          isGameOver: false,
          turn: 'w',
        };
        io?.to(roomId).emit('gameState', gameState);

        console.log('Room created:', roomId);
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error', 'Failed to create room');
      }
    });

    socket.on('joinRoom', (roomId: string) => {
      try {
        console.log('Join room attempt:', roomId);
        const room = rooms.get(roomId);
        if (!room) {
          socket.emit('error', 'Room not found');
          return;
        }

        let assignedColor: 'white' | 'black' | undefined;
        if (!room.white) {
          room.white = socket.id;
          assignedColor = 'white';
        } else if (!room.black) {
          room.black = socket.id;
          assignedColor = 'black';
        } else {
          room.spectators.push(socket.id);
        }

        room.lastPing = Date.now();
        socket.join(roomId);
        
        if (assignedColor) {
          socket.emit('colorAssigned', assignedColor);
          console.log('Color assigned:', assignedColor, 'to', socket.id);
        } else {
          socket.emit('spectatorMode');
        }

        const gameState: GameState = {
          fen: room.game.fen(),
          white: room.white,
          black: room.black,
          moves: room.moves,
          isGameOver: room.game.isGameOver(),
          turn: room.game.turn(),
        };
        io?.to(roomId).emit('gameState', gameState);
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', 'Failed to join room');
      }
    });

    socket.on('move', ({ roomId, move }: { roomId: string; move: any }) => {
      try {
        const room = rooms.get(roomId);
        if (!room) {
          socket.emit('error', 'Room not found');
          return;
        }

        const isWhiteTurn = room.game.turn() === 'w';
        if ((isWhiteTurn && room.white !== socket.id) || (!isWhiteTurn && room.black !== socket.id)) {
          socket.emit('error', 'Not your turn');
          return;
        }

        try {
          const result = room.game.move(move);
          if (!result) {
            socket.emit('error', 'Invalid move');
            return;
          }

          room.moves.push(result.san);
          room.lastMoveTime = Date.now();
          room.lastPing = Date.now();

          const gameState: GameState = {
            fen: room.game.fen(),
            white: room.white,
            black: room.black,
            moves: room.moves,
            isGameOver: room.game.isGameOver(),
            turn: room.game.turn(),
            lastMove: result,
          };
          io?.to(roomId).emit('gameState', gameState);

          if (room.game.isGameOver()) {
            let gameResult;
            if (room.game.isCheckmate()) {
              gameResult = isWhiteTurn ? 'white' : 'black';
            } else {
              gameResult = 'draw';
            }
            io?.to(roomId).emit('gameEnded', { result: gameResult });
          }
        } catch (moveError) {
          console.error('Move error:', moveError);
          socket.emit('error', 'Invalid move');
        }
      } catch (error) {
        console.error('Error processing move:', error);
        socket.emit('error', 'Failed to process move');
      }
    });

    socket.on('disconnect', () => {
      try {
        rooms.forEach((room, roomId) => {
          if (room.white === socket.id || room.black === socket.id) {
            const color = room.white === socket.id ? 'white' : 'black';
            if (color === 'white') room.white = undefined;
            if (color === 'black') room.black = undefined;
            
            io?.to(roomId).emit('playerLeft', {
              color,
              gameState: room.game.fen(),
              moves: room.moves,
            });

            if (!room.white && !room.black && room.spectators.length === 0) {
              rooms.delete(roomId);
              console.log('Room deleted:', roomId);
            }
          }
          room.spectators = room.spectators.filter(id => id !== socket.id);
        });
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });

  return io;
};

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  try {
    const io = initSocketServer();
    
    return new Promise<Response>((resolve, reject) => {
      io.engine.handleRequest(req as any, {} as any, (err?: Error) => {
        if (err) {
          console.error('Socket.IO request handling error:', err);
          reject(new Response('Internal Server Error', { status: 500 }));
          return;
        }
        resolve(new Response(null, { status: 200 }));
      });
    });
  } catch (err) {
    console.error('Socket.IO error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
