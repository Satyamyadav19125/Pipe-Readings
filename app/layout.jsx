import './globals.css';
import MobileNav from '@/components/MobileNav';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';

export const metadata = {
  title: 'PVC Pipe Readings · Digital Village Project',
  description: 'Tel Aviv University × Thapar Institute — water-saving research in Punjab agriculture',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PipeReadings' },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#16a34a',
};

// Runs BEFORE paint so the saved theme applies without a white/black flash.
const themeInit = `try{if(localStorage.getItem('wmd-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default async function RootLayout({ children }) {
  let user = null;
  let formUploadUrl = '';
  try {
    user = await getCurrentUser();
    const settings = await getSettings();
    formUploadUrl = settings?.project?.formUploadUrl || '';
  } catch {}

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="apple-touch-icon" href="/apple-icon" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen flex flex-col">
        <MobileNav user={user} formUploadUrl={formUploadUrl} />
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 pb-20">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
