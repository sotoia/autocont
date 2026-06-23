"use client";
import * as React from "react";
import {
  Folder,
  FolderPlus,
  ArrowLeft,
  Home,
  HardDrive,
  Check,
  Loader2,
  File,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createFolderAction } from "@/lib/actions/system";

type Entry = { name: string; path: string; isDirectory: boolean };
type Shortcut = { name: string; path: string };

interface FolderPickerProps {
  open: boolean;
  initialPath?: string;
  title?: string;
  description?: string;
  onSelect: (path: string) => void;
  onOpenChange: (open: boolean) => void;
}

export function FolderPicker({
  open,
  initialPath,
  title = "Selecciona una carpeta",
  description = "Navega por tu Mac y elige la carpeta destino. También puedes crear una nueva.",
  onSelect,
  onOpenChange,
}: FolderPickerProps) {
  const [currentPath, setCurrentPath] = React.useState<string>(initialPath ?? "");
  const [parent, setParent] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<Entry[]>([]);
  const [shortcuts, setShortcuts] = React.useState<Shortcut[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");

  const load = React.useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo leer la carpeta");
        setLoading(false);
        return;
      }
      setCurrentPath(data.path);
      setParent(data.parent);
      setItems(data.items);
      setShortcuts(data.shortcuts);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    load(initialPath || "");
  }, [open, initialPath, load]);

  async function doCreate() {
    const name = newName.trim();
    if (!name) return;
    const res = await createFolderAction(currentPath, name);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo crear la carpeta");
      return;
    }
    toast.success(`Carpeta "${name}" creada`);
    setNewName("");
    setCreating(false);
    load(currentPath);
  }

  const segments = React.useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    let acc = "";
    return parts.map((p) => {
      acc += "/" + p;
      return { name: p, path: acc };
    });
  }, [currentPath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-xs">{description}</DialogDescription>
          </DialogHeader>
        </div>

        {/* Breadcrumbs + back */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-2">
          <Button
            size="icon"
            variant="ghost"
            disabled={!parent}
            onClick={() => parent && load(parent)}
            title="Subir"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-xs">
            <button
              onClick={() => load("/")}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              <HardDrive className="size-3" />
              Mac
            </button>
            {segments.map((s) => (
              <React.Fragment key={s.path}>
                <ChevronRight className="size-3 shrink-0 text-fg-subtle" />
                <button
                  onClick={() => load(s.path)}
                  className="shrink-0 truncate rounded px-1.5 py-1 font-medium text-fg-muted hover:bg-bg-hover hover:text-fg"
                >
                  {s.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-0">
          {/* Shortcuts */}
          <div className="flex flex-col gap-0.5 border-r border-border p-2">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Accesos
            </div>
            {shortcuts.map((s) => (
              <button
                key={s.path}
                onClick={() => load(s.path)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  "text-fg-muted hover:bg-bg-hover hover:text-fg"
                )}
              >
                <Home className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>

          {/* Contents */}
          <div className="relative flex h-80 flex-col overflow-hidden">
            {loading && (
              <div className="absolute inset-x-0 top-0 flex items-center justify-center bg-bg-card/80 py-2 text-xs text-fg-muted">
                <Loader2 className="mr-2 size-3.5 animate-spin" /> Cargando…
              </div>
            )}
            <ul className="flex-1 overflow-y-auto p-2">
              {items.length === 0 && !loading ? (
                <li className="px-2 py-4 text-center text-xs text-fg-subtle">
                  Carpeta vacía
                </li>
              ) : (
                items.map((item) => (
                  <li key={item.path}>
                    <button
                      onClick={() => item.isDirectory && load(item.path)}
                      disabled={!item.isDirectory}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        item.isDirectory
                          ? "text-fg hover:bg-bg-hover cursor-pointer"
                          : "text-fg-subtle cursor-default opacity-60"
                      )}
                    >
                      {item.isDirectory ? (
                        <Folder className="size-4 shrink-0 text-accent/80" />
                      ) : (
                        <File className="size-4 shrink-0 text-fg-subtle" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {/* Create folder bar */}
            <div className="border-t border-border bg-bg-elevated/60 p-2">
              {creating ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    placeholder="Nombre de la carpeta"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doCreate();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewName("");
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" onClick={doCreate}>
                    Crear
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCreating(true)}
                  className="w-full justify-start"
                >
                  <FolderPlus className="size-3.5" /> Crear carpeta aquí
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <div className="mr-auto flex min-w-0 items-center gap-2 text-xs text-fg-muted">
            <Folder className="size-3.5 text-accent" />
            <span className="truncate font-mono">{currentPath || "—"}</span>
          </div>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onSelect(currentPath);
              onOpenChange(false);
            }}
          >
            <Check className="size-4" /> Seleccionar esta carpeta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
