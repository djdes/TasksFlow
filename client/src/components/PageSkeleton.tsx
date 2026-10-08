import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Загрузка списка" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-5" aria-hidden="true">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-3 py-1">
            <Skeleton className={i % 2 ? "h-4 w-2/3" : "h-4 w-4/5"} />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}

export function PageSkeleton() {
  const [path] = useLocation();
  const dashboard = path === "/dashboard";
  const auth = path === "/" || path === "/login" || path.startsWith("/register") || path.startsWith("/join/");
  const form = auth || path === "/account" || path.includes("settings") || path.includes("/tasks/") || path.includes("/workers/");
  return (
    <div className={dashboard ? "app-layout" : "page-screen"} data-page-skeleton="" role="status" aria-label="Загрузка страницы" aria-busy="true">
      {dashboard && <div className="skeleton-app-header" aria-hidden="true"><Skeleton className="h-9 w-9 rounded-xl" /><div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-36" /></div></div>}
      <div className={dashboard ? "app-content skeleton-content space-y-5" : `page-container skeleton-content ${form ? "skeleton-form" : ""}`} aria-hidden="true">
        {!dashboard && <><Skeleton className="mb-7 h-5 w-28" /><Skeleton className="mb-3 h-8 w-2/3 max-w-80" /><Skeleton className="mb-8 h-4 w-3/4 max-w-96" /></>}
        {dashboard && <><Skeleton className="h-12 w-full rounded-2xl" /><Skeleton className="h-44 w-full rounded-[20px]" /><div className="flex gap-3"><Skeleton className="h-11 w-36 rounded-xl" /><Skeleton className="h-11 w-32 rounded-xl" /></div></>}
        {form ? <div className="rounded-2xl border border-border bg-card p-6 space-y-6">{[0,1,2,3].map(i => <div key={i} className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-11 w-full rounded-xl" /></div>)}<Skeleton className="h-11 w-full rounded-xl" /></div> : <ListSkeleton rows={dashboard ? 5 : 4} />}
      </div>
      <span className="sr-only">Загрузка страницы…</span>
    </div>
  );
}
