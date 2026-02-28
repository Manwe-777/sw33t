import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";

function AuthModal({ isOpen, onClose, onSuccess }) {
  const [mode, setMode] = useState("signin"); // signin, signup, import
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef(null);

  const {
    signUp,
    signIn,
    anonSignIn,
    importKeys,
    isLoading,
    error,
  } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          setLocalError("Passwords do not match");
          return;
        }
        if (password.length < 4) {
          setLocalError("Password must be at least 4 characters");
          return;
        }
        await signUp(username, password);
      } else if (mode === "signin") {
        await signIn(username, password);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const handleAnonymous = async () => {
    setLocalError("");
    try {
      await anonSignIn();
      onSuccess?.();
      onClose();
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const encryptedAccount = JSON.parse(text);

      if (!encryptedAccount.name || !encryptedAccount.keys || !encryptedAccount.iv) {
        setLocalError("Invalid key file format");
        return;
      }

      setUsername(encryptedAccount.name);
      setMode("import");
      window._pendingImport = encryptedAccount;
    } catch {
      setLocalError("Failed to read key file");
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");

    if (!window._pendingImport) {
      setLocalError("No key file loaded");
      return;
    }

    try {
      await importKeys(window._pendingImport, password);
      delete window._pendingImport;
      onSuccess?.();
      onClose();
    } catch (err) {
      setLocalError(err.message || "Wrong password or corrupted file");
    }
  };

  if (!isOpen) return null;

  const displayError = localError || error;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <h2>
          {mode === "signup" && "Create Account"}
          {mode === "signin" && "Sign In"}
          {mode === "import" && "Import Keys"}
        </h2>

        {mode === "import" ? (
          <form onSubmit={handleImportSubmit}>
            <p className="import-info">
              Importing keys for: <strong>{username}</strong>
            </p>
            <div className="form-group">
              <label>Password (used when exporting)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            {displayError && <p className="error">{displayError}</p>}
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Importing..." : "Import Keys"}
            </button>
            <button type="button" className="secondary" onClick={() => setMode("signin")}>
              Cancel
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            {mode === "signup" && (
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  required
                />
              </div>
            )}
            {displayError && <p className="error">{displayError}</p>}
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Loading..." : mode === "signup" ? "Create Account" : "Sign In"}
            </button>
          </form>
        )}

        {mode !== "import" && (
          <div className="auth-footer">
            <div className="auth-toggle">
              {mode === "signin" ? (
                <p>
                  Don't have an account?{" "}
                  <button type="button" onClick={() => setMode("signup")}>
                    Sign Up
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{" "}
                  <button type="button" onClick={() => setMode("signin")}>
                    Sign In
                  </button>
                </p>
              )}
            </div>
            <div className="auth-options">
              <button type="button" className="anon-btn" onClick={handleAnonymous}>
                Continue Anonymously
              </button>
              <div className="import-section">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileImport}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="import-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import Keys from File
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthModal;
