import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, JobStatus } from "@/lib/types";

const projectLabels: Record<ProjectStatus, { label: string; variant: "accent" | "warn" | "danger" | "info" | "default" | "success" }> = {
  pending: { label: "En espera", variant: "default" },
  transcribing: { label: "Transcribiendo", variant: "info" },
  planning: { label: "Planificando", variant: "info" },
  assembling: { label: "Montando", variant: "warn" },
  ready: { label: "Listo", variant: "success" },
  failed: { label: "Error", variant: "danger" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, variant } = projectLabels[status];
  const pulsing = status !== "ready" && status !== "failed" && status !== "pending";
  return (
    <Badge variant={variant} className="gap-1.5">
      {pulsing && <span className="pulse-dot inline-block size-1.5 rounded-full bg-current" />}
      {label}
    </Badge>
  );
}

const jobLabels: Record<JobStatus, { label: string; variant: "accent" | "warn" | "danger" | "info" | "default" | "success" }> = {
  queued: { label: "En cola", variant: "default" },
  running: { label: "Procesando", variant: "info" },
  done: { label: "Completado", variant: "success" },
  error: { label: "Error", variant: "danger" },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, variant } = jobLabels[status];
  return (
    <Badge variant={variant} className="gap-1.5">
      {status === "running" && <span className="pulse-dot inline-block size-1.5 rounded-full bg-current" />}
      {label}
    </Badge>
  );
}
