import Link from "next/link";
import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { JobStatusBadge } from "@/components/dashboard/status-badge";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, cn } from "@/lib/utils";
import {
  ListChecks,
  ListStart,
  Loader2,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
} from "lucide-react";
import type { Job } from "@/lib/types";

const kindLabels: Record<string, string> = {
  transcribe: "Transcripción Whisper",
  shot_plan: "Shot plan IA",
  stock_match: "Match de stock",
  timeline_export: "Export FCPXML DaVinci",
};

export const dynamic = "force-dynamic";

type StatTone = "queued" | "running" | "done" | "error";

export default function ColaPage() {
  const jobs = repo.listJobs(200);
  const byStatus = {
    queued: jobs.filter((j) => j.status === "queued").length,
    running: jobs.filter((j) => j.status === "running").length,
    done: jobs.filter((j) => j.status === "done").length,
    error: jobs.filter((j) => j.status === "error").length,
  };

  return (
    <>
      <PageHeader
        title="Cola de trabajos"
        description="Todos los pasos del pipeline que procesa el Mac Mini. Se ejecutan en segundo plano cuando hay grabación nueva."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/cola">
              <RefreshCw className="size-4" /> Refrescar
            </Link>
          </Button>
        }
      />

      {/* KPIs — all cards share identical structure so they align 1:1 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="queued"  label="En cola"     value={byStatus.queued}  Icon={ListStart} />
        <StatCard tone="running" label="En curso"    value={byStatus.running} Icon={Loader2} spin={byStatus.running > 0} />
        <StatCard tone="done"    label="Completados" value={byStatus.done}    Icon={CheckCircle2} />
        <StatCard tone="error"   label="Errores"     value={byStatus.error}   Icon={CircleAlert} />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title="La cola está vacía"
          description="Los jobs aparecerán aquí cuando el watcher detecte grabaciones o los dispares manualmente desde un proyecto."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <JobsTable jobs={jobs} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

/* ───────────── sub-components ───────────── */

function StatCard({
  label,
  value,
  tone,
  Icon,
  spin,
}: {
  label: string;
  value: number;
  tone: StatTone;
  Icon: React.ComponentType<{ className?: string }>;
  spin?: boolean;
}) {
  const iconBox =
    tone === "running"
      ? "bg-info/10 text-info ring-info/25"
      : tone === "done"
        ? "bg-accent/10 text-accent ring-accent/25"
        : tone === "error"
          ? value > 0
            ? "bg-danger/10 text-danger ring-danger/25"
            : "bg-bg-hover text-fg-muted ring-border"
          : "bg-bg-hover text-fg-muted ring-border";

  const valueColor =
    tone === "running" && value > 0
      ? "text-info"
      : tone === "error" && value > 0
        ? "text-danger"
        : "text-fg";

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md ring-1",
            iconBox,
          )}
        >
          <Icon className={cn("size-4", spin && "animate-spin")} />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
            {label}
          </div>
          <div className={cn("font-mono text-xl font-semibold tabular-nums", valueColor)}>
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const GRID_COLS =
  "grid grid-cols-[110px_minmax(0,1fr)_110px_minmax(200px,1.2fr)_140px] items-center gap-4 px-5";

function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <>
      {/* Header */}
      <div
        className={cn(
          GRID_COLS,
          "border-b border-border py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle",
        )}
      >
        <div>Tipo</div>
        <div>Descripción</div>
        <div>Estado</div>
        <div>Progreso</div>
        <div className="text-right">Inicio</div>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-border">
        {jobs.map((j) => (
          <li key={j.id} className={cn(GRID_COLS, "min-h-[52px] py-3")}>
            <div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {j.kind}
              </Badge>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-fg">
                {kindLabels[j.kind] ?? j.kind}
              </div>
              {j.error && (
                <div className="mt-0.5 truncate font-mono text-[10px] text-danger">
                  {j.error}
                </div>
              )}
            </div>
            <div>
              <JobStatusBadge status={j.status} />
            </div>
            <div className="flex items-center gap-2.5">
              <Progress value={j.progress * 100} className="h-1.5 flex-1" />
              <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-muted">
                {Math.round(j.progress * 100)}%
              </span>
            </div>
            <div className="text-right font-mono text-[11px] tabular-nums text-fg-muted">
              {j.started_at ? formatDate(j.started_at) : "—"}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
