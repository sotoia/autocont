import type { Metadata } from "next";
import { Doto, Space_Grotesk, Space_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Sistema tipográfico Nothing:
//   - Space Grotesk → UI / body
//   - Space Mono    → labels, datos, números (ALL CAPS)
//   - Doto          → hero / brand (dot-matrix variable)
const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Contenido Automático",
  description: "Pipeline IA: OBS → transcripción → motion graphics → timeline DaVinci",
};

// Script inyectado en <head> para fijar el tema ANTES de hidratar y evitar
// el "flash" del modo claro al recargar en oscuro (o viceversa).
const themeBootScript = `
(function() {
  try {
    var saved = localStorage.getItem('autocont.theme');
    var theme = saved || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${spaceMono.variable} ${doto.variable} h-full antialiased`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/* Fuentes seleccionables desde el editor de estilos. Se cargan aquí
            para que la mini-preview del TypographyTab refleje el cambio en
            tiempo real (sin esto la mayoría caen a system font y "no cambia
            nada al cambiar la opción"). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Fira+Code:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-bg text-fg" suppressHydrationWarning>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-fg)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              letterSpacing: "0.04em",
            },
          }}
        />
      </body>
    </html>
  );
}
