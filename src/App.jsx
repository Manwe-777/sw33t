import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import HomePage from "./components/HomePage";
import ChannelPage from "./components/ChannelPage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/c/:channelId" element={<ChannelPage />} />
          <Route path="/c/:channelId/:categoryId" element={<ChannelPage />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
