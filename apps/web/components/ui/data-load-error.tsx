import { Button } from "@/components/ui/button";

export function DataLoadError({
  message = "Unable to load this data.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
    >
      <p>{message}</p>
      <Button
        className="bg-white text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
