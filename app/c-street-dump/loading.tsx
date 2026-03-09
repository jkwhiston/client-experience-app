export default function CStreetDumpLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <div className="h-8 w-52 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <div className="mb-4 h-6 w-28 animate-pulse rounded-md bg-muted" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((__, cardIndex) => (
                    <div key={cardIndex} className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="mt-3 h-14 animate-pulse rounded bg-muted/70" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="mb-4 h-6 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-32 animate-pulse rounded-xl bg-muted/70" />
          </div>
        </div>
      </div>
    </div>
  )
}
