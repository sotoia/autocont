/* eslint-disable react/no-unescaped-entities */
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { Creation } from "./types";
import { CREATION_KIND_LABELS, CREATION_DURATIONS } from "./types";

// react-pdf usa Helvetica por defecto si no registramos fuente, y eso ya
// soporta acentos castellanos. No registramos custom fonts para evitar
// dependencia de fetch externo en runtime del server.
const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5, color: "#1a1a1a" },
  header: { borderBottomWidth: 2, borderBottomColor: "#00a77a", paddingBottom: 14, marginBottom: 22 },
  brand: { fontSize: 9, color: "#6b7280", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#0f172a", lineHeight: 1.25, marginBottom: 6 },
  meta: { flexDirection: "row", gap: 12, fontSize: 9, color: "#6b7280", marginTop: 4 },
  metaTag: { backgroundColor: "#ecfdf5", color: "#065f46", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  sectionLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#065f46", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 8, marginTop: 18 },
  paragraph: { fontSize: 11, marginBottom: 10, color: "#1f2937" },
  scriptBlock: { fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.65, color: "#111827" },
  pageFooter: { position: "absolute", bottom: 28, left: 56, right: 56, fontSize: 8, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

export function CreationPdf({ creation }: { creation: Creation }) {
  const dur = CREATION_DURATIONS[creation.kind];
  const date = new Date(creation.updated_at + "Z").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  // Partir el guion en párrafos por línea vacía para mejor legibilidad
  const scriptParagraphs = (creation.script || "(guion vacío)").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const descriptionParagraphs = (creation.description || "(sin descripción)").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <Document
      title={creation.title || "Creación AUTOCONT"}
      author="AUTOCONT"
      subject={`Guion · ${CREATION_KIND_LABELS[creation.kind]}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.brand}>AUTOCONT · Creación</Text>
          <Text style={styles.title}>{creation.title || "(sin título)"}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaTag}>{CREATION_KIND_LABELS[creation.kind]}</Text>
            <Text>Duración objetivo: {dur.label}</Text>
            <Text>Última edición: {date}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Descripción del vídeo</Text>
        {descriptionParagraphs.map((p, i) => (
          <Text key={`d-${i}`} style={styles.paragraph}>{p}</Text>
        ))}

        {creation.notes ? (
          <>
            <Text style={styles.sectionLabel}>Notas</Text>
            <Text style={styles.paragraph}>{creation.notes}</Text>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Guion completo</Text>
        {scriptParagraphs.map((p, i) => (
          <Text key={`s-${i}`} style={styles.scriptBlock} wrap>
            {p}
            {"\n"}
          </Text>
        ))}

        <View fixed style={styles.pageFooter} render={({ pageNumber }) => (
          <>
            <Text>{creation.title || "Creación AUTOCONT"}</Text>
            <Text>Pág. {pageNumber}</Text>
          </>
        )} />
      </Page>
    </Document>
  );
}
