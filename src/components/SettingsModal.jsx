import { X, Check, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

function ThemePreview({ theme, mode, isSelected, onClick }) {
  const colors = theme[mode];
  
  return (
    <button
      className={`theme-preview ${isSelected ? "theme-preview--selected" : ""}`}
      onClick={onClick}
      title={theme.name}
    >
      <div 
        className="theme-preview__colors"
        style={{ 
          background: colors.bgPrimary,
          borderColor: isSelected ? colors.accent : colors.borderColor,
        }}
      >
        <div 
          className="theme-preview__sidebar" 
          style={{ background: colors.bgSecondary }}
        />
        <div className="theme-preview__content">
          <div 
            className="theme-preview__header" 
            style={{ background: colors.bgSecondary }}
          />
          <div className="theme-preview__body">
            <div 
              className="theme-preview__accent" 
              style={{ background: colors.accent }}
            />
            <div 
              className="theme-preview__text" 
              style={{ background: colors.textMuted }}
            />
            <div 
              className="theme-preview__text theme-preview__text--short" 
              style={{ background: colors.textMuted }}
            />
          </div>
        </div>
      </div>
      <span className="theme-preview__name" style={{ color: isSelected ? colors.accent : undefined }}>
        {theme.name}
        {isSelected && <Check size={14} />}
      </span>
    </button>
  );
}

function SettingsModal({ isOpen, onClose }) {
  const { themeId, mode, themes, themeIds, setTheme, setMode } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <h2>Settings</h2>
        <p className="modal-subtitle">Customize the appearance of Sw33t</p>

        <div className="settings-section">
          <h3>Mode</h3>
          <div className="mode-selector">
            <button
              className={`mode-btn ${mode === "dark" ? "mode-btn--active" : ""}`}
              onClick={() => setMode("dark")}
            >
              <Moon size={18} />
              Dark
            </button>
            <button
              className={`mode-btn ${mode === "light" ? "mode-btn--active" : ""}`}
              onClick={() => setMode("light")}
            >
              <Sun size={18} />
              Light
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Theme</h3>
          <div className="theme-grid">
            {themeIds.map((id) => (
              <ThemePreview
                key={id}
                theme={themes[id]}
                mode={mode}
                isSelected={themeId === id}
                onClick={() => setTheme(id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
