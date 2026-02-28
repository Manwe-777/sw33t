import "./IconButton.css";

function IconButton({ 
  children, 
  onClick, 
  title, 
  className = "", 
  variant = "default", // default, danger, inline
  size = "md", // sm, md, lg
  active = false,
  disabled = false,
  type = "button",
}) {
  return (
    <button
      type={type}
      className={`icon-btn icon-btn--${variant} icon-btn--${size} ${active ? "active" : ""} ${className}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      <span className="icon-btn__icon">{children}</span>
    </button>
  );
}

export default IconButton;
