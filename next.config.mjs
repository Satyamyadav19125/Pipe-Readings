/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from Kobo's attachment server
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kc.kobotoolbox.org' },
      { protocol: 'https', hostname: 'kf.kobotoolbox.org' },
      { protocol: 'https', hostname: 'kobo.humanitarianresponse.info' },
    ],
  },
};

export default nextConfig;
