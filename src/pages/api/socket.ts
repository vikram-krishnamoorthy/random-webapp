import { Server as IOServer } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';
import { Chess } from 'chess.js';

interface ServerWithIO extends HTTPServer {
  io?: IOServer;
}

interface SocketWithIO extends NetSocket {
  server: ServerWithIO;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

interface GameRoom {
  white?: string;
  black?: string;
  spectators: string[];
  game: Chess;
  moves: string[];
  lastMoveTime: number;
}

const rooms = new Map<string, GameRoom>();

export const config = {
  api: {
    bodyParser: false,
  },
};

const initSocketServer = (server: HTTPServer) => {
  if ((server as ServerWithIO).io) {
    return (server as ServerWithIO).io;
  }

  const io = new IOServer(server, {
    path: '/api/socketio',
    addTrailingSlash: false,
    transports: ['polling', 'websocket'],
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
      credentials: true,
    },
    connectTimeout: 10000,
    pingTimeout: 5000,
    pingInterval: 3000,
    upgradeTimeout: 10000,
    allowUpgrades: true,
    cookie: false,
    serveClient: false,
    allowEIO3: true,
    maxHttpBufferSize: 1e8,
  });

  (server as ServerWithIO).io = io;

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('requestGameState', (roomId: string) => {
      const room = rooms.get(roomId);
      if (room) {
        socket.emit('gameState', {
          fen: room.game.fen(),
          white: room.white,
          black: room.black,
          moves: room.moves,
          isGameOver: room.game.isGameOver(),
          turn: room.game.turn(),
        });
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
        });

        socket.join(roomId);
        socket.emit('roomCreated', { roomId, color: 'white' });

        io?.to(roomId).emit('gameState', {
          fen: game.fen(),
          white: socket.id,
          black: undefined,
          moves: [],
          isGameOver: false,
          turn: 'w',
        });

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

        socket.join(roomId);

        if (assignedColor) {
          socket.emit('colorAssigned', assignedColor);
          console.log('Color assigned:', assignedColor, 'to', socket.id);
        } else {
          socket.emit('spectatorMode');
        }

        io?.to(roomId).emit('gameState', {
          fen: room.game.fen(),
          white: room.white,
          black: room.black,
          moves: room.moves,
          isGameOver: room.game.isGameOver(),
          turn: room.game.turn(),
        });
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
        if (
          (isWhiteTurn && room.white !== socket.id) ||
          (!isWhiteTurn && room.black !== socket.id)
        ) {
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

          io?.to(roomId).emit('gameState', {
            fen: room.game.fen(),
            white: room.white,
            black: room.black,
            moves: room.moves,
            isGameOver: room.game.isGameOver(),
            turn: room.game.turn(),
            lastMove: result,
          });

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
          room.spectators = room.spectators.filter((id) => id !== socket.id);
        });
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });

  return io;
};

export default async function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const io = initSocketServer(res.socket.server);

    // Handle the socket.io request
    await new Promise((resolve) => {
      // @ts-ignore - types mismatch but this works
      io.engine.handleRequest(req, res, resolve);
    });
  } catch (err) {
    console.error('Socket.IO error:', err);
    res.status(500).end();
  }
}
