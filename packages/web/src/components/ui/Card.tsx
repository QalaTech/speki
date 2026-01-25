import type { ReactNode, HTMLAttributes } from 'react';

type CardVariant = 'default' | 'bordered' | 'compact' | 'side';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  image?: string;
  imageAlt?: string;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'card bg-base-200',
  bordered: 'card bg-base-200 border border-base-300',
  compact: 'card card-compact bg-base-200',
  side: 'card card-side bg-base-200',
};

export function Card({
  variant = 'default',
  image,
  imageAlt,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div className={`${variantClasses[variant]} ${className}`} {...props}>
      {image && (
        <figure>
          <img src={image} alt={imageAlt || ''} />
        </figure>
      )}
      {children}
    </div>
  );
}

interface CardBodyProps {
  className?: string;
  children: ReactNode;
}

export function CardBody({ className = '', children }: CardBodyProps) {
  return <div className={`card-body ${className}`}>{children}</div>;
}

interface CardTitleProps {
  className?: string;
  children: ReactNode;
}

export function CardTitle({ className = '', children }: CardTitleProps) {
  return <h2 className={`card-title ${className}`}>{children}</h2>;
}

interface CardActionsProps {
  className?: string;
  justify?: 'start' | 'center' | 'end';
  children: ReactNode;
}

export function CardActions({ className = '', justify = 'end', children }: CardActionsProps) {
  const justifyClass = justify === 'start' ? 'justify-start' : justify === 'center' ? 'justify-center' : 'justify-end';
  return <div className={`card-actions ${justifyClass} ${className}`}>{children}</div>;
}
