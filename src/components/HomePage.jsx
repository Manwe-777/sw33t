import { useState } from "react";
import { useNavigate } from "react-router-dom";

function HomePage() {
  const [channelInput, setChannelInput] = useState("");
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    const channel = channelInput.trim();
    if (channel) {
      navigate(`/c/${encodeURIComponent(channel)}`);
    }
  };

  return (
    <>
      <header>
        <div className="header-content">
          <div className="header-left">
            <h1>Sw33t</h1>
          </div>
        </div>
      </header>

      <main>
        <div className="home-container">
          <h1>Sw33t</h1>
          <p className="tagline">Decentralized File Sharing</p>

          <div className="join-card">
            <h2>Join a Channel</h2>
            <p>Enter a channel name to connect to the P2P network</p>

            <form className="join-form" onSubmit={handleJoin}>
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="Channel name (e.g., movies)"
              />
              <button type="submit" className="btn btn-primary">Join</button>
            </form>

            <div className="instructions">
              <h4>How it works</h4>
              <ol>
                <li>Enter a channel name and click Join</li>
                <li>Share the URL with others to join the same channel</li>
                <li>All data syncs peer-to-peer, no central server</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default HomePage;
