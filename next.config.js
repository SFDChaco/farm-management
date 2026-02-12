/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'tcxssvwbbcvvyatdqesa.supabase.co' },
    ],
  },
};
module.exports = nextConfig;
