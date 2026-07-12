import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../api/client";

function useHandleApiError() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiClientError) {
        if (error.status === 401) {
          queryClient.clear();
          navigate("/login", {
            state: {
              message: "Session expired. Please sign in again.",
            },
          });
        }
      }
    },
    [navigate, queryClient],
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.apiMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

export { useHandleApiError, getErrorMessage };
