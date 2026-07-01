import { ImageResponse } from 'next/og';

// Generates the iOS / PWA icon as a PNG at build time — no file upload needed.
// This is what makes the app "cover" / logo show on phone home screens (#13).
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
          background: 'linear-gradient(135deg, #0ea5e9 0%, #0c4a6e 100%)',
          borderRadius: 36,
          fontSize: 100,
        }}
      >
        💧
      </div>
    ),
    { ...size }
  );
}
