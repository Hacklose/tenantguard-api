import { request } from "./client";

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthMessage {
  message: string;
}

export async function register(input: RegisterInput): Promise<AuthMessage> {
  return request<AuthMessage>("/auth/register", {
    method: "POST",
    body: input,
  });
}

export async function login(input: LoginInput): Promise<AuthMessage> {
  return request<AuthMessage>("/auth/login", {
    method: "POST",
    body: input,
  });
}

export async function logout(): Promise<void> {
  return request<void>("/auth/logout", {
    method: "POST",
  });
}
