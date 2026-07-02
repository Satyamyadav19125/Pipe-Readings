import { ImageResponse } from 'next/og';

// Generates the iOS / PWA home-screen icon as a PNG at build time — no file
// upload needed. An AWD observation pipe with a water level, on a green→blue
// (field + water) background, so it's clearly distinct from the water-meter app.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #16a34a 0%, #0369a1 100%)',
          borderRadius: 40,
        }}
      >
        {/* pipe body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            width: 58,
            height: 122,
            background: '#f8fafc',
            border: '6px solid #e2e8f0',
            borderRadius: 18,
            overflow: 'hidden',
          }}
        >
          {/* water level inside the pipe */}
          <div style={{ display: 'flex', width: '100%', height: 54, background: '#0284c7' }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
