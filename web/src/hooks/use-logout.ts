import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { logout } from "../api/auth";
import { ApiClientError } from "../api/client";
import { getErrorMessage } from "./use-error";

interface UseLogoutResult {
  signOut: () => void;
  isSigningOut: boolean;
  logoutError: string | null;
  clearLogoutError: () => void;
}

function useLogout(): UseLogoutResult {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(
    null,
  );

  function completeLogout(message: string) {
    queryClient.clear();

    navigate("/login", {
      replace: true,
      state: {
        message,
      },
    });
  }

  async function performLogout() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setLogoutError(null);

    try {
      await logout();

      completeLogout("You have been signed out.");
    } catch (error) {
      /*
       * 401 means the session is already invalid or expired.
       * There is no authenticated browser state left to preserve.
       */
      if (
        error instanceof ApiClientError &&
        error.status === 401
      ) {
        completeLogout("Your session had already expired.");
        return;
      }

      /*
       * Network error or 5xx:
       * do not claim that server-side revocation succeeded.
       */
      setLogoutError(
        `${getErrorMessage(error)} ` +
          "Your server session may still be active. Please try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  function signOut() {
    void performLogout();
  }

  function clearLogoutError() {
    setLogoutError(null);
  }

  return {
    signOut,
    isSigningOut,
    logoutError,
    clearLogoutError,
  };
}

export { useLogout };
