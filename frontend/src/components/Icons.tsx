import React from 'react';

export const FacebookIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

export const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-2.891 2.892 2.896 2.896 0 0 1-2.892-2.892 2.896 2.896 0 0 1 2.892-2.891c.29 0 .567.042.83.12V9.378a6.347 6.347 0 0 0-.83-.056 6.338 6.338 0 0 0-6.336 6.34 6.338 6.338 0 0 0 6.336 6.338 6.338 6.338 0 0 0 6.336-6.338V9.014c1.107.75 2.446 1.196 3.882 1.233V6.78a4.836 4.836 0 0 1-.112-.094z" />
  </svg>
);
