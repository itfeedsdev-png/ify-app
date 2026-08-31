import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type React from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getAuthBootstrapStatus } from "@/client/api";
import { useSettings } from "@/client/hooks/useSettings";

export const OnboardingGate: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      navigate("/offline", { replace: true });
    };
    window.addEventListener("offline", handleOffline);
    return () => window.removeEventListener("offline", handleOffline);
  }, [navigate]);

  useEffect(() => {
    if (
      location.pathname === "/onboarding" ||
      location.pathname === "/sign-in" ||
      location.pathname === "/offline"
    ) {
      setSetupRequired(null);
      return;
    }

    let cancelled = false;
    setSetupRequired(null);

    void (async () => {
      try {
        const bootstrap = await getAuthBootstrapStatus();
        if (!cancelled) setSetupRequired(bootstrap.setupRequired);
      } catch {
        if (!cancelled) setSetupRequired(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (location.pathname === "/onboarding" && !navigator.onLine) {
    return <Navigate to="/offline" replace />;
  }

  if (
    location.pathname === "/onboarding" ||
    location.pathname === "/sign-in" ||
    location.pathname === "/offline"
  ) {
    return null;
  }

  if (setupRequired === null) {
    return null;
  }

  // Onboarding redirect disabled for dev
  // if (setupRequired) {
  //   return <Navigate to="/onboarding" replace />;
  // }

  return <OnboardingRedirect pathname={location.pathname} />;
};

const OnboardingRedirect: React.FC<{ pathname: string }> = ({ pathname }) => {
  const { error } = useSettings();
  const { checking, complete, nextRequirementId } = useOnboardingStatus();

  if (error) {
    if (!navigator.onLine) {
      return <Navigate to="/offline" replace />;
    }
    const status =
      (typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : null) ||
      (typeof error === "object" && error !== null && "code" in error
        ? ((error as { code?: string }).code === "UNAUTHORIZED" ? 401 : null)
        : null);
    if (status === 401) {
      const next = pathname === "/sign-in" ? null : pathname;
      const query = next ? `?next=${encodeURIComponent(next)}` : "";
      return <Navigate to={`/sign-in${query}`} replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  if (checking || complete) {
    return null;
  }

  if (
    nextRequirementId === "resume" &&
    (pathname === "/design-resume" || pathname.startsWith("/design-resume/"))
  ) {
    return null;
  }

  return <Navigate to="/onboarding" replace />;
};
