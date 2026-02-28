import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import HomePage from "./components/HomePage";
import ChannelPage from "./components/ChannelPage";
import "./App.css";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/c/:channelId" element={<ChannelPage />} />
            <Route path="/c/:channelId/:categoryId" element={<ChannelPage />} />
          </Routes>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
