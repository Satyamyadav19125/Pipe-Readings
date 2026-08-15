import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Landing from '@/components/Landing';

export const dynamic = 'force-dynamic';

// The shareable GUEST link. Anyone who opens it sees the genericised landing
// (no university names, research blurb, or "PVC"/"AWD" wording — all controlled
// by the admin in Settings) and logs in with the guest password.
// Already-logged-in users are sent straight to the dashboard.
export default async function GuestLandingPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <Landing variant="guest" />;
}
