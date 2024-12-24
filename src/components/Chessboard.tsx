'use client';

import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { Socket } from 'socket.io-client';
import { getSocket, initializeSocket } from '@/lib/socket';

type PlayerColor = 'white' | 'black';
type GameMode = 'play' | 'training' | 'multiplayer';

// Common chess openings with their first few moves
const OPENINGS = {
  'Ruy Lopez': ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
  'Italian Game': ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
  'Sicilian Defense': ['e4', 'c5'],
  'French Defense': ['e4', 'e6'],
  'Caro-Kann': ['e4', 'c6'],
  "Queen's Gambit": ['d4', 'd5', 'c4'],
  'Kings Indian': ['d4', 'Nf6', 'c4', 'g6'],
  'English Opening': ['c4'],
  'Kings Pawn': ['e4'],
  'Queens Pawn': ['d4'],
  'Scandinavian Defense': ['e4', 'd5'],
  'Pirc Defense': ['e4', 'd6'],
  'Modern Defense': ['e4', 'g6'],
  'Dutch Defense': ['d4', 'f5'],
  'Nimzo-Indian Defense': ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
} as const;

export default function ChessGame() {
  const [game, setGame] = useState(new Chess());
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white');
  const [engineLevel, setEngineLevel] = useState(10);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('play');
  const [selectedOpening, setSelectedOpening] = useState<keyof typeof OPENINGS | ''>('');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [currentOpeningMove, setCurrentOpeningMove] = useState(0);
  const [currentOpening, setCurrentOpening] = useState<string>('');
  
  // Multiplayer states
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  // Helper function to recognize openings
  function recognizeOpening(moves: string[]): string {
    if (!moves || moves.length === 0) return '';

    // Check each opening
    for (const [name, sequence] of Object.entries(OPENINGS)) {
      if (moves.length >= sequence.length) {
        // Check if the moves match the opening sequence
        const matchesOpening = sequence.every((move, index) => moves[index] === move);
        if (matchesOpening) {
          return name;
        }
      } else {
        // Check if the moves match the opening sequence so far
        const matchesSoFar = moves.every((move, index) => sequence[index] === move);
        if (matchesSoFar) {
          return name + ' (Developing)';
        }
      }
    }

    // Recognize basic openings by first move
    if (moves.length === 1) {
      if (moves[0] === 'e4') return "King's Pawn Opening";
      if (moves[0] === 'd4') return "Queen's Pawn Opening";
      if (moves[0] === 'c4') return 'English Opening';
      if (moves[0] === 'Nf3') return 'Réti Opening';
    }

    return '';
  }

  // Initialize socket connection
  useEffect(() => {
    if (gameMode === 'multiplayer') {
      const socket = getSocket();
      setSocket(socket);

      socket.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to server');
        
        // Request game state if rejoining a room
        if (roomId) {
          socket.emit('requestGameState', roomId);
        }
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from server');
      });

      socket.on('roomCreated', ({ roomId, color }) => {
        console.log('Room created:', roomId, 'Playing as:', color);
        setRoomId(roomId);
        setPlayerColor(color);
        setWaitingForOpponent(true);
        setIsGameStarted(true);
      });

      socket.on('colorAssigned', (color: PlayerColor) => {
        console.log('Assigned color:', color);
        setPlayerColor(color);
        setWaitingForOpponent(false);
        setIsGameStarted(true);
      });

      socket.on('spectatorMode', () => {
        setPlayerColor('white'); // Spectators see board from white's perspective
        setWaitingForOpponent(false);
        setIsGameStarted(true);
      });

      socket.on('gameState', ({ fen, white, black, moves, isGameOver, turn, lastMove }) => {
        console.log('Game state update:', { fen, white, black, moves, isGameOver, turn });
        const newGame = new Chess(fen);
        setGame(newGame);
        setMoveHistory(moves || []);
        setWaitingForOpponent(!(white && black));

        // Update opening recognition
        const opening = recognizeOpening(moves || []);
        setCurrentOpening(opening);

        // Highlight last move if available
        if (lastMove) {
          // Handle move highlighting logic here if needed
        }
      });

      socket.on('gameEnded', ({ result, reason }) => {
        if (reason === 'inactivity') {
          alert('Game ended due to inactivity');
        } else if (result) {
          alert(`Game Over! ${result === 'draw' ? "It's a draw!" : `${result} wins!`}`);
        }
        setIsGameStarted(false);
      });

      socket.on('playerLeft', ({ color, gameState, moves }) => {
        alert(`${color} player has left the game`);
        setWaitingForOpponent(true);
        const newGame = new Chess(gameState);
        setGame(newGame);
        setMoveHistory(moves);
      });

      socket.on('error', (message) => {
        console.error('Socket error:', message);
        alert(message);
      });

      return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('roomCreated');
        socket.off('colorAssigned');
        socket.off('spectatorMode');
        socket.off('gameState');
        socket.off('gameEnded');
        socket.off('playerLeft');
        socket.off('error');
      };
    }
  }, [gameMode, roomId]);

  // Create a new multiplayer game
  const createMultiplayerGame = useCallback(() => {
    if (!socket) return;
    const newGame = new Chess();
    setGame(newGame);
    setMoveHistory([]);
    socket.emit('createRoom');
    setIsGameStarted(true);
  }, [socket]);

  // Join a multiplayer game
  const joinMultiplayerGame = useCallback((roomToJoin: string) => {
    if (!socket || !roomToJoin) return;
    const newGame = new Chess();
    setGame(newGame);
    setMoveHistory([]);
    socket.emit('joinRoom', roomToJoin);
    setIsGameStarted(true);
  }, [socket]);

  // Check if it's AI's turn
  const isAITurn = useCallback(() => {
    return gameMode === 'play' && 
           isGameStarted && 
           !game.isGameOver() && 
           ((game.turn() === 'w' && playerColor === 'black') || 
            (game.turn() === 'b' && playerColor === 'white'));
  }, [game, playerColor, gameMode, isGameStarted]);

  // Make a move and handle game state
  const makeMove = useCallback((move: any) => {
    const gameCopy = new Chess(game.fen());
    try {
      const result = gameCopy.move(move);
      if (result) {
        setGame(gameCopy);
        
        // In multiplayer mode, send move to server
        if (gameMode === 'multiplayer' && socket) {
          console.log('Sending move to server:', {
            roomId,
            move: result,
            fen: gameCopy.fen()
          });
          socket.emit('move', {
            roomId,
            move: result,
            fen: gameCopy.fen()
          });
        } else {
          // For non-multiplayer modes, update move history locally
          setMoveHistory(prev => [...prev, result.san]);
          // Update opening recognition
          const opening = recognizeOpening(gameCopy.history());
          setCurrentOpening(opening);
        }
        
        // Handle training mode move verification
        if (gameMode === 'training' && selectedOpening) {
          const openingMoves = OPENINGS[selectedOpening];
          if (currentOpeningMove < openingMoves.length) {
            if (result.san === openingMoves[currentOpeningMove]) {
              setCurrentOpeningMove(prev => prev + 1);
            } else {
              alert('That move deviates from the selected opening. Try again!');
              return false;
            }
          }
        }
        return true;
      }
    } catch (error) {
      console.error('Move error:', error);
      return false;
    }
    return false;
  }, [game, gameMode, socket, roomId, selectedOpening, currentOpeningMove]);

  // Effect to handle AI moves
  useEffect(() => {
    if (isAITurn()) {
      makeAIMove();
    }
  }, [game, isAITurn]);

  // Evaluate position (simple material counting)
  const evaluatePosition = (game: Chess) => {
    const pieceValues = {
      p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
      P: -1, N: -3, B: -3, R: -5, Q: -9, K: 0
    };
    
    let score = 0;
    const board = game.board();
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece) {
          score += pieceValues[piece.type as keyof typeof pieceValues];
        }
      }
    }
    
    return score;
  };

  // Get best move for AI
  const getBestMove = (game: Chess) => {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;
    
    const movesWithEvaluation = moves.map(move => {
      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      
      let score = evaluatePosition(gameCopy);
      
      // Add positional bonuses based on engine level
      if (engineLevel > 10) {
        // Control of center
        if (['e4', 'e5', 'd4', 'd5'].includes(move.to)) score += 0.2;
        // Development of pieces
        if (move.piece === 'n' || move.piece === 'b') score += 0.1;
        // Castle early
        if (move.flags.includes('k') || move.flags.includes('q')) score += 0.3;
        // Don't move queen too early
        if (move.piece === 'q' && moveHistory.length < 6) score -= 0.2;
      }
      
      return { move, score };
    });
    
    // Sort moves by score
    movesWithEvaluation.sort((a, b) => b.score - a.score);
    
    // Add randomness based on engine level
    const randomFactor = (20 - engineLevel) / 20;
    const randomIndex = Math.floor(Math.random() * movesWithEvaluation.length * randomFactor);
    return movesWithEvaluation[randomIndex].move;
  };

  // Handle AI move
  const makeAIMove = useCallback(() => {
    if (!isAITurn()) return;
    
    const move = getBestMove(game);
    if (move) {
      setTimeout(() => {
        makeMove({
          from: move.from,
          to: move.to,
          promotion: move.promotion || 'q',
        });
      }, 300);
    }
  }, [game, makeMove, isAITurn]);

  // Handle piece drop
  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!isGameStarted) return false;
    
    // In multiplayer mode, only allow moves on player's turn
    if (gameMode === 'multiplayer') {
      if (waitingForOpponent) return false;
      if (game.turn() !== playerColor[0]) return false;

      const move = {
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Always promote to queen for simplicity
      };

      try {
        // Validate move locally first
        const gameCopy = new Chess(game.fen());
        const result = gameCopy.move(move);
        
        if (result) {
          // If move is valid, send to server
          socket?.emit('move', {
            roomId,
            move
          });
          return true;
        }
        return false;
      } catch (error) {
        console.error('Move error:', error);
        return false;
      }
    } else if (gameMode === 'play') {
      if (game.turn() !== playerColor[0]) return false;
      return makeMove({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
    }

    return false;
  }

  // Start new game
  const startNewGame = (color?: PlayerColor) => {
    const newGame = new Chess();
    setGame(newGame);
    setIsGameStarted(true);
    setMoveHistory([]);
    setCurrentOpeningMove(0);
    
    if (color) {
      setPlayerColor(color);
    } else {
      const randomColor: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
      setPlayerColor(randomColor);
    }
  };

  // Reset game
  const resetGame = () => {
    setGame(new Chess());
    setIsGameStarted(false);
    setMoveHistory([]);
    setCurrentOpeningMove(0);
    setSelectedOpening('');
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-4 mb-4">
        {gameMode !== 'multiplayer' ? (
          <>
            <button
              onClick={() => {
                setGameMode('play');
                startNewGame('white');
              }}
              className="px-4 py-2 bg-white text-black border border-gray-300 rounded hover:bg-gray-100"
            >
              Play as White
            </button>
            <button
              onClick={() => {
                setGameMode('play');
                startNewGame('black');
              }}
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
            >
              Play as Black
            </button>
            <button
              onClick={() => {
                setGameMode('play');
                startNewGame();
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Random Color
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-4 items-center">
            <div className="flex gap-4">
              <button
                onClick={createMultiplayerGame}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                disabled={!isConnected}
              >
                Create Game
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Room ID"
                  className="px-2 py-1 border rounded"
                />
                <button
                  onClick={() => joinMultiplayerGame(roomId)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={!isConnected || !roomId}
                >
                  Join Game
                </button>
              </div>
            </div>
            {waitingForOpponent && (
              <div className="text-yellow-600">
                Waiting for opponent... Share Room ID: {roomId}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-4 mb-4">
        <button
          onClick={() => {
            setGameMode('training');
            setIsGameStarted(false);
          }}
          className={`px-4 py-2 rounded ${
            gameMode === 'training'
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          Opening Training
        </button>
        <button
          onClick={() => {
            setGameMode('multiplayer');
            setIsGameStarted(false);
          }}
          className={`px-4 py-2 rounded ${
            gameMode === 'multiplayer'
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          Multiplayer
        </button>
      </div>
      
      {gameMode === 'training' && (
        <div className="flex flex-col gap-2 mb-4">
          <select
            value={selectedOpening}
            onChange={(e) => {
              setSelectedOpening(e.target.value as keyof typeof OPENINGS);
              const newGame = new Chess();
              setGame(newGame);
              setMoveHistory([]);
              setCurrentOpeningMove(0);
              setIsGameStarted(true);
            }}
            className="px-4 py-2 border rounded"
          >
            <option value="">Select an Opening</option>
            {Object.keys(OPENINGS).map((opening) => (
              <option key={opening} value={opening}>
                {opening}
              </option>
            ))}
          </select>
          {selectedOpening && (
            <div className="text-sm">
              Progress: {currentOpeningMove} / {OPENINGS[selectedOpening].length} moves
            </div>
          )}
        </div>
      )}

      {gameMode === 'play' && (
        <div className="flex items-center gap-4 mb-4">
          <label htmlFor="difficulty" className="font-medium">
            AI Difficulty:
          </label>
          <input
            id="difficulty"
            type="range"
            min="0"
            max="20"
            value={engineLevel}
            onChange={(e) => setEngineLevel(Number(e.target.value))}
            className="w-48"
          />
          <span>{engineLevel}</span>
        </div>
      )}

      {isGameStarted ? (
        <div className="text-lg mb-4">
          {gameMode === 'play' ? (
            <>
              Playing as: {playerColor} | Turn: {game.turn() === 'w' ? 'White' : 'Black'}
              {currentOpening && (
                <span className="ml-2 text-blue-600">| Opening: {currentOpening}</span>
              )}
              {game.isGameOver() && (
                <span className="ml-2 font-bold">
                  Game Over! {game.isCheckmate() ? 'Checkmate!' : 'Draw!'}
                </span>
              )}
            </>
          ) : gameMode === 'training' ? (
            <>Training: {selectedOpening}</>
          ) : (
            <>
              Playing as: {playerColor} | Room: {roomId}
              {currentOpening && (
                <span className="ml-2 text-blue-600">| Opening: {currentOpening}</span>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="text-lg mb-4">
          {gameMode === 'play' ? (
            'Select a color to start'
          ) : gameMode === 'training' ? (
            'Select an opening to practice'
          ) : (
            'Create or join a game to start'
          )}
        </div>
      )}

      <div className="flex gap-8">
        <div className="w-[600px] h-[600px]">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardWidth={600}
            boardOrientation={playerColor}
          />
        </div>

        <div className="w-64 bg-gray-100 p-4 rounded-lg">
          <h3 className="font-bold mb-2">Move History</h3>
          <div className="h-[500px] overflow-y-auto">
            {moveHistory.map((move, index) => (
              <div key={index} className="flex">
                {index % 2 === 0 && (
                  <span className="w-12 text-gray-500">{Math.floor(index / 2) + 1}.</span>
                )}
                <span className="w-20">{move}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={resetGame}
        className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Reset Game
      </button>
    </div>
  );
} 