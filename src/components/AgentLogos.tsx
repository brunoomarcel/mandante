import React from "react";

export const GeminiLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 24C12 17.3726 17.3726 12 24 12C17.3726 12 12 6.62742 12 0C12 6.62742 6.62742 12 0 12C6.62742 12 12 17.3726 12 24Z"
      fill="url(#geminiGrad)"
    />
    <defs>
      <linearGradient id="geminiGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1A73E8" />
        <stop offset="0.5" stopColor="#A142F4" />
        <stop offset="1" stopColor="#E52592" />
      </linearGradient>
    </defs>
  </svg>
);

export const ClaudeLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L14.4 8.6H21.5L15.8 12.8L18.1 19.4L12 15.1L5.9 19.4L8.2 12.8L2.5 8.6H9.6L12 2Z"
      fill="#D97757"
    />
  </svg>
);

export const OpenAILogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2594 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.747-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0807 4.7992-2.7713a.796.796 0 0 0 .3994-.6907v-6.7663l2.028 1.171a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.5298 4.5441zM3.4876 18.2577a4.47 4.47 0 0 1-.5351-3.0031l.142.0855 4.7992 2.7665a.796.796 0 0 0 .7987 0l5.8608-3.382v2.342a.071.071 0 0 1-.0285.057l-4.8372 2.7904a4.5045 4.5045 0 0 1-6.1999-1.6562zm-1.32-9.761a4.47 4.47 0 0 1 2.3414-1.9622v5.7013a.796.796 0 0 0 .3994.6907l5.8608 3.382-2.028 1.171a.071.071 0 0 1-.0665.0047L3.8374 14.693a4.5045 4.5045 0 0 1-1.6698-6.1963zm16.6416-2.5186l-4.7992 2.7665a.796.796 0 0 0-.3994.6907v6.7663l-2.028-1.171a.071.071 0 0 1-.038-.052V9.395a4.5045 4.5045 0 0 1 7.4068-3.504l-.142-.0807zM19.5124 5.7423a4.47 4.47 0 0 1 .5351 3.0031l-.142-.0855-4.7992-2.7665a.796.796 0 0 0-.7987 0l-5.8608 3.382V6.9334a.071.071 0 0 1 .0285-.057l4.8372-2.7904a4.5045 4.5045 0 0 1 6.1999 1.6562zm1.32 9.761a4.47 4.47 0 0 1-2.3414 1.9622V11.764a.796.796 0 0 0-.3994-.6907l-5.8608-3.382 2.028-1.171a.071.071 0 0 1 .0665-.0047l4.8372 2.7904a4.5045 4.5045 0 0 1 1.6698 6.1963z"/>
  </svg>
);

export const OpenCodeLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#10B981"/>
    <path d="M7 9L4 12L7 15M17 9L20 12L17 15M14 7L10 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const AiderLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#F43F5E"/>
    <path d="M13 3L4 14H12L11 21L20 10H12L13 3Z" fill="white"/>
  </svg>
);

export const EmptyTerminalLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#2563EB"/>
    <path d="M7 9L10 12L7 15M12 15H17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
