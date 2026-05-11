import React from "react";

const Heart = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M20.5 8.75C20.5 14.25 12 19 12 19S3.5 14.25 3.5 8.75C3.5 6.4 5.32 4.5 7.58 4.5C9.02 4.5 10.29 5.25 11 6.39C11.71 5.25 12.98 4.5 14.42 4.5C16.68 4.5 20.5 6.4 20.5 8.75Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default Heart;
