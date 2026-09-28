import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <h1 className="font-heading text-3xl font-bold">Page not found</h1>
      <p className="text-gray-500">This page does not exist in the replica.</p>
      <Link href="/dashboard" className="font-semibold text-primary-600 hover:underline">Back to Dashboard</Link>
    </div>
  );
}
