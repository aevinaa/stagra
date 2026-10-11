import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  isLargePanel?: boolean;
  elevated?: boolean;
}

export function Card({
  children,
  className = '',
  isLargePanel = false,
  elevated = false,
  ...props
}: CardProps) {
  // 12px for regular cards, 14px for large panels per design specification
  const radiusClass = isLargePanel ? 'rounded-[14px]' : 'rounded-[12px]';
  // Surface hierarchy: Primary card is #FAFCFC, elevated important surface is #FFFFFF
  const bgClass = elevated ? 'bg-[#FFFFFF]' : 'bg-[#FAFCFC]';

  return (
    <div
      className={`${bgClass} border border-[#D5E0E4] shadow-subtle ${radiusClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: CardHeaderProps) {
  return (
    <div className={`p-4 border-b border-[#D5E0E4] flex items-center justify-between ${className}`}>
      <div>
        <h3 className="type-card-heading text-[#19323C]">{title}</h3>
        {subtitle && (
          <p className="type-metadata text-[#607780] mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
