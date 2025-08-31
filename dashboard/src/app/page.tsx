export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-green-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">🎵 Audius Discord Bot</h1>
          <p className="text-lg text-gray-600">Connect your music accounts to earn crypto rewards</p>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
            <h2 className="text-xl font-bold mb-2">🎶 Spotify Integration</h2>
            <p className="text-sm mb-4">Connect your Spotify account to participate in music raids and earn tokens</p>
            <div className="text-xs opacity-90">
              <p>✓ Track listening activity</p>
              <p>✓ Premium account detection</p>
              <p>✓ Real-time player state monitoring</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
            <h2 className="text-xl font-bold mb-2">🎵 Audius Integration</h2>
            <p className="text-sm mb-4">Connect your Audius account to discover and raid new tracks</p>
            <div className="text-xs opacity-90">
              <p>✓ Track discovery and search</p>
              <p>✓ Artist verification status</p>
              <p>✓ Profile and listening history</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">🚀 Getting Started</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>1. Join the Discord server</p>
            <p>2. Use <code className="bg-gray-100 px-2 py-1 rounded">/login</code> command</p>
            <p>3. Connect your music accounts</p>
            <p>4. Start earning crypto rewards!</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs text-gray-500">
            This OAuth service handles secure authentication for the Audius Discord Bot.
            Your credentials are never stored - only temporary session tokens.
          </p>
        </div>
      </div>
    </div>
  );
}
