import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF7",
        ink: {
          DEFAULT: "#12233D",
          soft: "#31435E",
          faint: "#64748B",
        },
        cargo: {
          DEFAULT: "#E8590C",
          dark: "#C2410C",
          tint: "#FFF1E6",
        },
        console: {
          DEFAULT: "#0E1B2C",
          line: "#1E2F47",
          green: "#4ADE80",
          amber: "#FBBF24",
          red: "#F87171",
          dim: "#7D8CA3",
        },
        line: "#D8DAD3",
      },
      fontFamily: {
        display: ['"Archivo Variable"', "Archivo", "system-ui", "sans-serif"],
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: {
        wrap: "72rem",
      },
    },
  },
  plugins: [],
};
export default config;
