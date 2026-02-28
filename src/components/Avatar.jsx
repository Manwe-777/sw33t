import { useMemo } from "react";

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateColors(seed) {
  const hash = hashCode(seed);
  
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;
  
  const sat1 = 60 + (hash % 30);
  const sat2 = 50 + ((hash * 3) % 40);
  
  const light1 = 45 + (hash % 20);
  const light2 = 35 + ((hash * 2) % 25);
  
  return {
    color1: `hsl(${hue1}, ${sat1}%, ${light1}%)`,
    color2: `hsl(${hue2}, ${sat2}%, ${light2}%)`,
    angle: (hash * 13) % 360,
  };
}

function Avatar({ 
  seed, 
  src, 
  name, 
  size = 40, 
  className = "",
  style = {},
  showInitial = true,
}) {
  const colors = useMemo(() => generateColors(seed || name || "default"), [seed, name]);
  
  const initial = useMemo(() => {
    if (!showInitial) return null;
    if (name) return name[0].toUpperCase();
    if (seed) return seed[0].toUpperCase();
    return "?";
  }, [name, seed, showInitial]);

  const avatarStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: size * 0.4,
    color: "#fff",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    overflow: "hidden",
    ...style,
  };

  if (src) {
    return (
      <div className={`avatar ${className}`} style={avatarStyle}>
        <img 
          src={src} 
          alt={name || "avatar"} 
          style={{ 
            width: "100%", 
            height: "100%", 
            objectFit: "cover" 
          }} 
          onError={(e) => {
            e.target.style.display = "none";
            e.target.parentElement.style.background = `linear-gradient(${colors.angle}deg, ${colors.color1}, ${colors.color2})`;
          }}
        />
      </div>
    );
  }

  return (
    <div 
      className={`avatar ${className}`} 
      style={{
        ...avatarStyle,
        background: `linear-gradient(${colors.angle}deg, ${colors.color1}, ${colors.color2})`,
      }}
    >
      {initial}
    </div>
  );
}

export function ChannelAvatar({ channel, size = 48, src, className = "" }) {
  return (
    <Avatar 
      seed={`channel-${channel}`}
      name={channel}
      size={size}
      src={src}
      className={className}
    />
  );
}

export function CategoryAvatar({ category, size = 32, src, className = "" }) {
  return (
    <Avatar 
      seed={`category-${category}`}
      name={category}
      size={size}
      src={src}
      className={className}
    />
  );
}

export function UserAvatar({ address, name, size = 36, src, className = "" }) {
  return (
    <Avatar 
      seed={address || name || "anon"}
      name={name}
      size={size}
      src={src}
      className={className}
    />
  );
}

export default Avatar;
