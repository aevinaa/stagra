import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-[8px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs h-8',
    md: 'px-4 py-2 text-sm h-9',
    lg: 'px-5 py-2.5 text-sm h-10',
  }[size];

  const variantClasses = {
    primary: 'bg-[#2563EB] hover:bg-[#1E40AF] text-white shadow-subtle',
    secondary: 'bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] border border-[#BFDBFE]',
    outline: 'bg-[#F9FBFC] hover:bg-[#F2F6F8] text-[#1E293B] border border-[#D8E0E8] shadow-subtle',
    ghost: 'hover:bg-[#EEF2F5] text-[#5F6F82] hover:text-[#1E293B]',
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
