import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { AUTH_REQUIRED_EVENT } from "../api/client";

function useAuthExpiryRedirect(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleAuthRequired() {
      /*
       * GET /me returns 401 normally when a visitor opens /login.
       * Redirect only when the user is currently inside protected routes.
       */
      if (!location.pathname.startsWith("/app")) {
        return;
      }

      queryClient.clear();

      navigate("/login", {
        replace: true,
        state: {
          message: "Your session expired. Please sign in again.",
        },
      });
    }

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);

    return () => {
      window.removeEventListener(
        AUTH_REQUIRED_EVENT,
        handleAuthRequired,
      );
    };
  }, [location.pathname, navigate, queryClient]);
}

export { useAuthExpiryRedirect };
