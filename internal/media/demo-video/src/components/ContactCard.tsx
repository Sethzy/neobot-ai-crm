// ContactCard - CRM-style contact card matching reference design
// Header: status pill + deal value | Body: avatar+name, company, email, phone

import React from "react";
import { geist } from "../fonts";

export type ContactInfo = {
  name: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  dealValue: string;
  avatarColor: string;
};

export type ContactCardProps = {
  contact: ContactInfo;
  width?: number;
  headerOpacity?: number;
};

// Small SVG icons for each row
const CompanyIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
  </svg>
);

const EmailIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </svg>
);

const PhoneIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const SparkleIcon: React.FC = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    <path d="M19 15l.5 1.5L21 17l-1.5.5L19 19l-.5-1.5L17 17l1.5-.5L19 15z" />
  </svg>
);

export const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  width = 240,
  headerOpacity = 1,
}) => {
  const { name, company, email, phone, status, dealValue, avatarColor } = contact;

  // Get initials from name
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <div style={{ width, fontFamily: geist }}>
      {/* Header: status pill + deal value */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          padding: "0 2px",
          opacity: headerOpacity,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#52525B",
            border: "1.5px solid #D4D4D8",
            borderRadius: 12,
            padding: "3px 10px",
            whiteSpace: "nowrap",
          }}
        >
          {status}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#18181B",
            letterSpacing: "-0.01em",
          }}
        >
          {dealValue}
        </div>
      </div>

      {/* Card body */}
      <div
        style={{
          border: "1.5px solid #D4D4D8",
          borderRadius: 10,
          padding: 14,
          backgroundColor: "white",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Name row: avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: avatarColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: "white",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {initials}
            </span>
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#18181B",
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </span>
        </div>

        {/* Company row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CompanyIcon />
          <span style={{ fontSize: 12, fontWeight: 400, color: "#3F3F46" }}>
            {company}
          </span>
        </div>

        {/* Email row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <EmailIcon />
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#3F3F46",
              flex: 1,
            }}
          >
            {email}
          </span>
          <SparkleIcon />
        </div>

        {/* Phone row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PhoneIcon />
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#3F3F46",
              flex: 1,
            }}
          >
            {phone}
          </span>
          <SparkleIcon />
        </div>
      </div>
    </div>
  );
};
