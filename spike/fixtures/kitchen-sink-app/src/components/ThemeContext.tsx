import React, { createContext, useContext, useState, type ReactNode } from "react";

export interface ThemeContextValue {
  theme: string;
}

export const ThemeContext = createContext<ThemeContextValue>({ theme: "light" });

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme] = useState("dark");
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

// Context consumer via useContext -- Task 3d's context-map heuristic
// correlates this against ThemeProvider's rendered "ThemeContext.Provider"
// ancestor by matching the createContext() binding's own name.
export function ThemedPanel() {
  const { theme } = useContext(ThemeContext);
  return <div className={`themed-panel ${theme}`}>themed panel ({theme})</div>;
}
