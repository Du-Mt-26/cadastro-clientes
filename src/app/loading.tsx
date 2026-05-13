export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Icon placeholder */}
              <div className="animate-pulse size-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div>
                {/* Title placeholder */}
                <div className="animate-pulse h-6 w-52 rounded bg-slate-200 dark:bg-slate-700 mb-1.5" />
                {/* Subtitle placeholder */}
                <div className="animate-pulse h-4 w-72 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
            {/* Header buttons placeholder */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="animate-pulse h-8 w-28 rounded-md bg-slate-200 dark:bg-slate-700" />
              <div className="animate-pulse h-8 w-28 rounded-md bg-slate-200 dark:bg-slate-700" />
              <div className="animate-pulse h-8 w-36 rounded-md bg-slate-200 dark:bg-slate-700" />
              <div className="animate-pulse h-8 w-24 rounded-md bg-slate-200 dark:bg-slate-700" />
              <div className="animate-pulse size-8 rounded-md bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1900px] mx-auto w-full px-4 sm:px-6 py-4">
        {/* Stats Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2 mb-3 overflow-hidden">
          {/* Row 1: Key stats */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {[48, 32, 64, 40, 56, 44, 52, 36].map((w, i) => (
              <div key={i} className="animate-pulse h-4 rounded bg-slate-100 dark:bg-slate-700" style={{ width: `${w}px` }} />
            ))}
          </div>
          {/* Row 2: DSV stats */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60">
            {[40, 56, 56, 56, 56].map((w, i) => (
              <div key={i} className="animate-pulse h-5 rounded bg-slate-100 dark:bg-slate-700" style={{ width: `${w}px` }} />
            ))}
          </div>
        </div>

        {/* Hint placeholder */}
        <div className="flex items-center gap-2 mb-3">
          <div className="animate-pulse h-3 w-3 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="animate-pulse h-3 w-96 rounded bg-slate-100 dark:bg-slate-800" />
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2 mb-3">
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap items-center">
            {/* Search input placeholder */}
            <div className="relative flex-1 min-w-[200px]">
              <div className="animate-pulse h-9 w-full rounded-md bg-slate-100 dark:bg-slate-700" />
            </div>
            {/* Select placeholders */}
            {[180, 180, 120, 180, 160, 160, 160].map((w, i) => (
              <div key={i} className="animate-pulse h-9 rounded-md bg-slate-100 dark:bg-slate-700" style={{ width: `${w}px` }} />
            ))}
          </div>
        </div>

        {/* Data Table Skeleton */}
        <div className="border-0 shadow-sm dark:bg-slate-800 bg-white rounded-lg overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: '60vh', minHeight: '200px' }}>
            <table className="border-separate border-spacing-0 w-full">
              <thead>
                <tr>
                  {/* Favorite col header */}
                  <th className="bg-slate-50 dark:bg-slate-800 px-1 py-2.5 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-[7]">
                    <div className="animate-pulse size-3.5 mx-auto rounded bg-slate-200 dark:bg-slate-600" />
                  </th>
                  {/* Column headers */}
                  {Array.from({ length: 12 }).map((_, i) => (
                    <th key={i} className="bg-slate-50 dark:bg-slate-800 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-[5]">
                      <div className="animate-pulse h-3 rounded bg-slate-200 dark:bg-slate-600" style={{ width: `${60 + (i % 3) * 20}px` }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'}>
                    {/* Favorite star cell */}
                    <td className="px-1 py-2 text-center">
                      <div className="animate-pulse size-4 mx-auto rounded bg-slate-200 dark:bg-slate-700" />
                    </td>
                    {Array.from({ length: 12 }).map((_, colIdx) => (
                      <td key={colIdx} className="px-3 py-2">
                        <div
                          className="animate-pulse h-3 rounded bg-slate-100 dark:bg-slate-700"
                          style={{ width: `${40 + ((rowIdx + colIdx) % 5) * 16}px` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-white dark:bg-slate-900 border-t dark:border-slate-700 sticky bottom-0 z-10">
        <div className="max-w-[1900px] mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Pagination info placeholder */}
              <div className="animate-pulse h-3.5 w-48 rounded bg-slate-100 dark:bg-slate-700" />
              {/* Page size select placeholder */}
              <div className="animate-pulse h-7 w-[110px] rounded-md bg-slate-100 dark:bg-slate-700" />
              {/* Copyright placeholder */}
              <div className="animate-pulse h-3 w-40 rounded bg-slate-100 dark:bg-slate-700" />
            </div>
            {/* Pagination controls placeholder */}
            <div className="flex items-center gap-1">
              <div className="animate-pulse h-8 w-16 rounded-md bg-slate-100 dark:bg-slate-700" />
              <div className="animate-pulse size-8 rounded-md bg-slate-100 dark:bg-slate-700" />
              <div className="animate-pulse h-4 w-14 rounded bg-slate-100 dark:bg-slate-700 mx-1" />
              <div className="animate-pulse size-8 rounded-md bg-slate-100 dark:bg-slate-700" />
              <div className="animate-pulse h-8 w-16 rounded-md bg-slate-100 dark:bg-slate-700" />
              <div className="animate-pulse h-4 w-8 rounded bg-slate-100 dark:bg-slate-700 ml-2" />
              <div className="animate-pulse h-8 w-14 rounded-md bg-slate-100 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
