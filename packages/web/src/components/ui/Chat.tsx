import type { ReactNode } from 'react';

type ChatPosition = 'start' | 'end';

interface ChatBubbleProps {
  position?: ChatPosition;
  avatar?: string;
  header?: ReactNode;
  footer?: ReactNode;
  variant?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
  className?: string;
}

const variantClasses = {
  primary: 'chat-bubble-primary',
  secondary: 'chat-bubble-secondary',
  accent: 'chat-bubble-accent',
  info: 'chat-bubble-info',
  success: 'chat-bubble-success',
  warning: 'chat-bubble-warning',
  error: 'chat-bubble-error',
};

export function ChatBubble({
  position = 'start',
  avatar,
  header,
  footer,
  variant,
  children,
  className = '',
}: ChatBubbleProps) {
  return (
    <div className={`chat ${position === 'start' ? 'chat-start' : 'chat-end'} ${className}`}>
      {avatar && (
        <div className="chat-image avatar">
          <div className="w-10 rounded-full">
            <img alt="Avatar" src={avatar} />
          </div>
        </div>
      )}
      {header && <div className="chat-header">{header}</div>}
      <div className={`chat-bubble ${variant ? variantClasses[variant] : ''}`}>
        {children}
      </div>
      {footer && <div className="chat-footer opacity-50">{footer}</div>}
    </div>
  );
}

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ReactNode;
  timestamp?: string;
  className?: string;
}

const roleConfig: Record<MessageBubbleProps['role'], { position: ChatPosition; variant?: ChatBubbleProps['variant'] }> = {
  user: { position: 'end', variant: 'primary' },
  assistant: { position: 'start', variant: 'secondary' },
  system: { position: 'start', variant: 'info' },
  tool: { position: 'start', variant: 'accent' },
};

export function MessageBubble({ role, content, timestamp, className = '' }: MessageBubbleProps) {
  const config = roleConfig[role];

  return (
    <ChatBubble
      position={config.position}
      variant={config.variant}
      footer={timestamp}
      className={className}
    >
      {content}
    </ChatBubble>
  );
}
