interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function TabButton({ active, onClick, children, className = '', size = 'md' }: TabButtonProps) {
  const sizeClass = size === 'sm' ? 'tab-sm' : '';

  return (
    <button
      role="tab"
      onClick={onClick}
      className={`tab ${active ? 'tab-active' : ''} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
}
