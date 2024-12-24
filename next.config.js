/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // YOLO: Ignore ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Enable WebSocket upgrade
  async headers() {
    return [
      {
        source: '/api/socketio',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS,PUT,DELETE,PATCH' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Requested-With,Content-Type,Accept,Authorization' },
        ],
      },
    ];
  },
  // Handle WebSocket upgrade
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/socketio/:path*',
          destination: '/api/socket',
          has: [
            {
              type: 'query',
              key: 'EIO',
            },
          ],
        },
      ],
    };
  },
};

module.exports = nextConfig;
