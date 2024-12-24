importScripts('https://unpkg.com/stockfish.js@10.0.2/stockfish.js');

const stockfish = new Worker(stockfish.js);

onmessage = function (e) {
  stockfish.postMessage(e.data);
};

stockfish.onmessage = function (e) {
  postMessage(e.data);
};
