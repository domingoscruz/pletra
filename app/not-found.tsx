import Link from "@/components/ui/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="text-center">
        <h2 className="text-4xl font-bold">404</h2>
        <p className="mt-2 text-muted">Page not found</p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
