'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <h1 className="text-2xl font-bold mb-4">🚨 Something went wrong!</h1>
          <p className="text-gray-300 mb-6">
            An unexpected error occurred. Please try again.
          </p>
          {error.message && (
            <p className="text-sm text-gray-400 mb-4 font-mono">
              {error.message}
            </p>
          )}
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            onClick={reset}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}