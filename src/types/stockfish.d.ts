declare module 'stockfish' {
  interface Stockfish {
    postMessage: (message: string) => void;
    onmessage: (event: { data: string }) => void;
    terminate: () => void;
  }

  function Stockfish(): Stockfish;
  export default Stockfish;
} 