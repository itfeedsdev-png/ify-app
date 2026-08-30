import {
  BarChart3,
  Columns3,
  FilePenLine,
  Home,
  Inbox,
  LayoutDashboard,
  PenLine,
  Settings,
} from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
};

export const NAV_LINKS: NavLink[] = [
  { to: "/overview", label: "Overview", icon: Home },
  {
    to: "/jobs/ready",
    label: "Jobs",
    icon: LayoutDashboard,
    activePaths: [
      "/jobs/ready",
      "/jobs/discovered",
      "/jobs/applied",
      "/jobs/all",
    ],
  },
  {
    to: "/applications/in-progress",
    label: "In Progress",
    icon: Columns3,
    activePaths: ["/applications/in-progress"],
  },
  {
    to: "/design-resume",
    label: "Resume Studio",
    icon: FilePenLine,
    activePaths: ["/design-resume"],
  },
  { to: "/tracking-inbox", label: "Tracking Inbox", icon: Inbox },
  { to: "/post", label: "Post", icon: PenLine, activePaths: ["/post"] },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    activePaths: ["/analytics", "/tracer-links", "/watchlist"],
  },
  // Visa Sponsors hidden for hackathon
  // { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const isNavActive = (
  pathname: string,
  to: string,
  activePaths?: string[],
) => {
  if (pathname === to) return true;
  if (!activePaths) return false;
  return activePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
};
