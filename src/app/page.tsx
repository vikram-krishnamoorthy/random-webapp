import ChessGame from '@/components/Chessboard';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center p-8 bg-gray-100">
      <h1 className="text-4xl font-bold mb-8">Chess Opening Trainer</h1>
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <ChessGame />
      </div>
    </main>
  );
}
