import type { NextConfig } from 'next';
// BullMQ resolves optional Valkey transports dynamically; keeping it external
// prevents Next from attempting to bundle an intentionally absent transport.
const nextConfig: NextConfig = { output: 'standalone', serverExternalPackages: ['bullmq'] };
export default nextConfig;
