export function PlaceholderPanel({ message }: { message: string }) {
  return (
    <div className="border-border text-muted rounded-xl border-2 border-dashed p-8 text-center text-lg">
      {message}
    </div>
  );
}
