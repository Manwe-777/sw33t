import { createContext, useContext, useState, useEffect } from "react";
import { themes, themeIds, applyTheme, getTheme } from "../themes";

const STORAGE_KEY = "sw33t-theme-settings";

const defaultSettings = {
  themeId: "monokai",
  mode: "dark", // "dark" or "light"
};

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (err) {
    console.error("Failed to load theme settings:", err);
  }
  return defaultSettings;
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save theme settings:", err);
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  // Apply theme on mount and when settings change
  useEffect(() => {
    applyTheme(settings.themeId, settings.mode);
    saveSettings(settings);
  }, [settings]);

  const toggleMode = () => {
    setSettings((prev) => ({
      ...prev,
      mode: prev.mode === "dark" ? "light" : "dark",
    }));
  };

  const setTheme = (themeId) => {
    if (themes[themeId]) {
      setSettings((prev) => ({
        ...prev,
        themeId,
      }));
    }
  };

  const setMode = (mode) => {
    if (mode === "dark" || mode === "light") {
      setSettings((prev) => ({
        ...prev,
        mode,
      }));
    }
  };

  const value = {
    themeId: settings.themeId,
    mode: settings.mode,
    theme: getTheme(settings.themeId),
    themes,
    themeIds,
    toggleMode,
    setTheme,
    setMode,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
