"use client";
import * as React from "react";
import {
  KeyRound,
  Eye,
  EyeOff,
  FolderOpen,
  FolderSearch,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Settings } from "@/lib/types";
import { updateSettingsAction } from "@/lib/actions/settings";
import { openInFinderAction } from "@/lib/actions/system";
import { FolderPicker } from "@/components/dashboard/folder-picker";
import {
  useDebouncedSave,
  SaveStatusIndicator,
} from "@/lib/use-debounced-save";

interface Props {
  settings: Settings;
}

/**
 * SettingsForm v0.1 — solo lo imprescindible para que el pipeline funcione:
 *   1) Paths del watcher (OBS, proyectos, stock local, música local)
 *   2) Anthropic API key (Claude — única IA externa)
 *   3) Modelo Claude + modelo Whisper
 *   4) Toggles del pipeline (auto-procesar, exportar FCPXML)
 */
export function SettingsForm({ settings }: Props) {
  const [form, setForm] = React.useState(settings);
  const [showKey, setShowKey] = React.useState(false);

  const { status, lastSavedAt, error } = useDebouncedSave({
    value: form,
    initial: settings,
    save: async (v) => {
      await updateSettingsAction(v);
    },
    delay: 700,
  });

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ─── 1) Claude API key (lo primero porque sin esto no funciona nada) ── */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <KeyRound className="size-3.5" /> IA · Claude
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              La clave de Anthropic Claude es lo único que necesitas para que el sistema
              funcione: transcribe el audio, propone qué stock encaja en cada bloque y
              monta el timeline en DaVinci. Se guarda en SQLite local (
              <code className="rounded bg-bg-elevated px-1 py-0.5 text-xs">data/app.db</code>
              ) y nunca sale de tu máquina.
            </p>
          </div>
          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Anthropic API key</Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="sk-ant-..."
                value={form.claude_api_key}
                onChange={(e) => update("claude_api_key", e.target.value)}
                className="pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                title={showKey ? "Ocultar" : "Mostrar"}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-fg-subtle">
              Consíguela en{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                console.anthropic.com
              </a>
              . El primer crédito de prueba es gratis.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Modelo Claude</Label>
              <Select
                value={form.claude_model}
                onValueChange={(v) => update("claude_model", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-opus-4-7">Opus 4.7 — máxima calidad</SelectItem>
                  <SelectItem value="claude-sonnet-4-6">Sonnet 4.6 — equilibrado</SelectItem>
                  <SelectItem value="claude-haiku-4-5-20251001">Haiku 4.5 — rápido y barato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Modelo Whisper (transcripción local)</Label>
              <Select
                value={form.whisper_model}
                onValueChange={(v) => update("whisper_model", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="large-v3">large-v3 — mejor</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="small">small — rápido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── 2) Rutas del watcher ────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <FolderOpen className="size-3.5" /> Rutas del sistema
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              El watcher vigila la carpeta OBS y, al detectar una nueva grabación,
              arranca el pipeline (transcribir → proponer stock → exportar timeline).
            </p>
          </div>
          <Separator />
          <div className="grid gap-4">
            <PathField
              label="Carpeta OBS vigilada"
              help="Al aparecer un .mp4/.mov nuevo aquí, se crea un proyecto automáticamente."
              value={form.obs_watch_path}
              onChange={(v) => update("obs_watch_path", v)}
            />
            <PathField
              label="Carpeta de proyectos"
              help="Donde se crean las subcarpetas YYYY-MM-DD_nombre/."
              value={form.projects_path}
              onChange={(v) => update("projects_path", v)}
            />
            <PathField
              label="Biblioteca de stock local"
              help="Organizada por subcarpetas-etiqueta. Se indexan .mp4/.mov/.mkv."
              value={form.stock_path}
              onChange={(v) => update("stock_path", v)}
            />
            <PathField
              label="Biblioteca de música local"
              help="Archivos .mp3/.wav/.m4a que pueden ir de fondo."
              value={form.music_path}
              onChange={(v) => update("music_path", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── 3) Comportamiento del pipeline ──────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              Comportamiento del pipeline
            </div>
          </div>
          <Separator />

          <ToggleRow
            title="Procesar automáticamente"
            description="Al detectar nueva grabación, inicia transcripción → propuesta de stock → timeline sin intervención."
            checked={Boolean(form.auto_process)}
            onChange={(v) => update("auto_process", v ? 1 : 0)}
          />
          <ToggleRow
            title="Exportar a DaVinci (FCPXML)"
            description="Genera un timeline editable que abres en DaVinci Resolve con el stock ya colocado."
            checked={Boolean(form.davinci_export)}
            onChange={(v) => update("davinci_export", v ? 1 : 0)}
          />
        </CardContent>
      </Card>

      {/* ─── Footer status ──────────────────────────────────────────────── */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-card/95 px-4 py-3 backdrop-blur">
        <SaveStatusIndicator status={status} lastSavedAt={lastSavedAt} error={error} />
        <span className="text-xs text-fg-subtle">
          Cambios persistidos en SQLite automáticamente
        </span>
      </div>
    </div>
  );
}

function PathField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  async function openFinder() {
    if (!value) {
      toast.error("Define primero una ruta");
      return;
    }
    const res = await openInFinderAction(value);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo abrir Finder");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono text-xs"
        />
        <Button
          type="button"
          variant="secondary"
          size="default"
          onClick={() => setPickerOpen(true)}
        >
          <FolderSearch className="size-4" />
          Examinar…
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={openFinder}
          title="Abrir en Finder"
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">{help}</p>

      <FolderPicker
        open={pickerOpen}
        initialPath={value || undefined}
        title={label}
        onSelect={(p) => onChange(p)}
        onOpenChange={setPickerOpen}
      />
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-bg-elevated p-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-fg-muted">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
