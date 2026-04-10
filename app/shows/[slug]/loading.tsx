import { Skeleton } from "@/components/ui/skeleton";

export default function ShowLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-8 md:flex-row">
        <Skeleton className="aspect-[2/3] w-56 rounded-xl" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}
