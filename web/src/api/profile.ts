import type { User } from "../types";
import { request } from "./client";

interface UserResponse {
  user: User;
}

interface UpdateProfileInput {
  displayName: string;
}

export async function fetchMe(): Promise<User> {
  const result = await request<UserResponse>("/me");
  return result.user;
}

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const result = await request<UserResponse>("/me/profile", {
    method: "PATCH",
    body: input,
  });
  return result.user;
}
