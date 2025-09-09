"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem("token");
      const user = localStorage.getItem("user");

      if (!token || !user) {
        setIsAuthenticated(false);
        const redirect = searchParams.get("redirect") || "/";
        router.push(`/signin?redirect=${encodeURIComponent(redirect)}`);
        return;
      }

      try {
        // Basic token validation (you might want to add more sophisticated validation)
        const userData = JSON.parse(user);
        if (!userData.id || !userData.email) {
          throw new Error("Invalid user data");
        }
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Invalid user data:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setIsAuthenticated(false);
        const redirect = searchParams.get("redirect") || "/";
        router.push(`/signin?redirect=${encodeURIComponent(redirect)}`);
      }
    };

    checkAuth();
  }, [router, searchParams]);

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  // Show children only if authenticated
  return isAuthenticated ? <>{children}</> : null;
}
