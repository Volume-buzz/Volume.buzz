'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error, {
      tags: {
        component: 'global_error_boundary'
      },
      extra: {
        digest: error.digest
      }
    });
  }, [error]);

  return (
    <html>
      <body className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <h1 className="text-2xl font-bold mb-4">🚨 Something went wrong!</h1>
          <p className="text-gray-300 mb-6">
            An unexpected error occurred. Our team has been notified.
          </p>
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