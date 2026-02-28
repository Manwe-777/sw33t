import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      className="theme-toggle"
      onClick={toggleMode}
      title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
    >
      {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default ThemeToggle;
