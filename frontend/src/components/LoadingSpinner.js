import React from 'react';

function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="relative w-12 h-12 mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-surface-200"></div>
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-scholar-500 animate-spin"></div>
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-accent-violet animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
      </div>
      <p className="text-sm text-surface-500 font-medium">{message}</p>
      <div className="flex items-center gap-1 mt-2">
        <div className="w-1.5 h-1.5 rounded-full bg-scholar-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-1.5 h-1.5 rounded-full bg-scholar-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-1.5 h-1.5 rounded-full bg-scholar-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  );
}

export default LoadingSpinner;
